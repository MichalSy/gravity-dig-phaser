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
var PLAYER_WIDTH = 40;
var PLAYER_HEIGHT = 64;
var PlayerMovementScript = class extends ScriptNode {
  id = "dynamic.player-movement";
  name = "Player Movement Script";
  levelNodeId = prop.nodeRef(null, { label: "Level Node" });
  inputNodeId = prop.nodeRef(null, { label: "Gameplay Input Node" });
  playerStateNodeId = prop.nodeRef(null, { label: "Player State Node" });
  gravity = prop.number(2640, { min: 0, step: 10, label: "Gravity" });
  groundAcceleration = prop.number(7200, { min: 0, step: 100, label: "Ground Acceleration" });
  airAcceleration = prop.number(5200, { min: 0, step: 100, label: "Air Acceleration" });
  groundFriction = prop.number(8200, { min: 0, step: 100, label: "Ground Friction" });
  airFriction = prop.number(900, { min: 0, step: 100, label: "Air Friction" });
  coyoteTimeMs = prop.number(120, { min: 0, max: 300, step: 10, label: "Coyote Time ms" });
  jumpBufferMs = prop.number(140, { min: 0, max: 300, step: 10, label: "Jump Buffer ms" });
  jumpCutMultiplier = prop.number(0.45, { min: 0.1, max: 1, step: 0.05, label: "Jump Cut Multiplier" });
  maxFallSpeed = prop.number(1450, { min: 200, step: 50, label: "Max Fall Speed" });
  groundSnapPixels = prop.number(4, { min: 0, max: 12, step: 1, label: "Ground Snap px" });
  velocity = { x: 0, y: 0 };
  grounded = false;
  inputBlocked = false;
  player;
  level;
  input;
  playerState;
  coyoteTimerSeconds = 0;
  jumpBufferTimerSeconds = 0;
  jumpHeld = false;
  resolve() {
    this.level = this.levelNodeId ? this.getNodeById(this.levelNodeId) : this.getNode("Level");
    this.input = this.inputNodeId ? this.getNodeById(this.inputNodeId) : this.getNode("GameplayInput");
    this.playerState = this.playerStateNodeId ? this.getNodeById(this.playerStateNodeId) : this.getNode("PlayerState");
  }
  setPlayer(player) {
    this.player = player;
    this.resetMotion();
  }
  resetMotion() {
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.grounded = false;
    this.inputBlocked = false;
    this.coyoteTimerSeconds = 0;
    this.jumpBufferTimerSeconds = 0;
    this.jumpHeld = false;
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
    if (!this.player || !this.level || !this.input) return;
    const dt = Math.min(deltaMs / 1e3, 1 / 30);
    this.updateInput(dt);
    this.updatePhysics(dt);
  }
  updateInput(dt) {
    const menuOpen = this.input?.isMenuOpen?.() === true;
    this.inputBlocked = menuOpen;
    if (menuOpen) {
      this.velocity.x = approach(this.velocity.x, 0, this.groundFriction * dt);
      this.jumpHeld = false;
      this.jumpBufferTimerSeconds = 0;
      return;
    }
    const intent = this.input?.getPlayerIntent({ previousJumpHeld: this.jumpHeld }) ?? { moveX: 0, jumpPressed: false, jumpHeld: false, interactPressed: false };
    const targetSpeed = intent.moveX * this.moveSpeed();
    const accel = this.grounded ? this.groundAcceleration : this.airAcceleration;
    const friction = this.grounded ? this.groundFriction : this.airFriction;
    this.velocity.x = Math.abs(targetSpeed) > 0.01 ? approach(this.velocity.x, targetSpeed, accel * dt) : approach(this.velocity.x, 0, friction * dt);
    if (intent.jumpPressed) this.jumpBufferTimerSeconds = this.jumpBufferMs / 1e3;
    if (!intent.jumpHeld && this.jumpHeld && this.velocity.y < 0) this.velocity.y *= this.jumpCutMultiplier;
    this.jumpHeld = intent.jumpHeld;
    if (this.jumpBufferTimerSeconds > 0) this.jumpBufferTimerSeconds = Math.max(0, this.jumpBufferTimerSeconds - dt);
  }
  updatePhysics(dt) {
    const wasGrounded = this.grounded;
    if (this.jumpBufferTimerSeconds > 0 && (this.grounded || this.coyoteTimerSeconds > 0)) this.jump();
    this.velocity.y = Math.min(this.maxFallSpeed, this.velocity.y + this.gravity * dt);
    this.moveAxis(this.velocity.x * dt, 0);
    this.grounded = false;
    this.moveAxis(0, this.velocity.y * dt);
    this.snapToGround();
    if (wasGrounded && !this.grounded) this.coyoteTimerSeconds = this.coyoteTimeMs / 1e3;
    if (this.grounded) this.coyoteTimerSeconds = 0;
    else if (this.coyoteTimerSeconds > 0) this.coyoteTimerSeconds = Math.max(0, this.coyoteTimerSeconds - dt);
    if (this.jumpBufferTimerSeconds > 0 && (this.grounded || this.coyoteTimerSeconds > 0)) this.jump();
  }
  jump() {
    this.velocity.y = this.jumpVelocity();
    this.grounded = false;
    this.coyoteTimerSeconds = 0;
    this.jumpBufferTimerSeconds = 0;
  }
  moveAxis(dx, dy) {
    if (!this.player || !this.level || dx === 0 && dy === 0) return;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4));
    const stepX = dx / steps;
    const stepY = dy / steps;
    for (let i = 0; i < steps; i += 1) {
      const nextX = this.player.x + stepX;
      const nextY = this.player.y + stepY;
      if (!this.level.collidesBox(nextX, nextY, PLAYER_WIDTH, PLAYER_HEIGHT)) {
        this.player.setPosition(nextX, nextY);
        continue;
      }
      if (dy > 0) this.grounded = true;
      if (dy !== 0) this.velocity.y = 0;
      if (dx !== 0) this.velocity.x = 0;
      break;
    }
  }
  snapToGround() {
    if (!this.player || !this.level || this.grounded || this.velocity.y < 0 || this.groundSnapPixels <= 0) return;
    for (let offset = 1; offset <= this.groundSnapPixels; offset += 1) {
      if (!this.level.collidesBox(this.player.x, this.player.y + offset, PLAYER_WIDTH, PLAYER_HEIGHT)) continue;
      this.player.setPosition(this.player.x, this.player.y + offset - 1);
      this.velocity.y = 0;
      this.grounded = true;
      return;
    }
  }
  moveSpeed() {
    return this.playerState?.stats?.moveSpeed ?? 470;
  }
  jumpVelocity() {
    return this.playerState?.stats?.jumpVelocity ?? -1040;
  }
};
function approach(current, target, delta) {
  if (current < target) return Math.min(target, current + delta);
  if (current > target) return Math.max(target, current - delta);
  return target;
}

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
//# sourceMappingURL=dynamic-nodes.293e24b0b084.js.map
