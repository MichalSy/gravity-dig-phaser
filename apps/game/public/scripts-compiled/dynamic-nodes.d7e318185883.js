class ScriptNode {
    log(message, ...values) { this.__dynamicNodeContext?.log(message, ...values); }
    getNode(key) { return this.__dynamicNodeContext?.getNode(key); }
    requireNode(key) {
        const node = this.__dynamicNodeContext?.requireNode(key);
        if (!node)
            throw new Error('Dynamic node context is not initialized');
        return node;
    }
    getNodeById(instanceId) { return this.__dynamicNodeContext?.getNodeById(instanceId); }
    requireNodeById(instanceId) {
        const node = this.__dynamicNodeContext?.requireNodeById(instanceId);
        if (!node)
            throw new Error('Dynamic node context is not initialized');
        return node;
    }
    getNodesByName(name) { return this.__dynamicNodeContext?.getNodesByName(name) ?? []; }
    getAppVersion() { return this.__dynamicNodeContext?.getAppVersion() ?? '0.0.0'; }
    getRuntimeMode() { return this.__dynamicNodeContext?.getRuntimeMode() ?? 'play'; }
    emit(action) { this.__dynamicNodeContext?.emit(action); }
}
function marker(value, definition) { return { __dynamicNodeProp: true, value, definition }; }
const prop = {
    string: (value, options = {}) => marker(value, { type: 'String', ...options }),
    number: (value, options = {}) => marker(value, { type: 'Number', ...options }),
    boolean: (value, options = {}) => marker(value, { type: 'Boolean', ...options }),
    assetId: (value, options = {}) => marker(value, { type: 'AssetId', ...options }),
    nodeRef: (value = null, options = {}) => marker(value, { type: 'NodeRef', ...options }),
    nodeRefList: (value = [], options = {}) => marker(value, { type: 'NodeRefList', ...options }),
};
function createDynamicNodeModule0() {
    const Core = { ScriptNode, prop };
    class ExamplePulseNode extends Core.ScriptNode {
        id = 'dynamic.example-pulse';
        name = 'Example Pulse Script';
        intervalMs = Core.prop.number(1000, { min: 100, max: 5000, step: 100, label: 'Interval ms' });
        enabled = Core.prop.boolean(true, { label: 'Enabled' });
        elapsedMs = 0;
        update(deltaMs) {
            if (!this.enabled)
                return;
            this.elapsedMs += deltaMs;
            if (this.elapsedMs < this.intervalMs)
                return;
            this.elapsedMs = 0;
            this.log('pulse', { intervalMs: this.intervalMs });
        }
    }
    const probe = new ExamplePulseNode();
    const nodeTypeId = typeof probe.id === 'string' && probe.id.length > 0 ? probe.id : 'ExamplePulse';
    const displayName = typeof probe.name === 'string' && probe.name.length > 0 ? probe.name : nodeTypeId;
    return {
        nodeTypeId,
        displayName,
        createBehavior() { return new ExamplePulseNode(); },
    };
}
function createDynamicNodeModule1() {
    const Core = { ScriptNode, prop };
    function wrapIndex(value, length) {
        return ((value % length) + length) % length;
    }
    class MenuScript extends Core.ScriptNode {
        id = 'dynamic.menu-script';
        name = 'Menu Script';
        versionNodeId = Core.prop.nodeRef('138dabce-8e4f-4743-94e5-df286ffbf7c8', { label: 'Version Text Node' });
        buttonNodeIds = Core.prop.nodeRefList(['9450b803-e4af-4252-a550-368797b71762', 'cd7cc808-d43e-4238-8f3e-d31e1687026f'], { label: 'Button Nodes' });
        startButtonNodeId = Core.prop.nodeRef('9450b803-e4af-4252-a550-368797b71762', { label: 'Start Button' });
        startEvent = Core.prop.string('game:start', { label: 'Start Event' });
        buttons = [];
        activeIndex = 0;
        keyHandler;
        resolve() {
            this.setVersionText();
            this.bindButtons();
            this.bindKeyboard();
        }
        destroy() {
            this.buttons.forEach((button) => button.setCallbacks?.({}));
            this.buttons = [];
            if (this.keyHandler)
                window.removeEventListener('keydown', this.keyHandler);
            this.keyHandler = undefined;
        }
        setVersionText() {
            const versionNode = this.versionNodeId ? this.getNodeById(this.versionNodeId) : undefined;
            versionNode?.setText?.(`v${this.getAppVersion()}`);
        }
        bindButtons() {
            this.buttons.forEach((button) => button.setCallbacks?.({}));
            this.buttons = this.buttonNodeIds
                .map((instanceId) => this.getNodeById(instanceId))
                .filter((button) => Boolean(button));
            this.buttons.forEach((button) => {
                button.setCallbacks?.({ onHover: (hovered) => this.setActiveIndex(this.buttons.indexOf(hovered)) });
                button.setClickAction?.(() => button.flash?.());
            });
            this.startButton()?.setClickAction?.(() => this.emit(this.startEvent));
            this.syncButtonSelection();
        }
        bindKeyboard() {
            if (this.keyHandler)
                return;
            this.keyHandler = (event) => {
                if (event.code === 'ArrowUp' || event.code === 'KeyW')
                    this.moveSelection(-1);
                if (event.code === 'ArrowDown' || event.code === 'KeyS')
                    this.moveSelection(1);
                if (event.code === 'Enter' || event.code === 'Space')
                    this.activateCurrent();
            };
            window.addEventListener('keydown', this.keyHandler);
        }
        moveSelection(delta) {
            const enabledIndexes = this.buttons.flatMap((button, index) => button.enabled === false ? [] : [index]);
            if (enabledIndexes.length === 0)
                return;
            const currentPosition = enabledIndexes.includes(this.activeIndex) ? enabledIndexes.indexOf(this.activeIndex) : 0;
            this.setActiveIndex(enabledIndexes[wrapIndex(currentPosition + delta, enabledIndexes.length)]);
        }
        setActiveIndex(index) {
            if (!this.buttons[index] || this.buttons[index].enabled === false)
                return;
            this.activeIndex = index;
            this.syncButtonSelection();
        }
        syncButtonSelection() {
            this.buttons.forEach((button, index) => button.setSelected?.(index === this.activeIndex && button.enabled !== false));
        }
        activateCurrent() {
            const button = this.buttons[this.activeIndex];
            if (!button || button.enabled === false)
                return;
            if (button.instanceId === this.startButtonNodeId) {
                this.emit(this.startEvent);
                return;
            }
            button.flash?.();
        }
        startButton() {
            return this.startButtonNodeId ? this.getNodeById(this.startButtonNodeId) : undefined;
        }
    }
    const probe = new MenuScript();
    const nodeTypeId = typeof probe.id === 'string' && probe.id.length > 0 ? probe.id : 'GameMenu-MenuScript';
    const displayName = typeof probe.name === 'string' && probe.name.length > 0 ? probe.name : nodeTypeId;
    return {
        nodeTypeId,
        displayName,
        createBehavior() { return new MenuScript(); },
    };
}
function createDynamicNodeModule2() {
    const Core = { ScriptNode, prop };
    const PLAYER_SIZE = { w: 40, h: 64 };
    const HORIZONTAL_COLLISION_SIZE = { w: PLAYER_SIZE.w, h: PLAYER_SIZE.h - 8 };
    const VERTICAL_COLLISION_SIZE = { w: PLAYER_SIZE.w - 8, h: PLAYER_SIZE.h };
    const GRAVITY = 2640;
    class PlayerMovementScript extends Core.ScriptNode {
        id = 'dynamic.player-movement';
        name = 'Player Movement Script';
        levelNodeId = Core.prop.nodeRef(null, { label: 'Level Node' });
        inputNodeId = Core.prop.nodeRef(null, { label: 'Gameplay Input Node' });
        playerStateNodeId = Core.prop.nodeRef(null, { label: 'Player State Node' });
        velocity = { x: 0, y: 0 };
        grounded = false;
        inputBlocked = false;
        levelNode;
        playerState;
        gameplayInput;
        player;
        coyoteTimerSeconds = 0;
        jumpBufferTimerSeconds = 0;
        jumpHeld = false;
        resolve() {
            this.levelNode = this.requireResolvedNode(this.levelNodeId, 'Level');
            this.playerState = this.requireResolvedNode(this.playerStateNodeId, 'PlayerState');
            this.gameplayInput = this.requireResolvedNode(this.inputNodeId, 'GameplayInput');
        }
        setPlayer(player) {
            this.player = player;
            this.resetMotion();
        }
        resetMotion() {
            this.velocity.x = 0;
            this.velocity.y = 0;
            this.grounded = false;
            this.coyoteTimerSeconds = 0;
            this.jumpBufferTimerSeconds = 0;
            this.jumpHeld = false;
        }
        blockInput() {
            this.inputBlocked = true;
            this.velocity.x = 0;
            this.jumpHeld = false;
            this.jumpBufferTimerSeconds = 0;
        }
        unblockInput() {
            this.inputBlocked = false;
        }
        getVelocity() {
            return this.velocity;
        }
        isGrounded() {
            return this.grounded;
        }
        isInputBlocked() {
            return this.inputBlocked;
        }
        update(deltaMs) {
            if (!this.player)
                return;
            const deltaSeconds = deltaMs / 1000;
            this.handleInput(deltaSeconds);
            this.applyPhysics(deltaSeconds);
        }
        handleInput(deltaSeconds) {
            if (this.inputBlocked) {
                this.velocity.x = 0;
                this.jumpHeld = false;
                this.jumpBufferTimerSeconds = 0;
                return;
            }
            const intent = this.gameplayInput.getPlayerIntent({ previousJumpHeld: this.jumpHeld });
            this.velocity.x = intent.moveX * this.playerState.stats.moveSpeed;
            this.jumpHeld = intent.jumpHeld;
            if (intent.jumpPressed)
                this.queueOrPerformJump();
            if (this.jumpBufferTimerSeconds > 0)
                this.jumpBufferTimerSeconds -= deltaSeconds;
        }
        queueOrPerformJump() {
            if (this.grounded || this.coyoteTimerSeconds > 0) {
                this.jump();
                return;
            }
            this.jumpBufferTimerSeconds = 0.1;
        }
        applyPhysics(deltaSeconds) {
            if (!this.player)
                return;
            const wasGrounded = this.grounded;
            this.velocity.y += GRAVITY * deltaSeconds;
            this.moveAxis(this.velocity.x * deltaSeconds, 0);
            this.grounded = false;
            this.moveAxis(0, this.velocity.y * deltaSeconds);
            this.stabilizeGroundContact();
            if (wasGrounded && !this.grounded)
                this.coyoteTimerSeconds = 0.1;
            if (this.coyoteTimerSeconds > 0)
                this.coyoteTimerSeconds -= deltaSeconds;
            if (this.jumpBufferTimerSeconds > 0 && (this.grounded || this.coyoteTimerSeconds > 0)) {
                this.jump();
                this.jumpBufferTimerSeconds = 0;
            }
        }
        stabilizeGroundContact() {
            if (!this.player || this.grounded || this.velocity.y < 0)
                return;
            if (!this.levelNode.collidesBox(this.player.x, this.player.y + 1, VERTICAL_COLLISION_SIZE.w, VERTICAL_COLLISION_SIZE.h))
                return;
            this.grounded = true;
            this.velocity.y = 0;
        }
        moveAxis(dx, dy) {
            if (!this.player || (dx === 0 && dy === 0))
                return;
            const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 8);
            const stepX = dx / steps;
            const stepY = dy / steps;
            for (let i = 0; i < steps; i += 1) {
                const nextX = this.player.x + stepX;
                const nextY = this.player.y + stepY;
                const collisionSize = dx !== 0 ? HORIZONTAL_COLLISION_SIZE : VERTICAL_COLLISION_SIZE;
                if (!this.levelNode.collidesBox(nextX, nextY, collisionSize.w, collisionSize.h)) {
                    this.player.setPosition(nextX, nextY);
                    continue;
                }
                if (dy > 0)
                    this.grounded = true;
                if (dy !== 0)
                    this.velocity.y = 0;
                if (dx !== 0)
                    this.velocity.x = 0;
                break;
            }
        }
        jump() {
            this.velocity.y = this.playerState.stats.jumpVelocity;
            this.grounded = false;
            this.coyoteTimerSeconds = 0;
            this.emit('player:jump');
        }
        requireResolvedNode(instanceId, fallbackName) {
            const node = (instanceId ? this.getNodeById(instanceId) : undefined) ?? this.getNode(fallbackName);
            if (!node)
                throw new Error(`Required node '${instanceId ?? fallbackName}' was not found`);
            return node;
        }
    }
    const probe = new PlayerMovementScript();
    const nodeTypeId = typeof probe.id === 'string' && probe.id.length > 0 ? probe.id : 'Gameplay-PlayerMovementScript';
    const displayName = typeof probe.name === 'string' && probe.name.length > 0 ? probe.name : nodeTypeId;
    return {
        nodeTypeId,
        displayName,
        createBehavior() { return new PlayerMovementScript(); },
    };
}
function createDynamicNodeModule3() {
    const Core = { ScriptNode, prop };
    class LoadingScript extends Core.ScriptNode {
        id = 'dynamic.loading-script';
        name = 'Loading Script';
        progressNodeId = Core.prop.nodeRef('d68a8bc0-3995-48d8-8d70-a75477d881d7', { label: 'Progress Text Node' });
        minimumDurationMs = Core.prop.number(900, { min: 0, max: 5000, step: 100, label: 'Minimum Duration ms' });
        loadEvent = Core.prop.string('game:load', { label: 'Load Event' });
        mountEvent = Core.prop.string('game:mount', { label: 'Mount Event' });
        elapsedMs = 0;
        loaded = false;
        mounted = false;
        resolve() {
            this.setProgress(0);
            if (this.getRuntimeMode() === 'play')
                this.emit(this.loadEvent);
        }
        update(deltaMs) {
            if (this.mounted || this.getRuntimeMode() !== 'play')
                return;
            this.elapsedMs += deltaMs;
            if (!this.loaded || this.elapsedMs < this.minimumDurationMs)
                return;
            this.mounted = true;
            this.emit(this.mountEvent);
        }
        setProgress(progress) {
            const value = Math.max(0, Math.min(1, progress));
            this.progressNode()?.setText?.(`${Math.round(value * 100)}%`);
        }
        complete() {
            this.setProgress(1);
            this.loaded = true;
        }
        progressNode() {
            return this.progressNodeId ? this.getNodeById(this.progressNodeId) : undefined;
        }
    }
    const probe = new LoadingScript();
    const nodeTypeId = typeof probe.id === 'string' && probe.id.length > 0 ? probe.id : 'Loading-LoadingScript';
    const displayName = typeof probe.name === 'string' && probe.name.length > 0 ? probe.name : nodeTypeId;
    return {
        nodeTypeId,
        displayName,
        createBehavior() { return new LoadingScript(); },
    };
}
const modules = [createDynamicNodeModule0(), createDynamicNodeModule1(), createDynamicNodeModule2(), createDynamicNodeModule3()];
export default { modules };
export { modules };
