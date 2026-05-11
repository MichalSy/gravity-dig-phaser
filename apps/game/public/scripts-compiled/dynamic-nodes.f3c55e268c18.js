// script-node-api:script-node-api
var ScriptNode = class {
  log(message, ...values) {
    this.__dynamicNodeContext?.log(message, ...values);
  }
  getNode(key) {
    return this.__dynamicNodeContext?.getNode(key);
  }
  requireNode(key) {
    const node = this.__dynamicNodeContext?.requireNode(key);
    if (!node) throw new Error("Dynamic node context is not initialized");
    return node;
  }
  getNodeById(instanceId) {
    return this.__dynamicNodeContext?.getNodeById(instanceId);
  }
  requireNodeById(instanceId) {
    const node = this.__dynamicNodeContext?.requireNodeById(instanceId);
    if (!node) throw new Error("Dynamic node context is not initialized");
    return node;
  }
  getNodesByName(name) {
    return this.__dynamicNodeContext?.getNodesByName(name) ?? [];
  }
  getAppVersion() {
    return this.__dynamicNodeContext?.getAppVersion() ?? "0.0.0";
  }
  emit(action) {
    this.__dynamicNodeContext?.emit(action);
  }
};
function marker(value, definition) {
  return { __dynamicNodeProp: true, value, definition };
}
var prop = {
  string: (value, options = {}) => marker(value, { type: "String", ...options }),
  number: (value, options = {}) => marker(value, { type: "Number", ...options }),
  boolean: (value, options = {}) => marker(value, { type: "Boolean", ...options }),
  assetId: (value, options = {}) => marker(value, { type: "AssetId", ...options }),
  nodeRef: (value = null, options = {}) => marker(value, { type: "NodeRef", ...options }),
  nodeRefList: (value = [], options = {}) => marker(value, { type: "NodeRefList", ...options })
};

// public/scripts/ExamplePulse.node.ts
var ExamplePulseNode = class extends ScriptNode {
  id = "dynamic.example-pulse";
  name = "Example Pulse Script";
  intervalMs = prop.number(1e3, { min: 100, max: 5e3, step: 100, label: "Interval ms" });
  enabled = prop.boolean(true, { label: "Enabled" });
  elapsedMs = 0;
  update(deltaMs) {
    if (!this.enabled) return;
    this.elapsedMs += deltaMs;
    if (this.elapsedMs < this.intervalMs) return;
    this.elapsedMs = 0;
    this.log("pulse", { intervalMs: this.intervalMs });
  }
};

// public/scripts/GameMenu/MenuScript.node.ts
function wrapIndex(value, length) {
  return (value % length + length) % length;
}
var MenuScript = class extends ScriptNode {
  id = "dynamic.menu-script";
  name = "Menu Script";
  versionNodeId = prop.nodeRef("138dabce-8e4f-4743-94e5-df286ffbf7c8", { label: "Version Text Node" });
  buttonNodeIds = prop.nodeRefList(["9450b803-e4af-4252-a550-368797b71762", "cd7cc808-d43e-4238-8f3e-d31e1687026f"], { label: "Button Nodes" });
  startButtonNodeId = prop.nodeRef("9450b803-e4af-4252-a550-368797b71762", { label: "Start Button" });
  startEvent = prop.string("game:start", { label: "Start Event" });
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
    if (this.keyHandler) window.removeEventListener("keydown", this.keyHandler);
    this.keyHandler = void 0;
  }
  setVersionText() {
    const versionNode = this.versionNodeId ? this.getNodeById(this.versionNodeId) : void 0;
    versionNode?.setText?.(`v${this.getAppVersion()}`);
  }
  bindButtons() {
    this.buttons.forEach((button) => button.setCallbacks?.({}));
    this.buttons = this.buttonNodeIds.map((instanceId) => this.getNodeById(instanceId)).filter((button) => Boolean(button));
    this.buttons.forEach((button) => {
      button.setCallbacks?.({ onHover: (hovered) => this.setActiveIndex(this.buttons.indexOf(hovered)) });
      button.setClickAction?.(() => button.flash?.());
    });
    this.startButton()?.setClickAction?.(() => this.emit(this.startEvent));
    this.syncButtonSelection();
  }
  bindKeyboard() {
    if (this.keyHandler) return;
    this.keyHandler = (event) => {
      if (event.code === "ArrowUp" || event.code === "KeyW") this.moveSelection(-1);
      if (event.code === "ArrowDown" || event.code === "KeyS") this.moveSelection(1);
      if (event.code === "Enter" || event.code === "Space") this.activateCurrent();
    };
    window.addEventListener("keydown", this.keyHandler);
  }
  moveSelection(delta) {
    const enabledIndexes = this.buttons.flatMap((button, index) => button.enabled === false ? [] : [index]);
    if (enabledIndexes.length === 0) return;
    const currentPosition = enabledIndexes.includes(this.activeIndex) ? enabledIndexes.indexOf(this.activeIndex) : 0;
    this.setActiveIndex(enabledIndexes[wrapIndex(currentPosition + delta, enabledIndexes.length)]);
  }
  setActiveIndex(index) {
    if (!this.buttons[index] || this.buttons[index].enabled === false) return;
    this.activeIndex = index;
    this.syncButtonSelection();
  }
  syncButtonSelection() {
    this.buttons.forEach((button, index) => button.setSelected?.(index === this.activeIndex && button.enabled !== false));
  }
  activateCurrent() {
    const button = this.buttons[this.activeIndex];
    if (!button || button.enabled === false) return;
    if (button.instanceId === this.startButtonNodeId) {
      this.emit(this.startEvent);
      return;
    }
    button.flash?.();
  }
  startButton() {
    return this.startButtonNodeId ? this.getNodeById(this.startButtonNodeId) : void 0;
  }
};

