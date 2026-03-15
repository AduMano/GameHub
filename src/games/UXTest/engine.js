
(async function init() {
    const canvas = document.getElementById("gameCanvas");
    const ctx = canvas.getContext("2d");
    const loadingUI = document.getElementById("loading");
    const transitionOverlay = document.getElementById("transitionOverlay");

    try {
        const response = await fetch("data.kineme");
        const buffer = await response.arrayBuffer();
        const resources = MessagePack.decode(buffer);

        const findItems = (type, arr) => {
            let res = [];
            arr.forEach(item => {
                if (item.icon === type) res.push(item);
                if (item.subDirectory) res = res.concat(findItems(type, item.subDirectory));
            });
            return res;
        };

        const scripts = findItems("Script", resources);
        const sprites = findItems("Image", resources);
        const objects = findItems("Object", resources);
        const rooms = findItems("Room", resources);
        const sounds = findItems("Sound", resources);

        const defaultRoom = rooms.find((r) => r.data?.roomProps?.isDefault) || rooms[0];
        if (!defaultRoom) throw new Error("No rooms found in project.");

        let globalCode = "";
        
        globalCode += 'window.Sprites = {\n';
        sprites.forEach(s => {
            const cleanName = s.label.replace(/[^a-zA-Z0-9_]/g, "");
            globalCode += '  "' + cleanName + '": "' + s.id + '",\n';
        });
        globalCode += '};\nwindow.Sprite = window.Sprites;\n';

        globalCode += 'window.Objects = {\n';
        objects.forEach(o => {
            const cleanName = o.label.replace(/[^a-zA-Z0-9_]/g, "");
            globalCode += '  "' + cleanName + '": "' + o.id + '",\n';
        });
        globalCode += '};\n';

        globalCode += 'window.Sounds = {\n';
        sounds.forEach(snd => {
            const cleanName = snd.label.replace(/[^a-zA-Z0-9_]/g, "");
            globalCode += '  "' + cleanName + '": "' + snd.id + '",\n';
        });
        globalCode += '};\n';

        globalCode += 'window.SpriteProps = {\n';
        sprites.forEach(s => {
            const sp = s.data?.spriteProps || {};
            const code = s.data?.composerCode || `return Array.from({length: ${(sp.rows || 1) * (sp.cols || 1)}}, (_, i) => ({index: i}));`;
            globalCode += '  "' + s.id + '": { offsetX: ' + (sp.offsetX || 0) + ', offsetY: ' + (sp.offsetY || 0) + ', originX: ' + (sp.originX || 0) + ', originY: ' + (sp.originY || 0) + ', width: ' + (sp.width || 32) + ', height: ' + (sp.height || 32) + ', gap: ' + (sp.gap || 0) + ', rows: ' + (sp.rows || 1) + ', cols: ' + (sp.cols || 1) + ', fps: ' + (sp.fps || 15) + ', frames: (function(){ try { ' + code + ' } catch(e){ return [{index:0}]; } })() },\n';
        });
        globalCode += '};\n';

        globalCode += 'window.Save = { prefix: "kineme_save_", set: function(k, v) { try { localStorage.setItem(this.prefix + k, JSON.stringify(v)); } catch(e){} }, get: function(k, d = null) { try { const i = localStorage.getItem(this.prefix + k); return i === null ? d : JSON.parse(i); } catch(e) { return d; } }, delete: function(k) { localStorage.removeItem(this.prefix + k); }, clearAll: function() { const r = []; for(let i=0; i<localStorage.length; i++){ const k = localStorage.key(i); if(k && k.startsWith(this.prefix)) r.push(k); } r.forEach(k => localStorage.removeItem(k)); } };\n';

        scripts.forEach(script => {
            if (script.data?.code) {
                const pureCode = script.data.code.replace(/^export\s+const\s+\w+\s+=\s+`/, "").replace(/`;\s*$/, "");
                globalCode += '\n/* --- ' + script.label + ' --- */\n' + pureCode + '\n';
            }
        });

        const scriptTag = document.createElement("script");
        scriptTag.innerHTML = globalCode;
        document.head.appendChild(scriptTag);

        const imageCache = {};
        window.AudioCache = {};
        const loadPromises = [];

        sprites.forEach(sprite => {
            const assetId = sprite.data?.assetId;
            if (assetId) {
                loadPromises.push(new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => resolve();
                    img.onerror = () => resolve(); 
                    img.src = "assets/" + assetId;
                    imageCache[assetId] = img;
                }));
            }
        });

        sounds.forEach(sound => {
            const assetId = sound.data?.assetId;
            if (assetId) window.AudioCache[assetId] = "assets/" + assetId; 
        });

        await Promise.all(loadPromises);

        let activeRoomId = defaultRoom.id;
        let isRunning = true;
        let roomData = defaultRoom.data;

        let liveInstances = [];
        let roomContext = {};
        let roomStepFunc = () => {};

        const bootRoom = () => {
            liveInstances = [];
            
            // Apply HD Render Pipeline scaling
            const HD_SCALE = 4;
            canvas.width = roomData.camera.width * HD_SCALE;
            canvas.height = roomData.camera.height * HD_SCALE;
            ctx.imageSmoothingEnabled = false;

            if (window.Camera) {
                window.Camera.x = camData.x;
                window.Camera.y = camData.y;
                window.Camera.width = camData.width;
                window.Camera.height = camData.height;
                // NEW: Tell InputManager what the original room camera size is for fixed GUIs
                window.Camera.baseWidth = camData.width;  
                window.Camera.baseHeight = camData.height;
                
                window.Camera.roomWidth = roomProps.width;
                window.Camera.roomHeight = roomProps.height;
                window.Camera.panDelay = camData.panDelay ?? 0.1;
            }

            window._GUI_LAYERS = {};
            roomData.layers.forEach(l => {
                if (l.type === "gui") window._GUI_LAYERS[l.id || ""] = !!l.fixOnScale;
            });

            roomData.layers.forEach((layer, layerIndex) => {
                const safeLayerId = layer.id || "layer_" + layerIndex;
                if ((layer.type === "instances" || layer.type === "gui") && layer.visible && layer.instances) {
                    layer.instances.forEach(inst => {
                        const baseObj = objects.find(o => o.id === inst.objectId);
                        if (!baseObj) return;

                        const spriteResource = baseObj.data?.spriteId ? sprites.find(s => s.id === baseObj.data.spriteId) : null;
                        const sprProps = spriteResource?.data?.spriteProps || null;

                        const definedMask = (baseObj.data?.masks && baseObj.data.masks.length > 0) 
                          ? baseObj.data.masks[0] 
                          : baseObj.data?.mask;

                        const liveObj = {
                            id: inst.id,
                            objectId: baseObj.id,
                            layerId: safeLayerId,
                            sprite: baseObj.data?.spriteId || null,
                            x: inst.x, y: inst.y,
                            width: sprProps?.width || 32, height: sprProps?.height || 32,
                            scaleX: 1, scaleY: 1, angle: 0, alpha: 1, animationSpeed: 1, currentFrame: 0,
                            mask: definedMask ? {
                                offsetX: definedMask.offsetX,
                                offsetY: definedMask.offsetY,
                                width: definedMask.width,
                                height: definedMask.height
                            } : {
                                offsetX: sprProps ? -sprProps.originX : 0,
                                offsetY: sprProps ? -sprProps.originY : 0,
                                width: sprProps?.width || 32,
                                height: sprProps?.height || 32,
                            },
                            visible: true, _destroyed: false,
                            destroy: function() { this._destroyed = true; }
                        };

                        try {
                            const onCreateFunc = new Function("self", baseObj.data?.events?.onCreate || "");
                            const onStepFunc = new Function("self", baseObj.data?.events?.onStep || "");
                            liveObj.onCreate = function() { onCreateFunc.call(this, this); };
                            liveObj.onStep = function() { onStepFunc.call(this, this); };
                            liveInstances.push(liveObj);
                        } catch(err) { console.error(err); }
                    });
                }
            });

            window.LiveInstances = liveInstances;
            
            window.Room = {
                width: roomData.roomProps.width,
                height: roomData.roomProps.height,
                setLayerVisible: function(layerName, isVisible) {
                    const layer = roomData.layers.find((l, i) => 
                        l.name === layerName || l.id === layerName || "layer_" + i === layerName
                    );
                    if (layer) {
                        layer.visible = isVisible;
                    }
                }
            };

            roomContext = { width: roomData.roomProps.width, height: roomData.roomProps.height };
            
            try {
                if (roomData.events?.onRoomStart) {
                    const roomStartFunc = new Function("self", roomData.events.onRoomStart);
                    roomStartFunc.call(roomContext, roomContext);
                }
                if (roomData.events?.onRoomStep) {
                    roomStepFunc = new Function("self", roomData.events.onRoomStep);
                }
            } catch(e) {}

            liveInstances.forEach(inst => { if (inst.onCreate) inst.onCreate(); });
        };

        window.KinemeEngine = {
            switchRoom: (identifier, trans = "none") => {
                const nextRoom = rooms.find(r => r.id === identifier || r.label === identifier);
                if (!nextRoom) return;

                if (trans === "none") {
                    activeRoomId = nextRoom.id;
                    roomData = nextRoom.data;
                    bootRoom();
                    return;
                }

                transitionOverlay.style.display = "block";
                transitionOverlay.style.transition = "none";
                
                if (trans === "fade") {
                    transitionOverlay.style.opacity = "0";
                    transitionOverlay.style.transform = "none";
                } else if (trans === "slide-left") {
                    transitionOverlay.style.opacity = "1";
                    transitionOverlay.style.transform = "translateX(100%)";
                } else if (trans === "slide-right") {
                    transitionOverlay.style.opacity = "1";
                    transitionOverlay.style.transform = "translateX(-100%)";
                } else if (trans === "slide-up") {
                    transitionOverlay.style.opacity = "1";
                    transitionOverlay.style.transform = "translateY(100%)";
                } else if (trans === "slide-down") {
                    transitionOverlay.style.opacity = "1";
                    transitionOverlay.style.transform = "translateY(-100%)";
                }

                transitionOverlay.offsetHeight;
                transitionOverlay.style.transition = "all 0.5s ease-in-out";
                
                if (trans === "fade") {
                    transitionOverlay.style.opacity = "1";
                } else {
                    transitionOverlay.style.transform = "translate(0, 0)";
                }

                setTimeout(() => {
                    activeRoomId = nextRoom.id;
                    roomData = nextRoom.data;
                    bootRoom();

                    if (trans === "fade") {
                        transitionOverlay.style.opacity = "0";
                    } else if (trans === "slide-left") {
                        transitionOverlay.style.transform = "translateX(-100%)";
                    } else if (trans === "slide-right") {
                        transitionOverlay.style.transform = "translateX(100%)";
                    } else if (trans === "slide-up") {
                        transitionOverlay.style.transform = "translateY(-100%)";
                    } else if (trans === "slide-down") {
                        transitionOverlay.style.transform = "translateY(100%)";
                    }

                    setTimeout(() => {
                        transitionOverlay.style.display = "none";
                    }, 500);

                }, 500); 
            }
        };

        const handlePointer = (e, action) => {
            const rect = canvas.getBoundingClientRect();
            const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
            const rW = canvas.width * scale;
            const rH = canvas.height * scale;
            const oX = (rect.width - rW) / 2;
            const oY = (rect.height - rH) / 2;

            const x = e.clientX - rect.left - oX;
            const y = e.clientY - rect.top - oY;

           if (x >= 0 && x <= rW && y >= 0 && y <= rH) {
                const gameX = (x / rW) * canvas.width;
                const gameY = (y / rH) * canvas.height;
                
                if (action === "down" && window.Input) {
                    window.Input._handlePointerDown(e.pointerId, gameX, gameY, canvas.width, canvas.height, e.pointerType);
                } else if (action === "move" && window.Input) {
                    const isHover = e.pointerType === 'mouse' && e.buttons === 0;
                    window.Input._handlePointerMove(e.pointerId, gameX, gameY, canvas.width, canvas.height, isHover, e.pointerType);
                }
            }
            if (action === "up" && window.Input) window.Input._handlePointerUp(e.pointerId);
        };

        canvas.addEventListener("pointerdown", (e) => handlePointer(e, "down"));
        canvas.addEventListener("pointerup", (e) => handlePointer(e, "up"));
        canvas.addEventListener("pointercancel", (e) => handlePointer(e, "up"));
        canvas.addEventListener("pointermove", (e) => handlePointer(e, "move"));

        bootRoom();

        let lastTime = 0;
        const fpsInterval = 1000 / 60;

        const gameLoop = (time) => {
            if (!isRunning) return;
            requestAnimationFrame(gameLoop);

            if (!lastTime) lastTime = time;
            const elapsed = time - lastTime;
            if (elapsed < fpsInterval - 0.5) return;

            lastTime = time - (elapsed % fpsInterval);

            if (window.Time) window.Time.update(time);
            if (window.Timer) window.Timer.update();
            if (window.Camera && window.Camera.update) window.Camera.update();

            try { roomStepFunc.call(roomContext, roomContext); } catch (e) {}

            liveInstances.forEach(inst => {
                if (!inst._destroyed && inst.onStep) inst.onStep();
            });

            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = false;

            const camX = Math.round(window.Camera ? window.Camera.x : roomData.camera.x);
            const camY = Math.round(window.Camera ? window.Camera.y : roomData.camera.y);
            const cW = window.Camera ? window.Camera.width : roomData.camera.width;
            const cH = window.Camera ? window.Camera.height : roomData.camera.height;
            
            const zoomX = canvas.width / cW;
            const zoomY = canvas.height / cH;
            const baseZoomX = canvas.width / roomData.camera.width;
            const baseZoomY = canvas.height / roomData.camera.height;

            for (let i = roomData.layers.length - 1; i >= 0; i--) {
                const layer = roomData.layers[i];
                if (!layer.visible) continue;

                const safeLayerId = layer.id || "layer_" + i;
                const layerAlpha = layer.alpha !== undefined ? layer.alpha : 1;
                const isGUI = layer.type === "gui";

                ctx.save();
                ctx.globalAlpha = layerAlpha;

                if (!isGUI) {
                    ctx.scale(zoomX, zoomY);
                    const pX = layer.parallaxX !== undefined ? layer.parallaxX : 1;
                    const pY = layer.parallaxY !== undefined ? layer.parallaxY : 1;
                    ctx.translate(-camX + camX * (1 - pX), -camY + camY * (1 - pY));
                } else {
                    if (layer.fixOnScale) {
                        ctx.scale(baseZoomX, baseZoomY);
                    } else {
                        ctx.scale(zoomX, zoomY);
                    }
                }

                if (layer.type === "background" && layer.backgroundAssetId) {
                    const sp = sprites.find(s => s.id === layer.backgroundAssetId);
                    if (sp && imageCache[sp.data.assetId]) ctx.drawImage(imageCache[sp.data.assetId], 0, 0);
                } 

                if (layer.type === "tilemap" && layer.tiles && layer.tileSpriteId) {
                    const sp = sprites.find(s => s.id === layer.tileSpriteId);
                    const tileW = layer.tileWidth || 32;
                    const tileH = layer.tileHeight || 32;
                    if (sp && imageCache[sp.data.assetId]) {
                        layer.tiles.forEach(tile => {
                            ctx.drawImage(imageCache[sp.data.assetId], tile.sourceX, tile.sourceY, tileW, tileH, tile.x, tile.y, tileW, tileH);
                        });
                    }
                }

                if ((layer.type === "decorator" || isGUI) && layer.assets) {
                    layer.assets.forEach(asset => {
                        const sResource = sprites.find(s => s.id === asset.spriteId);
                        const sp = window.SpriteProps ? window.SpriteProps[asset.spriteId] : null;
                        if (sResource && imageCache[sResource.data.assetId] && sp) {
                            const frameData = sp.frames && sp.frames.length > 0 ? sp.frames[0] : { index: 0 };
                            const safeIndex = Math.abs(frameData.index || 0) % (sp.rows * sp.cols);
                            const sx = sp.offsetX + (safeIndex % sp.cols) * (sp.width + sp.gap);
                            const sy = sp.offsetY + Math.floor(safeIndex / sp.cols) * (sp.height + sp.gap);
                            
                            ctx.save();
                            ctx.translate(asset.x, asset.y);
                            if (asset.angle) ctx.rotate((asset.angle * Math.PI) / 180);
                            if (asset.scaleX !== undefined) ctx.scale(asset.scaleX, asset.scaleY);
                            ctx.globalAlpha = (asset.alpha ?? 1) * layerAlpha;
                            ctx.drawImage(imageCache[sResource.data.assetId], sx, sy, sp.width, sp.height, -sp.originX, -sp.originY, sp.width, sp.height);
                            ctx.restore();
                        }
                    });
                }

                if (layer.type === "instances" || isGUI) {
                    liveInstances.forEach(inst => {
                        if (inst._destroyed || !inst.visible || inst.layerId !== safeLayerId) return;
                        
                        const sResource = inst.sprite ? sprites.find(s => s.id === inst.sprite) : null;
                        const sp = window.SpriteProps && inst.sprite ? window.SpriteProps[inst.sprite] : null;

                        if (sResource && imageCache[sResource.data.assetId] && sp) {
                            const frames = sp.frames && sp.frames.length > 0 ? sp.frames : [{ index: 0 }];
                            if (frames.length > 1 && sp.fps > 0 && inst.animationSpeed > 0) {
                                inst.currentFrame = (inst.currentFrame + (sp.fps / 60) * inst.animationSpeed) % frames.length;
                            }
                            const frameData = frames[Math.floor(inst.currentFrame) % frames.length] || { index: 0 };
                            const safeIndex = Math.abs(frameData.index || 0) % (sp.rows * sp.cols);
                            const sx = sp.offsetX + (safeIndex % sp.cols) * (sp.width + sp.gap);
                            const sy = sp.offsetY + Math.floor(safeIndex / sp.cols) * (sp.height + sp.gap);

                            ctx.save();
                            ctx.translate(inst.x, inst.y);
                            if (inst.angle !== 0) ctx.rotate((inst.angle * Math.PI) / 180);
                            if (inst.scaleX !== 1 || inst.scaleY !== 1) ctx.scale(inst.scaleX, inst.scaleY);
                            ctx.globalAlpha = inst.alpha * layerAlpha * (frameData.alpha ?? 1);
                            ctx.drawImage(imageCache[sResource.data.assetId], sx, sy, sp.width, sp.height, -sp.originX, -sp.originY, sp.width, sp.height);
                            ctx.restore();
                        }
                    });
                }
                ctx.restore();
            }

            if (window.Draw && window.Draw.flush) {
                window.Draw.flush(ctx, zoomX, zoomY, camX, camY, baseZoomX, baseZoomY);
            }

            if (window.Input && window.Input.update) window.Input.update();
        };

        loadingUI.style.display = "none";
        canvas.style.opacity = 1;
        requestAnimationFrame(gameLoop);

    } catch(err) {
        console.error("Engine Boot Failure:", err);
        loadingUI.innerText = "ERROR BOOTING GAME. SEE CONSOLE.";
        loadingUI.style.color = "red";
    }
})();
