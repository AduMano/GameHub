
(async function init() {
    const canvas = document.getElementById("gameCanvas");
    const ctx = canvas.getContext("2d");
    const loadingUI = document.getElementById("loading");
    const transitionOverlay = document.getElementById("transitionOverlay");

    try {
        const response = await fetch("data.kineme");
        const encryptedBuffer = await response.arrayBuffer();
        
        // A. DE-OBFUSCATE
        const bytes = new Uint8Array(encryptedBuffer);
        const magicKey = "KINEME_SECURE_KEY_2026";
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] ^= magicKey.charCodeAt(i % magicKey.length);
        }
        
        // B. DECOMPRESS
        const ds = new DecompressionStream("deflate");
        const decompressedResponse = new Response(new Blob([bytes]).stream().pipeThrough(ds));
        const decompressedBuffer = await decompressedResponse.arrayBuffer();
        
        // C. DECODE
        const resources = MessagePack.decode(decompressedBuffer);

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

        // Inject Core Engine Modules
        globalCode += `
window.Collision = {
    /**
     * Checks collision against all instances of a specific object using their primary mask.
     */
    placeMeeting: function(inst, x, y, objId) {
        if (!inst || inst._destroyed || !inst.visible) return false;
        
        let targetInstances = window.LiveInstances.filter(i => i.objectId === objId && !i._destroyed && i.id !== inst.id);
        if (targetInstances.length === 0) return false;

        // Fallback mask in case an object bypasses standard compilation
        const getMask = (i) => i.mask || { offsetX: 0, offsetY: 0, width: 32, height: 32 };

        const m1 = getMask(inst);
        const l1 = x + (m1.offsetX * inst.scaleX);
        const r1 = x + ((m1.offsetX + m1.width) * inst.scaleX);
        const t1 = y + (m1.offsetY * inst.scaleY);
        const b1 = y + ((m1.offsetY + m1.height) * inst.scaleY);

        const minX1 = Math.min(l1, r1);
        const maxX1 = Math.max(l1, r1);
        const minY1 = Math.min(t1, b1);
        const maxY1 = Math.max(t1, b1);

        for (let target of targetInstances) {
            const m2 = getMask(target);
            const l2 = target.x + (m2.offsetX * target.scaleX);
            const r2 = target.x + ((m2.offsetX + m2.width) * target.scaleX);
            const t2 = target.y + (m2.offsetY * target.scaleY);
            const b2 = target.y + ((m2.offsetY + m2.height) * target.scaleY);

            const minX2 = Math.min(l2, r2);
            const maxX2 = Math.max(l2, r2);
            const minY2 = Math.min(t2, b2);
            const maxY2 = Math.max(t2, b2);

            if (minX1 < maxX2 && maxX1 > minX2 && minY1 < maxY2 && maxY1 > minY2) {
                return true; 
            }
        }
        return false;
    }
};
\n`;
        globalCode += `/**
 * Global Room Manager
 * Handles switching scenes, layer control, and dynamic instantiation.
 * * Note: These methods are stubs that safely initialize the global object.
 * They are dynamically hydrated and overwritten with full logic by the 
 * Kineme Engine's boot sequence every time a room loads.
 */
window.Room = window.Room || {};

// --- Room Transitions ---
window.Room.switchRoom = function(identifier, trans = "none") {
    if (window.KinemeEngine && window.KinemeEngine.switchRoom) {
        window.KinemeEngine.switchRoom(identifier, trans);
    } else {
        console.warn("Kineme Engine is not ready to switch rooms yet.");
    }
};

// Alias for backward compatibility with older project scripts
window.Room.goto = function(roomNameOrId, transition = "none") {
    this.switchRoom(roomNameOrId, transition);
};

// --- Base Dimensions (Overwritten on boot) ---
window.Room.width = 0;
window.Room.height = 0;

// --- Layer Control API ---
window.Room.getLayer = function(layerNameOrId) { return null; };
window.Room.layerExists = function(layerNameOrId) { return false; };
window.Room.setLayerVisible = function(layerNameOrId, isVisible) {};

// --- Dynamic Instantiation API ---
window.Room.addInstance = function(layerNameOrId, objectName, x, y, customProps = {}) { return null; };
window.Room.copyInstance = function(layerNameOrId, sourceInstanceId, x, y, customProps = {}) { return null; };
window.Room.addAsset = function(layerNameOrId, spriteName, x, y, customProps = {}) { return null; };
window.Room.addTile = function(layerNameOrId, sourceX, sourceY, x, y, customProps = {}) { return null; };

// --- Dynamic Destruction API ---
window.Room.removeInstance = function(instanceId) {};
window.Room.removeAsset = function(layerNameOrId, assetId) {};
window.Room.removeTile = function(layerNameOrId, tileId) {};
\n`;
        globalCode += `
/**
 * Engine Time & Execution Scheduler
 * Tracks delta time for smooth logic and manages asynchronous callbacks securely within the game loop.
 */
window.Time = {
    deltaTime: 0,
    time: 0,
    lastTime: 0,
    
    update: function(currentTime) {
        if (this.lastTime === 0) this.lastTime = currentTime;
        this.deltaTime = currentTime - this.lastTime;
        this.time = currentTime;
        this.lastTime = currentTime;
    }
};

window.Timer = {
    _events: [],
    
    /**
     * Schedules a callback to execute after a delay in milliseconds.
     * @param {number} delayMs Time to wait in milliseconds.
     * @param {Function} callback Logic to execute.
     * @param {object} context The instance triggering the timer (retains 'this' scope).
     */
    set: function(delayMs, callback, context = null) {
        this._events.push({
            triggerTime: window.Time.time + delayMs,
            callback: callback,
            context: context
        });
    },
    
    update: function() {
        const now = window.Time.time;
        // Loop backwards to safely remove items while iterating
        for (let i = this._events.length - 1; i >= 0; i--) {
            const event = this._events[i];
            if (now >= event.triggerTime) {
                if (typeof event.callback === "function") {
                    event.callback.call(event.context);
                }
                this._events.splice(i, 1);
            }
        }
    }
};
\n`;
        globalCode += `
/**
 * Global Particle Emitter System
 * Spawns lightweight, non-colliding visual effects with framerate-independent physics.
 */
window.ParticleEmitter = {
    /**
     * Spawns a burst of particles.
     * @param {Object} config Configuration object for the particles.
     */
    burst: function(config) {
        const count = config.count || 1;
        for (let i = 0; i < count; i++) {
            this.spawn(config);
        }
    },

    spawn: function(config) {
        const sprite = config.sprite;
        if (!sprite) {
            console.warn("ParticleEmitter: No sprite provided.");
            return;
        }

        const layerId = config.layerId || (window.LiveInstances.length > 0 ? window.LiveInstances[0].layerId : "Instances");

        // Helper to extract strict numbers or randomize from an array [min, max]
        const getVal = (val, defaultVal) => {
            if (Array.isArray(val)) return val[0] + Math.random() * (val[1] - val[0]);
            return val !== undefined ? val : defaultVal;
        };

        const x = getVal(config.x, 0);
        const y = getVal(config.y, 0);
        
        // Physics
        const speed = getVal(config.speed, 100); 
        const direction = getVal(config.direction, 0); // 0 = Right, 90 = Up, 180 = Left, 270 = Down
        const dirRad = direction * (Math.PI / 180);
        
        const hsp = Math.cos(dirRad) * speed;
        const vsp = -Math.sin(dirRad) * speed; 
        const gravity = getVal(config.gravity, 0);
        
        // Lifespan & Visuals
        const life = getVal(config.life, 1000); // Milliseconds
        const startAlpha = getVal(config.startAlpha, 1);
        const endAlpha = getVal(config.endAlpha, 0);
        const startScale = getVal(config.startScale, 1);
        const endScale = getVal(config.endScale, 1);
        const animSpeed = getVal(config.animationSpeed, 1);

        const particle = {
            id: "particle_" + Math.random(),
            layerId: layerId,
            sprite: sprite,
            x: x,
            y: y,
            width: 32, 
            height: 32,
            scaleX: startScale,
            scaleY: startScale,
            angle: getVal(config.angle, direction), 
            alpha: startAlpha,
            animationSpeed: animSpeed,
            currentFrame: 0,
            visible: true,
            _destroyed: false,
            
            // Internal Particle State
            hsp: hsp,
            vsp: vsp,
            grav: gravity,
            life: life,
            maxLife: life,
            startAlpha: startAlpha,
            endAlpha: endAlpha,
            startScale: startScale,
            endScale: endScale,

            onStep: function() {
                const dt = window.Time.deltaTime / 1000; 

                // Apply Gravity & Movement
                this.vsp += this.grav * dt;
                this.x += this.hsp * dt;
                this.y += this.vsp * dt;

                // Lifecycle Interpolation (Alpha & Scale fading)
                this.life -= window.Time.deltaTime;
                const progress = 1 - (this.life / this.maxLife);

                if (this.startAlpha !== this.endAlpha) {
                    this.alpha = this.startAlpha + (this.endAlpha - this.startAlpha) * progress;
                }
                if (this.startScale !== this.endScale) {
                    const currentScale = this.startScale + (this.endScale - this.startScale) * progress;
                    this.scaleX = currentScale;
                    this.scaleY = currentScale;
                }

                if (this.life <= 0) {
                    this._destroyed = true;
                }
            }
        };

        window.LiveInstances.push(particle);
    }
};
\n`;
        globalCode += `
// Initialize hardware audio context for gapless playback
window.AudioCtx = window.AudioCtx || new (window.AudioContext || window.webkitAudioContext)();

// Add Master Compressor to protect ears
if (!window.MasterLimiter) {
    window.MasterLimiter = window.AudioCtx.createDynamicsCompressor();
    window.MasterLimiter.threshold.value = -12; // Start catching loud noises early
    window.MasterLimiter.ratio.value = 20;      // Squash them hard (Brickwall)
    window.MasterLimiter.attack.value = 0.003;  // React very fast (3 milliseconds)
    window.MasterLimiter.release.value = 0.25;  // Let go smooth
    window.MasterLimiter.connect(window.AudioCtx.destination);
}

window.SoundManager = {
    _activeNodes: new Map(),
    _bgmAudio: null, 
    _bgmFadeInterval: null,

    // --- SFX (WEB AUDIO API) ---
    play: function(soundId, loop = false, volume = 1.0, pitch = 1.0) {
        if (!window.AudioCache || !window.AudioCache[soundId]) return null;
        if (window.AudioCtx.state === "suspended") window.AudioCtx.resume();

        const buffer = window.AudioCache[soundId];
        const source = window.AudioCtx.createBufferSource();
        const gainNode = window.AudioCtx.createGain();

        source.buffer = buffer;
        source.loop = loop;
        source.playbackRate.value = pitch;
        gainNode.gain.value = Math.max(0, Math.min(1, volume));

        source.connect(gainNode);
        
        // FIX: Connect to Master Limiter instead of direct destination
        gainNode.connect(window.MasterLimiter);

        const instanceId = soundId + "_" + Date.now() + "_" + Math.random();
        this._activeNodes.set(instanceId, { source, gainNode });

        source.onended = () => {
            if (!loop) this._activeNodes.delete(instanceId);
        };

        source.start(0);
        return instanceId;
    },

    stop: function(instanceId) {
        const nodeData = this._activeNodes.get(instanceId);
        if (nodeData) {
            nodeData.source.stop();
            nodeData.source.disconnect();
            nodeData.gainNode.disconnect();
            this._activeNodes.delete(instanceId);
        }
    },

    fadeOutSFX: function(instanceId, durationInSeconds, callback = null) {
        const nodeData = this._activeNodes.get(instanceId);
        if (!nodeData) {
            if (callback) callback();
            return;
        }
        
        const gainNode = nodeData.gainNode;
        const startVol = gainNode.gain.value;
        
        gainNode.gain.setValueAtTime(startVol, window.AudioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0, window.AudioCtx.currentTime + durationInSeconds);
        
        setTimeout(() => {
            this.stop(instanceId);
            if (callback) callback();
        }, durationInSeconds * 1000);
    },

    stopAll: function() {
        this._activeNodes.forEach(nodeData => {
            nodeData.source.stop();
            nodeData.source.disconnect();
            nodeData.gainNode.disconnect();
        });
        this._activeNodes.clear();
        this.stopBGM(); 
    },
    
    setVolume: function(instanceId, volume) {
        const nodeData = this._activeNodes.get(instanceId);
        if (nodeData) {
            nodeData.gainNode.gain.value = Math.max(0, Math.min(1, volume));
        }
    },

    // --- BGM (HTML5 AUDIO) ---
    playBGM: function(soundId, volume = 1.0) {
        if (!window.AudioBlobCache || !window.AudioBlobCache[soundId]) return;

        this.stopBGM();
        this._bgmAudio = new Audio(window.AudioBlobCache[soundId]);
        this._bgmAudio.loop = true;
        this._bgmAudio.volume = Math.max(0, Math.min(1, volume));
        
        this._bgmAudio.play().catch(e => console.warn("BGM autoplay blocked.", e));
    },

    fadeInBGM: function(soundId, durationInSeconds = 1, targetVolume = 1.0, callback = null) {
        if (!window.AudioBlobCache || !window.AudioBlobCache[soundId]) return;

        this.stopBGM();
        this._bgmAudio = new Audio(window.AudioBlobCache[soundId]);
        this._bgmAudio.loop = true;
        this._bgmAudio.volume = 0;
        
        this._bgmAudio.play().then(() => {
            const steps = 30; 
            const stepTime = (durationInSeconds * 1000) / steps;
            const volStep = targetVolume / steps;
            let currentStep = 0;

            clearInterval(this._bgmFadeInterval);
            this._bgmFadeInterval = setInterval(() => {
                currentStep++;
                if (!this._bgmAudio) return clearInterval(this._bgmFadeInterval);
                
                this._bgmAudio.volume = Math.min(targetVolume, volStep * currentStep);

                if (currentStep >= steps) {
                    clearInterval(this._bgmFadeInterval);
                    this._bgmAudio.volume = targetVolume;
                    if (callback) callback();
                }
            }, stepTime);
        }).catch(e => console.warn("BGM autoplay blocked.", e));
    },

    fadeOutBGM: function(durationInSeconds = 1, callback = null) {
        if (!this._bgmAudio || this._bgmAudio.paused) {
            if (callback) callback();
            return;
        }

        const startVol = this._bgmAudio.volume;
        const steps = 30;
        const stepTime = (durationInSeconds * 1000) / steps;
        const volStep = startVol / steps;
        let currentStep = 0;
        
        clearInterval(this._bgmFadeInterval);
        this._bgmFadeInterval = setInterval(() => {
            currentStep++;
            if (!this._bgmAudio) return clearInterval(this._bgmFadeInterval);
            
            this._bgmAudio.volume = Math.max(0, startVol - (volStep * currentStep));

            if (currentStep >= steps) {
                clearInterval(this._bgmFadeInterval);
                this.stopBGM();
                if (callback) callback();
            }
        }, stepTime);
    },

    stopBGM: function() {
        clearInterval(this._bgmFadeInterval);
        if (this._bgmAudio) {
            this._bgmAudio.pause();
            this._bgmAudio.src = "";
            this._bgmAudio = null;
        }
    },

    pauseBGM: function() {
        if (this._bgmAudio && !this._bgmAudio.paused) this._bgmAudio.pause();
    },

    resumeBGM: function() {
        if (this._bgmAudio && this._bgmAudio.paused) {
            this._bgmAudio.play().catch(e => console.warn("BGM resume blocked.", e));
        }
    }
};

window.Sound = window.SoundManager;
\n`;
        globalCode += `
window.Draw = {
    _queue: [],
    
    text: function(x, y, text, options = {}) {
        this._queue.push({
            type: "text", x: x, y: y, text: String(text),
            font: options.font || "16px monospace",
            color: options.color || "#ffffff",
            align: options.align || "left",
            baseline: options.baseline || "top",
            isGUI: options.isGUI !== false,
            alpha: options.alpha !== undefined ? options.alpha : 1
        });
    },

    rect: function(x, y, width, height, color, filled = true, options = {}) {
        this._queue.push({
            type: "rect", x, y, width, height, color, filled,
            isGUI: options.isGUI !== false,
            alpha: options.alpha !== undefined ? options.alpha : 1
        });
    },

    flush: function(ctx, zoomX, zoomY, camX, camY, baseZoomX, baseZoomY) {
        // Fallback to active zoom if base isn't passed
        const bZx = baseZoomX || zoomX;
        const bZy = baseZoomY || zoomY;

        this._queue.forEach(item => {
            ctx.save();
            ctx.globalAlpha = item.alpha;

            // Strict check: GUI gets the static base zoom, World gets the dynamic camera zoom
            const activeZoomX = item.isGUI ? bZx : zoomX;
            const activeZoomY = item.isGUI ? bZy : zoomY;

            if (item.type === "text") {
                let fontSize = 16;
                let fontFamily = "monospace";
                const fontMatch = item.font.match(/(\d+(?:\.\d+)?)px\s+(.*)/);
                if (fontMatch) {
                    fontSize = parseFloat(fontMatch[1]);
                    fontFamily = fontMatch[2];
                }

                const hdSize = fontSize * activeZoomX;
                ctx.font = hdSize + "px " + fontFamily;
                ctx.fillStyle = item.color;
                ctx.textAlign = item.align;
                ctx.textBaseline = item.baseline;
                
                if (!item.isGUI) {
                    const screenX = (item.x - camX) * activeZoomX;
                    const screenY = (item.y - camY) * activeZoomY;
                    ctx.fillText(item.text, screenX, screenY);
                } else {
                    const screenX = item.x * activeZoomX;
                    const screenY = item.y * activeZoomY;
                    ctx.fillText(item.text, screenX, screenY);
                }
            } else if (item.type === "rect") {
                ctx.scale(activeZoomX, activeZoomY);
                if (!item.isGUI) {
                    ctx.translate(-camX, -camY);
                }
                ctx.fillStyle = item.color;
                ctx.strokeStyle = item.color;
                if (item.filled) ctx.fillRect(item.x, item.y, item.width, item.height);
                else ctx.strokeRect(item.x, item.y, item.width, item.height);
            }
            
            ctx.restore();
        });
        
        this._queue = [];
    }
};
\n`;
        globalCode += `
window.Save = {
    prefix: "kineme_save_",

    /**
     * Serializes and saves a value to local storage.
     * @param {string} key - The unique identifier for this save data.
     * @param {any} value - The data to save (strings, numbers, objects, or arrays).
     */
    set: function(key, value) {
        try {
            const serialized = JSON.stringify(value);
            localStorage.setItem(this.prefix + key, serialized);
        } catch (e) {
            console.error("SaveManager: Failed to save data", e);
        }
    },

    /**
     * Retrieves and parses a value from local storage.
     * @param {string} key - The unique identifier for this save data.
     * @param {any} defaultValue - The fallback value if the key does not exist.
     * @returns {any} The loaded data, or the defaultValue.
     */
    get: function(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(this.prefix + key);
            if (item === null) return defaultValue;
            return JSON.parse(item);
        } catch (e) {
            console.error("SaveManager: Failed to load data", e);
            return defaultValue;
        }
    },

    /**
     * Deletes a specific save key from storage.
     * @param {string} key - The key to delete.
     */
    delete: function(key) {
        localStorage.removeItem(this.prefix + key);
    },

    /**
     * Clears all save data generated specifically by this game engine.
     * Leaves other website data untouched.
     */
    clearAll: function() {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(this.prefix)) {
                keysToRemove.push(k);
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
    }
};
\n`;
        globalCode += `
window.Pathfinder = {
    /**
     * Calculates the shortest path between two points avoiding a specific obstacle ID.
     * @param {number} startX - Origin X
     * @param {number} startY - Origin Y
     * @param {number} targetX - Destination X
     * @param {number} targetY - Destination Y
     * @param {number} gridSize - Resolution of the nav grid (e.g., 32 for standard tiles)
     * @param {string} avoidObjId - The object ID to treat as a solid wall
     * @param {number} maxNodes - Engine safety limit to prevent freezing on impossible paths
     * @returns {Array<{x, y}>} Array of waypoint coordinates
     */
    findPath: function(startX, startY, targetX, targetY, gridSize, avoidObjId, maxNodes = 500) {
        // Snap coordinates to exact grid boundaries for uniform calculation
        const startNode = { x: Math.floor(startX / gridSize) * gridSize, y: Math.floor(startY / gridSize) * gridSize };
        const targetNode = { x: Math.floor(targetX / gridSize) * gridSize, y: Math.floor(targetY / gridSize) * gridSize };

        if (startNode.x === targetNode.x && startNode.y === targetNode.y) return [];

        const openList = [startNode];
        const closedSet = new Set();
        
        startNode.g = 0;
        startNode.h = Math.abs(startNode.x - targetNode.x) + Math.abs(startNode.y - targetNode.y);
        startNode.f = startNode.g + startNode.h;
        startNode.parent = null;

        const getNeighbors = (node) => {
            return [
                {x: 0, y: -gridSize}, {x: gridSize, y: 0}, 
                {x: 0, y: gridSize}, {x: -gridSize, y: 0},
                {x: gridSize, y: -gridSize}, {x: gridSize, y: gridSize}, 
                {x: -gridSize, y: gridSize}, {x: -gridSize, y: -gridSize}
            ].map(d => ({ x: node.x + d.x, y: node.y + d.y }));
        };

        // Virtual entity used strictly to query the CollisionManager API
        const mockInst = {
            id: "pathfinder_mock",
            scaleX: 1, scaleY: 1,
            // Shrink mask slightly to allow sliding through tight 1-block corridors
            mask: { offsetX: 1, offsetY: 1, width: gridSize - 2, height: gridSize - 2 }, 
            visible: true, _destroyed: false
        };

        let nodesChecked = 0;

        while (openList.length > 0) {
            // Safety trigger. If area is too complex or unreachable, return empty path rather than crashing page
            if (nodesChecked++ > maxNodes) break; 

            openList.sort((a, b) => a.f - b.f);
            const currentNode = openList.shift();
            const nodeKey = currentNode.x + "," + currentNode.y;
            
            closedSet.add(nodeKey);

            if (currentNode.x === targetNode.x && currentNode.y === targetNode.y) {
                const path = [];
                let curr = currentNode;
                while (curr.parent) {
                    // Shift coordinates to center of grid cell to prevent objects hugging the top-left walls
                    path.push({ x: curr.x + (gridSize/2), y: curr.y + (gridSize/2) });
                    curr = curr.parent;
                }
                return path.reverse();
            }

            const neighbors = getNeighbors(currentNode);
            for (let neighbor of neighbors) {
                const nKey = neighbor.x + "," + neighbor.y;
                if (closedSet.has(nKey)) continue;

                mockInst.x = neighbor.x;
                mockInst.y = neighbor.y;
                
                if (window.Collision.placeMeeting(mockInst, neighbor.x, neighbor.y, avoidObjId)) {
                    closedSet.add(nKey);
                    continue;
                }

                // Diagonal weighting forces algorithm to prefer straight lines unless diagonal is genuinely faster
                const isDiagonal = (neighbor.x !== currentNode.x && neighbor.y !== currentNode.y);
                const moveCost = isDiagonal ? gridSize * 1.4 : gridSize;
                const gScore = currentNode.g + moveCost;
                
                let existingNode = openList.find(n => n.x === neighbor.x && n.y === neighbor.y);

                if (!existingNode || gScore < existingNode.g) {
                    const hScore = Math.abs(neighbor.x - targetNode.x) + Math.abs(neighbor.y - targetNode.y);
                    const neighborNode = {
                        x: neighbor.x, y: neighbor.y,
                        g: gScore, h: hScore, f: gScore + hScore,
                        parent: currentNode
                    };
                    
                    if (!existingNode) {
                        openList.push(neighborNode);
                    } else {
                        existingNode.g = neighborNode.g;
                        existingNode.f = neighborNode.f;
                        existingNode.parent = neighborNode.parent;
                    }
                }
            }
        }
        return []; 
    }
};
\n`;
        
        const oldScript = document.getElementById("kineme-injected-scripts");
        if (oldScript) oldScript.remove();

        scripts.forEach(script => {
            if (script.data?.code) {
                const pureCode = script.data.code.replace(/^export\s+const\s+\w+\s+=\s+`/, "").replace(/`;\s*$/, "");
                globalCode += '\n/* --- ' + script.label + ' --- */\n' + pureCode + '\n';
            }
        });

        const scriptTag = document.createElement("script");
        scriptTag.id = "kineme-injected-scripts";
        scriptTag.innerHTML = globalCode;
        document.head.appendChild(scriptTag);

        window.AudioCtx = window.AudioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const imageCache = {};
        window.AudioCache = {};
        window.AudioBlobCache = {}; // NEW: Initialize Blob Cache
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
            const dbKey = sound.id;
            const cleanName = sound.label.replace(/[^a-zA-Z0-9_]/g, "");

            if (sound.data?.hasAudio) {
                loadPromises.push(
                    fetch("assets/" + dbKey + ".mp3")
                    .then(res => {
                        if (!res.ok) throw new Error("Audio missing in zip");
                        return res.blob();
                    })
                    .then(async (blob) => {
                        const blobUrl = URL.createObjectURL(blob);
                        window.AudioBlobCache[dbKey] = blobUrl;
                        window.AudioBlobCache[cleanName] = blobUrl;
                        
                        const arrayBuffer = await blob.arrayBuffer();
                        const audioBuf = await window.AudioCtx.decodeAudioData(arrayBuffer);
                        window.AudioCache[dbKey] = audioBuf;
                        window.AudioCache[cleanName] = audioBuf;
                    })
                    .catch(err => console.error("Audio load/decode fail", err))
                );
            }
        });

        await Promise.all(loadPromises);

        let activeRoomId = defaultRoom.id;
        let isRunning = true;
        let roomData = defaultRoom.data;

        let liveInstances = [];
        let roomContext = {};
        let roomStepFunc = () => {};

        // Unified Factory for Editor and Published Environments
        const createLiveInstance = (inst, baseObj, safeLayerId, customProps = {}) => {
            const resolvedSpriteId = customProps.sprite ? (sprites.find(s => s.id === customProps.sprite || s.label === customProps.sprite)?.id || null) : (baseObj?.data?.spriteId || null);
            const spriteResource = resolvedSpriteId ? sprites.find(s => s.id === resolvedSpriteId) : null;
            const sprProps = spriteResource?.data?.spriteProps || null;
            
            const definedMasks = customProps.masks || baseObj?.data?.masks || [];
            const definedMask = customProps.mask || (definedMasks.length > 0 ? definedMasks[0] : baseObj?.data?.mask);

            const liveObj = {
                id: inst.id || "inst_" + Date.now() + Math.random(),
                objectId: baseObj?.id || "custom_object",
                layerId: safeLayerId,
                sprite: resolvedSpriteId,
                x: inst.x,
                y: inst.y,
                width: customProps.width ?? sprProps?.width ?? 32,
                height: customProps.height ?? sprProps?.height ?? 32,
                scaleX: inst.scaleX ?? customProps.scaleX ?? 1,
                scaleY: inst.scaleY ?? customProps.scaleY ?? 1,
                angle: customProps.angle ?? 0,
                alpha: customProps.alpha ?? 1,
                animationSpeed: customProps.animationSpeed ?? 1,
                currentFrame: customProps.currentFrame ?? 0,
                mask: definedMask ? { offsetX: definedMask.offsetX, offsetY: definedMask.offsetY, width: definedMask.width, height: definedMask.height } : { offsetX: sprProps ? -sprProps.originX : 0, offsetY: sprProps ? -sprProps.originY : 0, width: sprProps?.width || 32, height: sprProps?.height || 32 },
                masks: definedMasks,
                tint: customProps.tint ?? "#ffffff",
                visible: customProps.visible ?? true,
                _destroyed: false,
                destroy: function () { this._destroyed = true; },
            };

            Object.keys(customProps).forEach(key => {
                if (!["x", "y", "width", "height", "scaleX", "scaleY", "sprite", "mask", "masks", "onCreate", "onStep", "onDestroy", "onAnimationEnd"].includes(key)) {
                    liveObj[key] = customProps[key];
                }
            });

            const attachEvent = (eventName, defaultCode) => {
                if (typeof customProps[eventName] === "function") {
                    liveObj[eventName] = function () { customProps[eventName].call(this, this); };
                } else if (typeof customProps[eventName] === "string") {
                    try {
                        const fn = new Function("self", customProps[eventName]);
                        liveObj[eventName] = function () { fn.call(this, this); };
                    } catch (e) { console.error(`Error compiling custom ${eventName}:`, e); }
                } else if (defaultCode) {
                    try {
                        const fn = new Function("self", defaultCode);
                        liveObj[eventName] = function () { fn.call(this, this); };
                    } catch (e) { console.error(`Error compiling default ${eventName}:`, e); }
                }
            };

            attachEvent("onCreate", baseObj?.data?.events?.onCreate || "");
            attachEvent("onStep", baseObj?.data?.events?.onStep || "");
            attachEvent("onDestroy", baseObj?.data?.events?.onDestroy || "");
            attachEvent("onAnimationEnd", baseObj?.data?.events?.onAnimationEnd || "");

            return liveObj;
        };

        const bootRoom = () => {
            liveInstances = [];
            
            const HD_SCALE = 4;
            canvas.width = roomData.camera.width * HD_SCALE;
            canvas.height = roomData.camera.height * HD_SCALE;
            ctx.imageSmoothingEnabled = false;

            if (window.Camera) {
                window.Camera.x = roomData.camera.x;
                window.Camera.y = roomData.camera.y;
                window.Camera.width = roomData.camera.width;
                window.Camera.height = roomData.camera.height;
                window.Camera.baseWidth = roomData.camera.width;  
                window.Camera.baseHeight = roomData.camera.height;
                window.Camera.roomWidth = roomData.roomProps.width;
                window.Camera.roomHeight = roomData.roomProps.height;
                window.Camera.panDelay = roomData.camera.panDelay ?? 0.1;
            }

            window._GUI_LAYERS = {};
            roomData.layers.forEach(l => {
                if (l.type === "gui") window._GUI_LAYERS[l.id || ""] = !!l.fixOnScale;
            });

            roomData.layers.forEach((layer, layerIndex) => {
                const safeLayerId = layer.id || "layer_" + layerIndex;
                if ((layer.type === "instances" || layer.type === "gui") && layer.visible !== false && layer.instances) {
                    layer.instances.forEach(inst => {
                        const baseObj = objects.find(o => o.id === inst.objectId);
                        if (!baseObj) return;
                        liveInstances.push(createLiveInstance(inst, baseObj, safeLayerId));
                    });
                }
            });

            window.LiveInstances = liveInstances;
            window._ROOM_LAYERS = roomData.layers; 
            
            window.Room = {
                width: roomData.roomProps.width,
                height: roomData.roomProps.height,
                
                getLayer: function(layerNameOrId) {
                    return roomData.layers.find((l, i) => l.name === layerNameOrId || l.id === layerNameOrId || "layer_" + i === layerNameOrId);
                },
                layerExists: function(layerNameOrId) {
                    return !!this.getLayer(layerNameOrId);
                },
                setLayerVisible: function (layerNameOrId, isVisible) {
                    const layer = this.getLayer(layerNameOrId);
                    if (layer) layer.visible = isVisible;
                },
                addInstance: function(layerNameOrId, objectName, x, y, customProps = {}) {
                    const layer = this.getLayer(layerNameOrId);
                    if (!layer || (layer.type !== "instances" && layer.type !== "gui")) return;
                    const baseObj = objects.find(o => o.label === objectName || o.id === objectName) || { id: "custom", data: {} };
                    const newInst = createLiveInstance({ x, y }, baseObj, layer.id, customProps);
                    if (newInst.onCreate) newInst.onCreate(); 
                    liveInstances.push(newInst);
                    return newInst;
                },
                copyInstance: function(layerNameOrId, sourceInstanceId, x, y, customProps = {}) {
                    const layer = this.getLayer(layerNameOrId);
                    if (!layer || (layer.type !== "instances" && layer.type !== "gui")) return;
                    const sourceInst = liveInstances.find(i => i.id === sourceInstanceId);
                    if (!sourceInst) return;
                    const clonedProps = Object.assign({}, sourceInst, customProps);
                    delete clonedProps.id; delete clonedProps._destroyed; delete clonedProps.layerId;
                    const baseObj = objects.find(o => o.id === sourceInst.objectId) || { id: "custom", data: {} };
                    const newInst = createLiveInstance({ x, y, scaleX: clonedProps.scaleX, scaleY: clonedProps.scaleY }, baseObj, layer.id, clonedProps);
                    if (newInst.onCreate) newInst.onCreate();
                    liveInstances.push(newInst);
                    return newInst;
                },
                addAsset: function(layerNameOrId, spriteName, x, y, customProps = {}) {
                    const layer = this.getLayer(layerNameOrId);
                    if (!layer || (layer.type !== "decorator" && layer.type !== "gui")) return;
                    const sprite = sprites.find(s => s.label === spriteName || s.id === spriteName);
                    if (!sprite) return;
                    if (!layer.assets) layer.assets = [];
                    const newAsset = { id: "asset_" + Date.now() + Math.random(), spriteId: sprite.id, x, y, scaleX: customProps.scaleX ?? 1, scaleY: customProps.scaleY ?? 1, alpha: customProps.alpha ?? 1, angle: customProps.angle ?? 0 };
                    layer.assets.push(newAsset);
                    return newAsset;
                },
                addTile: function(layerNameOrId, sourceX, sourceY, x, y, customProps = {}) {
                    const layer = this.getLayer(layerNameOrId);
                    if (!layer || layer.type !== "tilemap") return;
                    if (!layer.tiles) layer.tiles = [];
                    const newTile = Object.assign({ id: "tile_" + Date.now() + Math.random(), sourceX, sourceY, x, y }, customProps);
                    layer.tiles.push(newTile);
                    return newTile;
                },
                removeInstance: function(instanceId) {
                    const inst = liveInstances.find(i => i.id === instanceId);
                    if (inst) inst.destroy();
                },
                removeAsset: function(layerNameOrId, assetId) {
                     const layer = this.getLayer(layerNameOrId);
                     if (layer && layer.assets) layer.assets = layer.assets.filter(a => a.id !== assetId);
                },
                removeTile: function(layerNameOrId, tileId) {
                     const layer = this.getLayer(layerNameOrId);
                     if (layer && layer.tiles) layer.tiles = layer.tiles.filter(t => t.id !== tileId);
                },
                switchRoom: function(identifier, trans = "none") {
                    if (window.KinemeEngine) window.KinemeEngine.switchRoom(identifier, trans);
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
            _isSwitching: false,
            switchRoom: function(identifier, trans = "none") {
                if (this._isSwitching) return; 
                
                const nextRoom = rooms.find(r => r.id === identifier || r.label === identifier);
                if (!nextRoom || nextRoom.id === activeRoomId) return;

                this._isSwitching = true;
                
                if (trans === "none") {
                    activeRoomId = nextRoom.id;
                    roomData = nextRoom.data;
                    bootRoom();
                    this._isSwitching = false; 
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
                        this._isSwitching = false; 
                    }, 500);

                }, 500); 
            }
        };

        const handlePointer = (e, action) => {
            // --- AUDIO HARDWARE UNLOCKER ---
            if (action === "down") {
                if (window.AudioCtx && window.AudioCtx.state === "suspended") {
                    window.AudioCtx.resume();
                }
                const sm = window.SoundManager || window.Sound;
                if (sm && sm._bgmAudio && sm._bgmAudio.paused && !window._audioUnlocked) {
                    sm._bgmAudio.play().catch(() => {});
                    window._audioUnlocked = true;
                }
            }
            // -------------------------------

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
        document.addEventListener("visibilitychange", () => {
            const sm = window.SoundManager || window.Sound;
            if (document.hidden) {
                if (sm) sm.pauseBGM();
            } else {
                if (sm) sm.resumeBGM();
                if (window.AudioCtx && window.AudioCtx.state === "suspended") {
                    window.AudioCtx.resume();
                }
            }
        });

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

            const activeLayerIds = new Set(
                roomData.layers
                    .filter(l => l.visible !== false)
                    .map((l, i) => l.id || "layer_" + i)
            );

            liveInstances.forEach(inst => {
                if (!inst._destroyed && inst.onStep && activeLayerIds.has(inst.layerId)) {
                    inst.onStep();
                }
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
                if (layer.visible === false) continue;

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
                            const frames = sp.frames && sp.frames.length > 0 ? sp.frames : [{ index: 0 }];
                            const totalSequence = frames.length;
                            let currentSequenceIndex = 0;

                            if (totalSequence > 1 && sp.fps > 0) {
                                currentSequenceIndex = Math.floor(time / (1000 / sp.fps)) % totalSequence;
                            }

                            const frameData = frames[currentSequenceIndex] || { index: 0 };
                            const safeGridIndex = Math.abs(frameData.index || 0) % (sp.rows * sp.cols);
                            const col = safeGridIndex % sp.cols;
                            const row = Math.floor(safeGridIndex / sp.cols);
                            const sx = sp.offsetX + col * (sp.width + sp.gap);
                            const sy = sp.offsetY + row * (sp.height + sp.gap);
                            
                            ctx.save();
                            ctx.translate(asset.x, asset.y);
                            if (asset.angle) ctx.rotate((asset.angle * Math.PI) / 180);
                            if (asset.scaleX !== undefined || asset.scaleY !== undefined) ctx.scale(asset.scaleX ?? 1, asset.scaleY ?? 1);
                            
                            const frameAlpha = frameData.alpha !== undefined ? frameData.alpha : 1;
                            const finalAlpha = (asset.alpha !== undefined ? asset.alpha : 1) * layerAlpha * frameAlpha;
                            if (finalAlpha !== 1) ctx.globalAlpha = finalAlpha;

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
                            const totalSequence = frames.length;

                            if (totalSequence > 1 && sp.fps > 0 && inst.animationSpeed > 0) {
                                inst.currentFrame += (sp.fps / 60) * inst.animationSpeed;
                                inst.currentFrame = inst.currentFrame % totalSequence;
                            }

                            const safeSequenceIndex = Math.floor(inst.currentFrame) % totalSequence;
                            const frameData = frames[safeSequenceIndex] || { index: 0 };
                            const safeGridIndex = Math.abs(frameData.index || 0) % (sp.rows * sp.cols);

                            const col = safeGridIndex % sp.cols;
                            const row = Math.floor(safeGridIndex / sp.cols);
                            const sx = sp.offsetX + col * (sp.width + sp.gap);
                            const sy = sp.offsetY + row * (sp.height + sp.gap);

                            ctx.save();
                            ctx.translate(inst.x, inst.y);
                            if (inst.angle !== 0) ctx.rotate((inst.angle * Math.PI) / 180);
                            if (inst.scaleX !== 1 || inst.scaleY !== 1) ctx.scale(inst.scaleX, inst.scaleY);
                            
                            const frameAlpha = frameData.alpha !== undefined ? frameData.alpha : 1;
                            const finalAlpha = inst.alpha * layerAlpha * frameAlpha;
                            if (finalAlpha !== 1) ctx.globalAlpha = finalAlpha;

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