// public/scripts/Gameplay/PlayerMovementScript.node.ts
var PLAYER_SIZE = { w: 40, h: 64 };
var HORIZONTAL_COLLISION_SIZE = { w: PLAYER_SIZE.w, h: PLAYER_SIZE.h - 8 };
var VERTICAL_COLLISION_SIZE = { w: PLAYER_SIZE.w - 8, h: PLAYER_SIZE.h };
var GRAVITY = 2640;
var PlayerMovementScript = class extends ScriptNode {
  id = "dynamic.player-movement";
  name = "Player Movement Script";
  levelNodeId = prop.nodeRef(null, { label: "Level Node" });
  inputNodeId = prop.nodeRef(null, { label: "Gameplay Input Node" });
  playerStateNodeId = prop.nodeRef(null, { label: "Player State Node" });
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
    this.levelNode = this.requireResolvedNode(this.levelNodeId, "Level");
    this.playerState = this.requireResolvedNode(this.playerStateNodeId, "PlayerState");
    this.gameplayInput = this.requireResolvedNode(this.inputNodeId, "GameplayInput");
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
    if (!this.player) return;
    const deltaSeconds = deltaMs / 1e3;
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
    if (intent.jumpPressed) this.queueOrPerformJump();
    if (this.jumpBufferTimerSeconds > 0) this.jumpBufferTimerSeconds -= deltaSeconds;
  }
  queueOrPerformJump() {
    if (this.grounded || this.coyoteTimerSeconds > 0) {
      this.jump();
      return;
    }
    this.jumpBufferTimerSeconds = 0.1;
  }
  applyPhysics(deltaSeconds) {
    if (!this.player) return;
    const wasGrounded = this.grounded;
    this.velocity.y += GRAVITY * deltaSeconds;
    this.moveAxis(this.velocity.x * deltaSeconds, 0);
    this.grounded = false;
    this.moveAxis(0, this.velocity.y * deltaSeconds);
    this.stabilizeGroundContact();
    if (wasGrounded && !this.grounded) this.coyoteTimerSeconds = 0.1;
    if (this.coyoteTimerSeconds > 0) this.coyoteTimerSeconds -= deltaSeconds;
    if (this.jumpBufferTimerSeconds > 0 && (this.grounded || this.coyoteTimerSeconds > 0)) {
      this.jump();
      this.jumpBufferTimerSeconds = 0;
    }
  }
  stabilizeGroundContact() {
    if (!this.player || this.grounded || this.velocity.y < 0) return;
    if (!this.levelNode.collidesBox(this.player.x, this.player.y + 1, VERTICAL_COLLISION_SIZE.w, VERTICAL_COLLISION_SIZE.h)) return;
    this.grounded = true;
    this.velocity.y = 0;
  }
  moveAxis(dx, dy) {
    if (!this.player || dx === 0 && dy === 0) return;
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
      if (dy > 0) this.grounded = true;
      if (dy !== 0) this.velocity.y = 0;
      if (dx !== 0) this.velocity.x = 0;
      break;
    }
  }
  jump() {
    this.velocity.y = this.playerState.stats.jumpVelocity;
    this.grounded = false;
    this.coyoteTimerSeconds = 0;
  }
  requireResolvedNode(instanceId, fallbackName) {
    const node = (instanceId ? this.getNodeById(instanceId) : void 0) ?? this.getNode(fallbackName);
    if (!node) throw new Error(`Required node '${instanceId ?? fallbackName}' was not found`);
    return node;
  }
};

// node_modules/.script-build/dynamic-nodes.entry.ts
function createDynamicNodeModule(ScriptClass, baseName) {
  const probe = new ScriptClass();
  const nodeTypeId = typeof probe.id === "string" && probe.id.length > 0 ? probe.id : baseName;
  const displayName = typeof probe.name === "string" && probe.name.length > 0 ? probe.name : nodeTypeId;
  return {
    nodeTypeId,
    displayName,
    createBehavior() {
      return new ScriptClass();
    }
  };
}
var modules = [
  createDynamicNodeModule(ExamplePulseNode, "ExamplePulse"),
  createDynamicNodeModule(MenuScript, "GameMenu-MenuScript"),
  createDynamicNodeModule(PlayerMovementScript, "Gameplay-PlayerMovementScript")
];
var dynamic_nodes_entry_default = { modules };
export {
  dynamic_nodes_entry_default as default,
  modules
};
//# sourceMappingURL=dynamic-nodes.f3c55e268c18.js.map
