
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
        globalCode += "\nwindow.Collision = {\n    /**\n     * Checks collision against all instances of a specific object using their primary mask.\n     */\n    placeMeeting: function(inst, x, y, objId) {\n        if (!inst || inst._destroyed || !inst.visible) return false;\n        \n        let targetInstances = window.LiveInstances.filter(i => i.objectId === objId && !i._destroyed && i.id !== inst.id);\n        if (targetInstances.length === 0) return false;\n\n        // Fallback mask in case an object bypasses standard compilation\n        const getMask = (i) => i.mask || { offsetX: 0, offsetY: 0, width: 32, height: 32 };\n\n        const m1 = getMask(inst);\n        const l1 = x + (m1.offsetX * inst.scaleX);\n        const r1 = x + ((m1.offsetX + m1.width) * inst.scaleX);\n        const t1 = y + (m1.offsetY * inst.scaleY);\n        const b1 = y + ((m1.offsetY + m1.height) * inst.scaleY);\n\n        const minX1 = Math.min(l1, r1);\n        const maxX1 = Math.max(l1, r1);\n        const minY1 = Math.min(t1, b1);\n        const maxY1 = Math.max(t1, b1);\n\n        for (let target of targetInstances) {\n            const m2 = getMask(target);\n            const l2 = target.x + (m2.offsetX * target.scaleX);\n            const r2 = target.x + ((m2.offsetX + m2.width) * target.scaleX);\n            const t2 = target.y + (m2.offsetY * target.scaleY);\n            const b2 = target.y + ((m2.offsetY + m2.height) * target.scaleY);\n\n            const minX2 = Math.min(l2, r2);\n            const maxX2 = Math.max(l2, r2);\n            const minY2 = Math.min(t2, b2);\n            const maxY2 = Math.max(t2, b2);\n\n            if (minX1 < maxX2 && maxX1 > minX2 && minY1 < maxY2 && maxY1 > minY2) {\n                return true; \n            }\n        }\n        return false;\n    }\n};\n\n";
        globalCode += "/**\n * Global Room Manager\n * Handles switching scenes, layer control, and dynamic instantiation.\n * * Note: These methods are stubs that safely initialize the global object.\n * They are dynamically hydrated and overwritten with full logic by the \n * Kineme Engine's boot sequence every time a room loads.\n */\nwindow.Room = window.Room || {};\n\n// --- Room Transitions ---\nwindow.Room.switchRoom = function(identifier, trans = \"none\") {\n    if (window.KinemeEngine && window.KinemeEngine.switchRoom) {\n        window.KinemeEngine.switchRoom(identifier, trans);\n    } else {\n        console.warn(\"Kineme Engine is not ready to switch rooms yet.\");\n    }\n};\n\n// Alias for backward compatibility with older project scripts\nwindow.Room.goto = function(roomNameOrId, transition = \"none\") {\n    this.switchRoom(roomNameOrId, transition);\n};\n\n// --- Base Dimensions (Overwritten on boot) ---\nwindow.Room.width = 0;\nwindow.Room.height = 0;\n\n// --- Layer Control API ---\nwindow.Room.getLayer = function(layerNameOrId) { return null; };\nwindow.Room.layerExists = function(layerNameOrId) { return false; };\nwindow.Room.setLayerVisible = function(layerNameOrId, isVisible) {};\n\n// --- Dynamic Instantiation API ---\nwindow.Room.addInstance = function(layerNameOrId, objectName, x, y, customProps = {}) { return null; };\nwindow.Room.copyInstance = function(layerNameOrId, sourceInstanceId, x, y, customProps = {}) { return null; };\nwindow.Room.addAsset = function(layerNameOrId, spriteName, x, y, customProps = {}) { return null; };\nwindow.Room.addTile = function(layerNameOrId, sourceX, sourceY, x, y, customProps = {}) { return null; };\n\n// --- Dynamic Destruction API ---\nwindow.Room.removeInstance = function(instanceId) {};\nwindow.Room.removeAsset = function(layerNameOrId, assetId) {};\nwindow.Room.removeTile = function(layerNameOrId, tileId) {};\n\n";
        globalCode += "\n/**\n * Engine Time & Execution Scheduler\n * Tracks delta time for smooth logic and manages asynchronous callbacks securely within the game loop.\n */\nwindow.Time = {\n    deltaTime: 0,\n    time: 0,\n    lastTime: 0,\n    \n    update: function(currentTime) {\n        if (this.lastTime === 0) this.lastTime = currentTime;\n        this.deltaTime = currentTime - this.lastTime;\n        this.time = currentTime;\n        this.lastTime = currentTime;\n    }\n};\n\nwindow.Timer = {\n    _events: [],\n    \n    /**\n     * Schedules a callback to execute after a delay in milliseconds.\n     * @param {number} delayMs Time to wait in milliseconds.\n     * @param {Function} callback Logic to execute.\n     * @param {object} context The instance triggering the timer (retains 'this' scope).\n     */\n    set: function(delayMs, callback, context = null) {\n        this._events.push({\n            triggerTime: window.Time.time + delayMs,\n            callback: callback,\n            context: context\n        });\n    },\n    \n    update: function() {\n        const now = window.Time.time;\n        // Loop backwards to safely remove items while iterating\n        for (let i = this._events.length - 1; i >= 0; i--) {\n            const event = this._events[i];\n            if (now >= event.triggerTime) {\n                if (typeof event.callback === \"function\") {\n                    event.callback.call(event.context);\n                }\n                this._events.splice(i, 1);\n            }\n        }\n    }\n};\n\n";
        globalCode += "\n/**\n * Global Particle Emitter System\n * Spawns lightweight, non-colliding visual effects with framerate-independent physics.\n */\nwindow.ParticleEmitter = {\n    /**\n     * Spawns a burst of particles.\n     * @param {Object} config Configuration object for the particles.\n     */\n    burst: function(config) {\n        const count = config.count || 1;\n        for (let i = 0; i < count; i++) {\n            this.spawn(config);\n        }\n    },\n\n    spawn: function(config) {\n        const sprite = config.sprite;\n        if (!sprite) {\n            console.warn(\"ParticleEmitter: No sprite provided.\");\n            return;\n        }\n\n        const layerId = config.layerId || (window.LiveInstances.length > 0 ? window.LiveInstances[0].layerId : \"Instances\");\n\n        // Helper to extract strict numbers or randomize from an array [min, max]\n        const getVal = (val, defaultVal) => {\n            if (Array.isArray(val)) return val[0] + Math.random() * (val[1] - val[0]);\n            return val !== undefined ? val : defaultVal;\n        };\n\n        const x = getVal(config.x, 0);\n        const y = getVal(config.y, 0);\n        \n        // Physics\n        const speed = getVal(config.speed, 100); \n        const direction = getVal(config.direction, 0); // 0 = Right, 90 = Up, 180 = Left, 270 = Down\n        const dirRad = direction * (Math.PI / 180);\n        \n        const hsp = Math.cos(dirRad) * speed;\n        const vsp = -Math.sin(dirRad) * speed; \n        const gravity = getVal(config.gravity, 0);\n        \n        // Lifespan & Visuals\n        const life = getVal(config.life, 1000); // Milliseconds\n        const startAlpha = getVal(config.startAlpha, 1);\n        const endAlpha = getVal(config.endAlpha, 0);\n        const startScale = getVal(config.startScale, 1);\n        const endScale = getVal(config.endScale, 1);\n        const animSpeed = getVal(config.animationSpeed, 1);\n\n        const particle = {\n            id: \"particle_\" + Math.random(),\n            layerId: layerId,\n            sprite: sprite,\n            x: x,\n            y: y,\n            width: 32, \n            height: 32,\n            scaleX: startScale,\n            scaleY: startScale,\n            angle: getVal(config.angle, direction), \n            alpha: startAlpha,\n            animationSpeed: animSpeed,\n            currentFrame: 0,\n            visible: true,\n            _destroyed: false,\n            \n            // Internal Particle State\n            hsp: hsp,\n            vsp: vsp,\n            grav: gravity,\n            life: life,\n            maxLife: life,\n            startAlpha: startAlpha,\n            endAlpha: endAlpha,\n            startScale: startScale,\n            endScale: endScale,\n\n            onStep: function() {\n                const dt = window.Time.deltaTime / 1000; \n\n                // Apply Gravity & Movement\n                this.vsp += this.grav * dt;\n                this.x += this.hsp * dt;\n                this.y += this.vsp * dt;\n\n                // Lifecycle Interpolation (Alpha & Scale fading)\n                this.life -= window.Time.deltaTime;\n                const progress = 1 - (this.life / this.maxLife);\n\n                if (this.startAlpha !== this.endAlpha) {\n                    this.alpha = this.startAlpha + (this.endAlpha - this.startAlpha) * progress;\n                }\n                if (this.startScale !== this.endScale) {\n                    const currentScale = this.startScale + (this.endScale - this.startScale) * progress;\n                    this.scaleX = currentScale;\n                    this.scaleY = currentScale;\n                }\n\n                if (this.life <= 0) {\n                    this._destroyed = true;\n                }\n            }\n        };\n\n        window.LiveInstances.push(particle);\n    }\n};\n\n";
        globalCode += "\n// Initialize hardware audio context for gapless playback\nwindow.AudioCtx = window.AudioCtx || new (window.AudioContext || window.webkitAudioContext)();\n\n// Add Master Compressor to protect ears\nif (!window.MasterLimiter) {\n    window.MasterLimiter = window.AudioCtx.createDynamicsCompressor();\n    window.MasterLimiter.threshold.value = -12; \n    window.MasterLimiter.ratio.value = 20;      \n    window.MasterLimiter.attack.value = 0.003;  \n    window.MasterLimiter.release.value = 0.25;  \n    window.MasterLimiter.connect(window.AudioCtx.destination);\n}\n\nwindow.SoundManager = {\n    _activeNodes: new Map(),\n    _bgmAudio: null, \n    _bgmFadeInterval: null,\n\n    // --- SFX (WEB AUDIO API) ---\n    \n    // Added 'offset' parameter to start at a specific timestamp\n    play: function(soundId, loop = false, volume = 1.0, pitch = 1.0, offset = 0) {\n        if (!window.AudioCache || !window.AudioCache[soundId]) return null;\n        if (window.AudioCtx.state === \"suspended\") window.AudioCtx.resume();\n\n        const buffer = window.AudioCache[soundId];\n        const source = window.AudioCtx.createBufferSource();\n        const gainNode = window.AudioCtx.createGain();\n\n        source.buffer = buffer;\n        source.loop = loop;\n        source.playbackRate.value = pitch;\n        gainNode.gain.value = Math.max(0, Math.min(1, volume));\n\n        source.connect(gainNode);\n        gainNode.connect(window.MasterLimiter);\n\n        const instanceId = soundId + \"_\" + Date.now() + \"_\" + Math.random();\n        \n        // Store the buffer and settings so we can recreate it later for scrubbing\n        this._activeNodes.set(instanceId, { \n            soundId, \n            buffer, \n            source, \n            gainNode, \n            loop, \n            pitch \n        });\n\n        source.onended = () => {\n            if (!loop) this._activeNodes.delete(instanceId);\n        };\n\n        source.start(0, offset);\n        return instanceId;\n    },\n\n    // NEW: Hot-swaps the audio node to a new timestamp seamlessly\n    setPlayTime: function(instanceId, timeInSeconds) {\n        const nodeData = this._activeNodes.get(instanceId);\n        if (!nodeData) return;\n\n        // 1. Kill the old source safely\n        nodeData.source.onended = null; \n        nodeData.source.stop();\n        nodeData.source.disconnect();\n\n        // 2. Create a brand new source with the exact same settings\n        const newSource = window.AudioCtx.createBufferSource();\n        newSource.buffer = nodeData.buffer;\n        newSource.loop = nodeData.loop;\n        newSource.playbackRate.value = nodeData.pitch;\n\n        // 3. Connect it to the EXISTING volume node so fades aren't interrupted\n        newSource.connect(nodeData.gainNode);\n\n        // 4. Start at the new timestamp\n        newSource.start(0, timeInSeconds);\n\n        // 5. Reattach cleanup logic\n        newSource.onended = () => {\n            if (!nodeData.loop) this._activeNodes.delete(instanceId);\n        };\n\n        // 6. Update our tracker\n        nodeData.source = newSource;\n    },\n\n    stop: function(instanceId) {\n        const nodeData = this._activeNodes.get(instanceId);\n        if (nodeData) {\n            nodeData.source.onended = null;\n            nodeData.source.stop();\n            nodeData.source.disconnect();\n            nodeData.gainNode.disconnect();\n            this._activeNodes.delete(instanceId);\n        }\n    },\n\n    fadeOutSFX: function(instanceId, durationInSeconds, callback = null) {\n        const nodeData = this._activeNodes.get(instanceId);\n        if (!nodeData) {\n            if (callback) callback();\n            return;\n        }\n        \n        const gainNode = nodeData.gainNode;\n        const startVol = gainNode.gain.value;\n        \n        gainNode.gain.setValueAtTime(startVol, window.AudioCtx.currentTime);\n        gainNode.gain.linearRampToValueAtTime(0, window.AudioCtx.currentTime + durationInSeconds);\n        \n        setTimeout(() => {\n            this.stop(instanceId);\n            if (callback) callback();\n        }, durationInSeconds * 1000);\n    },\n\n    stopAll: function() {\n        this._activeNodes.forEach((nodeData, instanceId) => {\n            this.stop(instanceId);\n        });\n        this._activeNodes.clear();\n        this.stopBGM(); \n    },\n    \n    setVolume: function(instanceId, volume) {\n        const nodeData = this._activeNodes.get(instanceId);\n        if (nodeData) {\n            nodeData.gainNode.gain.value = Math.max(0, Math.min(1, volume));\n        }\n    },\n\n    // --- BGM (HTML5 AUDIO) ---\n    playBGM: function(soundId, volume = 1.0) {\n        if (!window.AudioBlobCache || !window.AudioBlobCache[soundId]) return;\n\n        this.stopBGM();\n        this._bgmAudio = new Audio(window.AudioBlobCache[soundId]);\n        this._bgmAudio.loop = true;\n        this._bgmAudio.volume = Math.max(0, Math.min(1, volume));\n        \n        this._bgmAudio.play().catch(e => console.warn(\"BGM autoplay blocked.\", e));\n    },\n\n    fadeInBGM: function(soundId, durationInSeconds = 1, targetVolume = 1.0, callback = null) {\n        if (!window.AudioBlobCache || !window.AudioBlobCache[soundId]) return;\n\n        this.stopBGM();\n        this._bgmAudio = new Audio(window.AudioBlobCache[soundId]);\n        this._bgmAudio.loop = true;\n        this._bgmAudio.volume = 0;\n        \n        this._bgmAudio.play().then(() => {\n            const steps = 30; \n            const stepTime = (durationInSeconds * 1000) / steps;\n            const volStep = targetVolume / steps;\n            let currentStep = 0;\n\n            clearInterval(this._bgmFadeInterval);\n            this._bgmFadeInterval = setInterval(() => {\n                currentStep++;\n                if (!this._bgmAudio) return clearInterval(this._bgmFadeInterval);\n                \n                this._bgmAudio.volume = Math.min(targetVolume, volStep * currentStep);\n\n                if (currentStep >= steps) {\n                    clearInterval(this._bgmFadeInterval);\n                    this._bgmAudio.volume = targetVolume;\n                    if (callback) callback();\n                }\n            }, stepTime);\n        }).catch(e => console.warn(\"BGM autoplay blocked.\", e));\n    },\n\n    fadeOutBGM: function(durationInSeconds = 1, callback = null) {\n        if (!this._bgmAudio || this._bgmAudio.paused) {\n            if (callback) callback();\n            return;\n        }\n\n        const startVol = this._bgmAudio.volume;\n        const steps = 30;\n        const stepTime = (durationInSeconds * 1000) / steps;\n        const volStep = startVol / steps;\n        let currentStep = 0;\n        \n        clearInterval(this._bgmFadeInterval);\n        this._bgmFadeInterval = setInterval(() => {\n            currentStep++;\n            if (!this._bgmAudio) return clearInterval(this._bgmFadeInterval);\n            \n            this._bgmAudio.volume = Math.max(0, startVol - (volStep * currentStep));\n\n            if (currentStep >= steps) {\n                clearInterval(this._bgmFadeInterval);\n                this.stopBGM();\n                if (callback) callback();\n            }\n        }, stepTime);\n    },\n\n    stopBGM: function() {\n        clearInterval(this._bgmFadeInterval);\n        if (this._bgmAudio) {\n            this._bgmAudio.pause();\n            this._bgmAudio.src = \"\";\n            this._bgmAudio = null;\n        }\n    },\n\n    pauseBGM: function() {\n        if (this._bgmAudio && !this._bgmAudio.paused) this._bgmAudio.pause();\n    },\n\n    resumeBGM: function() {\n        if (this._bgmAudio && this._bgmAudio.paused) {\n            this._bgmAudio.play().catch(e => console.warn(\"BGM resume blocked.\", e));\n        }\n    }\n};\n\nwindow.Sound = window.SoundManager;\n\n";
        globalCode += "\nwindow.Draw = {\n    _queue: [],\n    \n    text: function(x, y, text, options = {}) {\n        this._queue.push({\n            type: \"text\", x: x, y: y, text: String(text),\n            font: options.font || \"16px monospace\",\n            color: options.color || \"#ffffff\",\n            align: options.align || \"left\",\n            baseline: options.baseline || \"top\",\n            isGUI: options.isGUI !== false,\n            alpha: options.alpha !== undefined ? options.alpha : 1\n        });\n    },\n\n    rect: function(x, y, width, height, color, filled = true, options = {}) {\n        this._queue.push({\n            type: \"rect\", x, y, width, height, color, filled,\n            isGUI: options.isGUI !== false,\n            alpha: options.alpha !== undefined ? options.alpha : 1\n        });\n    },\n\n    light: function(x, y, radius, colorHex, options = {}) {\n         this._queue.push({\n            type: \"light\", x, y, radius, colorHex,\n            isGUI: options.isGUI || false,\n            alpha: options.alpha !== undefined ? options.alpha : 1,\n            blendMode: options.blendMode || \"screen\"\n        });\n    },\n\n    flush: function(ctx, zoomX, zoomY, camX, camY, baseZoomX, baseZoomY) {\n        const bZx = baseZoomX || zoomX;\n        const bZy = baseZoomY || zoomY;\n\n        this._queue.forEach(item => {\n            ctx.save();\n            ctx.globalAlpha = item.alpha;\n\n            const activeZoomX = item.isGUI ? bZx : zoomX;\n            const activeZoomY = item.isGUI ? bZy : zoomY;\n\n            if (item.type === \"text\") {\n                let fontSize = 16;\n                let fontFamily = \"monospace\";\n                const fontMatch = item.font.match(/(\\d+(?:\\.\\d+)?)px\\s+(.*)/);\n                if (fontMatch) {\n                    fontSize = parseFloat(fontMatch[1]);\n                    fontFamily = fontMatch[2];\n                }\n\n                const hdSize = fontSize * activeZoomX;\n                ctx.font = hdSize + \"px \" + fontFamily;\n                ctx.fillStyle = item.color;\n                ctx.textAlign = item.align;\n                ctx.textBaseline = item.baseline;\n                \n                if (!item.isGUI) {\n                    ctx.fillText(item.text, (item.x - camX) * activeZoomX, (item.y - camY) * activeZoomY);\n                } else {\n                    ctx.fillText(item.text, item.x * activeZoomX, item.y * activeZoomY);\n                }\n            } else if (item.type === \"rect\") {\n                ctx.scale(activeZoomX, activeZoomY);\n                if (!item.isGUI) ctx.translate(-camX, -camY);\n                \n                ctx.fillStyle = item.color;\n                ctx.strokeStyle = item.color;\n                if (item.filled) ctx.fillRect(item.x, item.y, item.width, item.height);\n                else ctx.strokeRect(item.x, item.y, item.width, item.height);\n                \n            } else if (item.type === \"light\") {\n                ctx.scale(activeZoomX, activeZoomY);\n                if (!item.isGUI) ctx.translate(-camX, -camY);\n                \n                ctx.globalCompositeOperation = item.blendMode; \n                \n                let r = 255, g = 255, b = 255;\n                if (item.colorHex && item.colorHex.startsWith(\"#\")) {\n                    const hex = item.colorHex.replace(\"#\", \"\");\n                    if (hex.length === 6) {\n                        r = parseInt(hex.substring(0, 2), 16);\n                        g = parseInt(hex.substring(2, 4), 16);\n                        b = parseInt(hex.substring(4, 6), 16);\n                    }\n                }\n                \n                const grad = ctx.createRadialGradient(item.x, item.y, 0, item.x, item.y, item.radius);\n                grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);\n                grad.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, 0.6)`);\n                grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);\n                \n                ctx.fillStyle = grad;\n                ctx.beginPath();\n                ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);\n                ctx.fill();\n            }\n            \n            ctx.restore();\n        });\n        \n        this._queue = [];\n    }\n};\n\n";
        globalCode += "\nwindow.Save = {\n    prefix: \"kineme_save_\",\n\n    /**\n     * Serializes and saves a value to local storage.\n     * @param {string} key - The unique identifier for this save data.\n     * @param {any} value - The data to save (strings, numbers, objects, or arrays).\n     */\n    set: function(key, value) {\n        try {\n            const serialized = JSON.stringify(value);\n            localStorage.setItem(this.prefix + key, serialized);\n        } catch (e) {\n            console.error(\"SaveManager: Failed to save data\", e);\n        }\n    },\n\n    /**\n     * Retrieves and parses a value from local storage.\n     * @param {string} key - The unique identifier for this save data.\n     * @param {any} defaultValue - The fallback value if the key does not exist.\n     * @returns {any} The loaded data, or the defaultValue.\n     */\n    get: function(key, defaultValue = null) {\n        try {\n            const item = localStorage.getItem(this.prefix + key);\n            if (item === null) return defaultValue;\n            return JSON.parse(item);\n        } catch (e) {\n            console.error(\"SaveManager: Failed to load data\", e);\n            return defaultValue;\n        }\n    },\n\n    /**\n     * Deletes a specific save key from storage.\n     * @param {string} key - The key to delete.\n     */\n    delete: function(key) {\n        localStorage.removeItem(this.prefix + key);\n    },\n\n    /**\n     * Clears all save data generated specifically by this game engine.\n     * Leaves other website data untouched.\n     */\n    clearAll: function() {\n        const keysToRemove = [];\n        for (let i = 0; i < localStorage.length; i++) {\n            const k = localStorage.key(i);\n            if (k && k.startsWith(this.prefix)) {\n                keysToRemove.push(k);\n            }\n        }\n        keysToRemove.forEach(k => localStorage.removeItem(k));\n    }\n};\n\n";
        globalCode += "\nwindow.Pathfinder = {\n    /**\n     * Calculates the shortest path between two points avoiding a specific obstacle ID.\n     * @param {number} startX - Origin X\n     * @param {number} startY - Origin Y\n     * @param {number} targetX - Destination X\n     * @param {number} targetY - Destination Y\n     * @param {number} gridSize - Resolution of the nav grid (e.g., 32 for standard tiles)\n     * @param {string} avoidObjId - The object ID to treat as a solid wall\n     * @param {number} maxNodes - Engine safety limit to prevent freezing on impossible paths\n     * @returns {Array<{x, y}>} Array of waypoint coordinates\n     */\n    findPath: function(startX, startY, targetX, targetY, gridSize, avoidObjId, maxNodes = 500) {\n        // Snap coordinates to exact grid boundaries for uniform calculation\n        const startNode = { x: Math.floor(startX / gridSize) * gridSize, y: Math.floor(startY / gridSize) * gridSize };\n        const targetNode = { x: Math.floor(targetX / gridSize) * gridSize, y: Math.floor(targetY / gridSize) * gridSize };\n\n        if (startNode.x === targetNode.x && startNode.y === targetNode.y) return [];\n\n        const openList = [startNode];\n        const closedSet = new Set();\n        \n        startNode.g = 0;\n        startNode.h = Math.abs(startNode.x - targetNode.x) + Math.abs(startNode.y - targetNode.y);\n        startNode.f = startNode.g + startNode.h;\n        startNode.parent = null;\n\n        const getNeighbors = (node) => {\n            return [\n                {x: 0, y: -gridSize}, {x: gridSize, y: 0}, \n                {x: 0, y: gridSize}, {x: -gridSize, y: 0},\n                {x: gridSize, y: -gridSize}, {x: gridSize, y: gridSize}, \n                {x: -gridSize, y: gridSize}, {x: -gridSize, y: -gridSize}\n            ].map(d => ({ x: node.x + d.x, y: node.y + d.y }));\n        };\n\n        // Virtual entity used strictly to query the CollisionManager API\n        const mockInst = {\n            id: \"pathfinder_mock\",\n            scaleX: 1, scaleY: 1,\n            // Shrink mask slightly to allow sliding through tight 1-block corridors\n            mask: { offsetX: 1, offsetY: 1, width: gridSize - 2, height: gridSize - 2 }, \n            visible: true, _destroyed: false\n        };\n\n        let nodesChecked = 0;\n\n        while (openList.length > 0) {\n            // Safety trigger. If area is too complex or unreachable, return empty path rather than crashing page\n            if (nodesChecked++ > maxNodes) break; \n\n            openList.sort((a, b) => a.f - b.f);\n            const currentNode = openList.shift();\n            const nodeKey = currentNode.x + \",\" + currentNode.y;\n            \n            closedSet.add(nodeKey);\n\n            if (currentNode.x === targetNode.x && currentNode.y === targetNode.y) {\n                const path = [];\n                let curr = currentNode;\n                while (curr.parent) {\n                    // Shift coordinates to center of grid cell to prevent objects hugging the top-left walls\n                    path.push({ x: curr.x + (gridSize/2), y: curr.y + (gridSize/2) });\n                    curr = curr.parent;\n                }\n                return path.reverse();\n            }\n\n            const neighbors = getNeighbors(currentNode);\n            for (let neighbor of neighbors) {\n                const nKey = neighbor.x + \",\" + neighbor.y;\n                if (closedSet.has(nKey)) continue;\n\n                mockInst.x = neighbor.x;\n                mockInst.y = neighbor.y;\n                \n                if (window.Collision.placeMeeting(mockInst, neighbor.x, neighbor.y, avoidObjId)) {\n                    closedSet.add(nKey);\n                    continue;\n                }\n\n                // Diagonal weighting forces algorithm to prefer straight lines unless diagonal is genuinely faster\n                const isDiagonal = (neighbor.x !== currentNode.x && neighbor.y !== currentNode.y);\n                const moveCost = isDiagonal ? gridSize * 1.4 : gridSize;\n                const gScore = currentNode.g + moveCost;\n                \n                let existingNode = openList.find(n => n.x === neighbor.x && n.y === neighbor.y);\n\n                if (!existingNode || gScore < existingNode.g) {\n                    const hScore = Math.abs(neighbor.x - targetNode.x) + Math.abs(neighbor.y - targetNode.y);\n                    const neighborNode = {\n                        x: neighbor.x, y: neighbor.y,\n                        g: gScore, h: hScore, f: gScore + hScore,\n                        parent: currentNode\n                    };\n                    \n                    if (!existingNode) {\n                        openList.push(neighborNode);\n                    } else {\n                        existingNode.g = neighborNode.g;\n                        existingNode.f = neighborNode.f;\n                        existingNode.parent = neighborNode.parent;\n                    }\n                }\n            }\n        }\n        return []; \n    }\n};\n\n";
        globalCode += "\n/**\n * SceneDirector (Audio-Synced Edition)\n * A cinematic manager that can lock its timeline to the Web Audio hardware clock.\n */\nwindow.SceneDirector = {\n    play: function(timelineData, syncWithAudio = false) {\n        const events = timelineData.sort((a, b) => a.time - b.time);\n        \n        // Capture the exact hardware time when the scene begins\n        const initialAudioTime = (window.AudioCtx && window.AudioCtx.state !== \"suspended\") \n            ? window.AudioCtx.currentTime \n            : 0;\n        \n        const directorInstance = {\n            id: \"director_\" + Date.now(),\n            layerId: \"gui\", \n            visible: true,\n            _destroyed: false,\n            \n            // Timeline & Sync State\n            events: events,\n            currentIndex: 0,\n            elapsedTime: 0,\n            isSynced: syncWithAudio,\n            startAudioTime: initialAudioTime,\n            \n            // Presentation State\n            currentAlpha: 0,\n            targetAlpha: 0,\n            fadeSpeed: 0,\n            subtitle: \"\",\n            fadeColor: \"#000000\",\n            bgColor: null,\n            preRender: null,\n            \n            // --- NEW: Time Scrubbing / Jumping ---\n            jumpTo: function(targetTimeMs) {\n                this.elapsedTime = targetTimeMs;\n                \n                // 1. Recalibrate the Audio Sync Clock\n                if (this.isSynced && window.AudioCtx) {\n                    this.startAudioTime = window.AudioCtx.currentTime - (targetTimeMs / 1000);\n                }\n                \n                // 2. Scan the timeline to find where we belong\n                let catchUpAction = null;\n                this.currentIndex = 0;\n                \n                for (let i = 0; i < this.events.length; i++) {\n                    if (this.events[i].time <= targetTimeMs) {\n                        this.currentIndex = i + 1; // Fast-forward the index\n                        catchUpAction = this.events[i].action; // Store the most recent event\n                    } else {\n                        break;\n                    }\n                }\n                \n                // 3. Clear old cinematic actors to prevent ghosting\n                if (window.LiveInstances) {\n                    window.LiveInstances.forEach(inst => {\n                        if (inst.isActor) inst._destroyed = true;\n                    });\n                }\n\n                // 4. Instantly execute the closest event to set up the scene's visual state\n                if (catchUpAction && typeof catchUpAction === \"function\") {\n                    catchUpAction(this);\n                }\n            },\n            \n            fadeTo: function(targetOpacity, duration, color = \"#000000\") {\n                this.targetAlpha = targetOpacity;\n                this.fadeColor = color; \n                if (duration <= 0) {\n                    this.currentAlpha = targetOpacity;\n                    this.fadeSpeed = 0;\n                } else {\n                    this.fadeSpeed = (targetOpacity - this.currentAlpha) / duration;\n                }\n            },\n\n            showText: function(text) {\n                this.subtitle = text;\n            },\n            \n            onStep: function() {\n                const dt = window.Time ? Time.deltaTime : 16.6;\n                \n                // 1. CHOOSE THE MASTER CLOCK\n                if (this.isSynced && window.AudioCtx && window.AudioCtx.state !== \"suspended\") {\n                    this.elapsedTime = (window.AudioCtx.currentTime - this.startAudioTime) * 1000;\n                } else {\n                    this.elapsedTime += dt;\n                }\n                \n                // 2. Process Timeline Events\n                while (this.currentIndex < this.events.length) {\n                    const nextEvent = this.events[this.currentIndex];\n                    \n                    if (this.elapsedTime >= nextEvent.time) {\n                        if (typeof nextEvent.action === \"function\") {\n                            nextEvent.action(this); \n                        }\n                        this.currentIndex++;\n                    } else {\n                        break; \n                    }\n                }\n                \n                // 3. Process Screen Fading Math\n                if (this.currentAlpha !== this.targetAlpha) {\n                    this.currentAlpha += this.fadeSpeed * dt;\n                    \n                    if (this.fadeSpeed > 0 && this.currentAlpha > this.targetAlpha) this.currentAlpha = this.targetAlpha;\n                    if (this.fadeSpeed < 0 && this.currentAlpha < this.targetAlpha) this.currentAlpha = this.targetAlpha;\n                }\n                \n                // 4. Render Presentation Layer\n                if (window.Draw) {\n                    if (this.currentAlpha > 0) {\n                        const camW = window.Camera ? window.Camera.baseWidth : (window.Room?.width || 640);\n                        const camH = window.Camera ? window.Camera.baseHeight : (window.Room?.height || 360);\n                        Draw.rect(0, 0, camW * 2, camH * 2, this.fadeColor, true, { isGUI: true, alpha: this.currentAlpha });\n                    }\n                    \n                    if (this.subtitle !== \"\") {\n                        const camW = window.Camera ? window.Camera.baseWidth : (window.Room?.width || 640);\n                        const camH = window.Camera ? window.Camera.baseHeight : (window.Room?.height || 360);\n                        Draw.text(camW / 2, camH - 40, this.subtitle, { \n                            font: \"12px Arial\", \n                            align: \"center\", \n                            isGUI: true, \n                            color: \"#ffffff\" \n                        });\n                    }\n                }\n                \n                // 5. Cleanup when timeline is finished\n                if (this.currentIndex >= this.events.length && this.currentAlpha <= 0 && this.subtitle === \"\") {\n                    this._destroyed = true;\n                } \n            }\n        };\n\n        window.LiveInstances.push(directorInstance);\n        return directorInstance; // Return the instance so you can save it to a variable and call .jumpTo() on it\n    }\n};\n\n";
        
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
                if (!inst._destroyed && inst.onStep) {
                    inst.onStep();
                }
            });

            // ==========================================
            // NATIVE BACKGROUND FIX FOR PUBLISHED ENGINE
            // ==========================================
            let activeDirector = liveInstances.find(i => i.id && i.id.startsWith("director_"));
            ctx.fillStyle = (activeDirector && activeDirector.bgColor) ? activeDirector.bgColor : "#000000";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            if (activeDirector && typeof activeDirector.preRender === "function") {
                ctx.save();
                const pCamX = window.Camera ? window.Camera.x : roomData.camera.x;
                const pCamY = window.Camera ? window.Camera.y : roomData.camera.y;
                const pCW = window.Camera ? window.Camera.baseWidth : roomData.camera.width;
                const pCH = window.Camera ? window.Camera.baseHeight : roomData.camera.height;
                
                ctx.scale(canvas.width / pCW, canvas.height / pCH);
                ctx.translate(-pCamX, -pCamY);
                activeDirector.preRender(ctx);
                ctx.restore();
            }
            
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
