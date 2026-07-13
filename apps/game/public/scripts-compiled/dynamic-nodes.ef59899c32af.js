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
  getRuntimeMode() {
    return this.__dynamicNodeContext?.getRuntimeMode() ?? "play";
  }
  getViewportSize() {
    return this.__dynamicNodeContext?.getViewportSize() ?? { width: 1280, height: 720 };
  }
  getJsonAsset(key) {
    return this.__dynamicNodeContext?.getJsonAsset(key);
  }
  requireJsonAsset(key) {
    const value = this.getJsonAsset(key);
    if (value === void 0) throw new Error("Required JSON asset " + key + " is not loaded");
    return value;
  }
  instantiatePrefab(path, options) {
    const node = this.__dynamicNodeContext?.instantiatePrefab(path, options);
    if (!node) throw new Error("Dynamic node context is not initialized");
    return node;
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
  color: (value, options = {}) => marker(value, { type: "Color", ...options }),
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

// public/scripts/Gameplay/MiningScript.node.ts
var PLAYER_HEIGHT = 64;
var RESOURCE_TILE_TYPES = /* @__PURE__ */ new Set(["copper", "iron", "gold", "diamond"]);
var MiningScript = class extends ScriptNode {
  id = "dynamic.mining-tool";
  name = "Mining Tool Script";
  levelNodeId = prop.nodeRef(null, { label: "Level Node" });
  worldNodeId = prop.nodeRef(null, { label: "World Node" });
  movementScriptNodeId = prop.nodeRef(null, { label: "Movement Script Node" });
  playerStateNodeId = prop.nodeRef(null, { label: "Player State Node" });
  inputNodeId = prop.nodeRef(null, { label: "Gameplay Input Node" });
  laserLineNodeId = prop.nodeRef(null, { label: "Laser Line Node" });
  targetMarkerNodeId = prop.nodeRef(null, { label: "Target Marker Node" });
  laserAudioNodeId = prop.nodeRef(null, { label: "Laser Audio Node" });
  dirtBreakAudioNodeId = prop.nodeRef(null, { label: "Dirt Break Audio Node" });
  gemBreakAudioNodeId = prop.nodeRef(null, { label: "Gem Break Audio Node" });
  crackPrefabId = prop.string("781e9ab6-9061-55ef-92de-1b3c129c44ca", { label: "Crack Prefab ID" });
  crackPrefabPath = prop.string("prefabs/mining-crack.prefab.json", { label: "Crack Prefab Path" });
  laserOriginOffsetY = prop.number(PLAYER_HEIGHT * 0.18, { label: "Laser Origin Offset Y", step: 0.1 });
  tileSize = prop.number(96, { label: "Tile Size", min: 1, step: 1 });
  idleLaserColor = prop.color("#fb7185", { label: "Idle Laser Color" });
  firingLaserColor = prop.color("#f43f5e", { label: "Firing Laser Color" });
  targetColor = prop.color("#f97316", { label: "Target Color" });
  idleLaserWidth = prop.number(2, { label: "Idle Laser Width", min: 0, step: 1 });
  firingLaserWidth = prop.number(4, { label: "Firing Laser Width", min: 0, step: 1 });
  idleLaserAlpha = prop.number(0.5, { label: "Idle Laser Alpha", min: 0, max: 1, step: 0.05 });
  firingLaserAlpha = prop.number(0.95, { label: "Firing Laser Alpha", min: 0, max: 1, step: 0.05 });
  crackStages = prop.number(4, { label: "Crack Stages", min: 1, step: 1 });
  levelNode;
  world;
  movementController;
  playerState;
  gameplayInput;
  laserLine;
  targetMarker;
  laserAudio;
  dirtBreakAudio;
  gemBreakAudio;
  crackOverlays = /* @__PURE__ */ new Map();
  laserOrigin = new Vec2();
  gamepadAim = new Vec2(1, 0);
  currentAimWorld = new Vec2(1, 0);
  miningPressed = false;
  target;
  resolve() {
    this.levelNode = this.requireResolvedNode(this.levelNodeId, "Level");
    this.world = this.requireResolvedNode(this.worldNodeId, "World");
    this.movementController = this.requireResolvedNode(this.movementScriptNodeId, "PlayerMovementController");
    this.playerState = this.requireResolvedNode(this.playerStateNodeId, "PlayerState");
    this.gameplayInput = this.requireResolvedNode(this.inputNodeId, "GameplayInput");
    this.laserLine = this.requireResolvedNode(this.laserLineNodeId, "MiningLaserLine");
    this.targetMarker = this.requireResolvedNode(this.targetMarkerNodeId, "MiningTargetMarker");
    this.laserAudio = this.requireResolvedNode(this.laserAudioNodeId, "MiningLaserAudio");
    this.dirtBreakAudio = this.requireResolvedNode(this.dirtBreakAudioNodeId, "MiningDirtBreakAudio");
    this.gemBreakAudio = this.requireResolvedNode(this.gemBreakAudioNodeId, "MiningGemBreakAudio");
    this.targetMarker.strokeColor = this.targetColor;
    this.clearPresentation();
  }
  update(deltaMs) {
    this.updateMining(deltaMs / 1e3);
  }
  destroy() {
    this.clearCrackOverlays();
    this.stopFiring();
  }
  resetForLevel() {
    this.clearCrackOverlays();
    this.stopFiring();
  }
  stopFiring() {
    this.target = void 0;
    this.miningPressed = false;
    this.playerState?.setMiningActive(false);
    this.clearPresentation();
  }
  isMiningPressed() {
    return this.miningPressed;
  }
  getAimWorldPoint() {
    return this.currentAimWorld;
  }
  updateMining(deltaSeconds) {
    const player = this.world.player;
    const origin = this.laserOrigin.set(player.x, player.y + this.laserOriginOffsetY);
    const intent = this.gameplayInput.getMiningIntent({
      playerX: player.x,
      playerY: player.y + this.laserOriginOffsetY,
      inputBlocked: readMovementInputBlocked(this.movementController),
      miningRange: this.playerState.stats.miningRange,
      gamepadAim: this.gamepadAim,
      laserOrigin: origin
    });
    const aimWorld = this.getUpdatedAimWorld(intent.aimWorld);
    const target = findFirstMineableTile(origin, aimWorld, this.playerState.stats.miningRange, this.levelNode);
    const firing = intent.miningPressed;
    this.miningPressed = firing;
    this.playerState.setMiningActive(firing);
    this.target = target;
    this.clearPresentation(false);
    if (!target) {
      this.laserAudio.stop();
      return;
    }
    this.showTargetAndBeam(target, origin, firing);
    if (!firing || !this.playerState.hasMiningEnergy()) {
      this.laserAudio.stop();
      return;
    }
    this.laserAudio.play();
    this.playerState.consumeMiningEnergy(deltaSeconds);
    target.health -= this.playerState.stats.miningDamagePerSec * deltaSeconds;
    this.updateCrackOverlay(target);
    if (target.health <= 0) this.mineTile(target);
  }
  getUpdatedAimWorld(aimWorld) {
    if (aimWorld) this.currentAimWorld.copy(aimWorld);
    return this.currentAimWorld;
  }
  showTargetAndBeam(target, origin, firing) {
    const center = this.tileCenter(target);
    this.targetMarker.position = this.targetMarker.worldToLocalPosition(center);
    this.targetMarker.strokeColor = this.targetColor;
    this.targetMarker.visible = true;
    this.laserLine.color = firing ? this.firingLaserColor : this.idleLaserColor;
    this.laserLine.lineWidth = firing ? this.firingLaserWidth : this.idleLaserWidth;
    this.laserLine.alpha = firing ? this.firingLaserAlpha : this.idleLaserAlpha;
    this.laserLine.visible = true;
    this.laserLine.setPoints(
      this.laserLine.worldToLocalPosition(origin),
      this.laserLine.worldToLocalPosition(center)
    );
  }
  clearPresentation(stopAudio = true) {
    this.laserLine?.clear();
    if (this.laserLine) this.laserLine.visible = false;
    if (this.targetMarker) this.targetMarker.visible = false;
    if (stopAudio) this.laserAudio?.stop();
  }
  updateCrackOverlay(cell) {
    const key = tileKey(cell);
    const damage = clamp(1 - cell.health / cell.maxHealth, 0, 1);
    const stage = Math.min(this.crackStages, Math.max(1, Math.ceil(damage * this.crackStages)));
    let overlay = this.crackOverlays.get(key);
    if (!overlay) {
      overlay = this.instantiatePrefab(this.crackPrefabId, {
        name: `MiningCrack.${key}`,
        props: {
          assetId: `crack-${stage}`,
          position: this.tileCenter(cell)
        }
      });
      this.world.addChild(overlay);
      this.crackOverlays.set(key, overlay);
      return;
    }
    overlay.setAssetId(`crack-${stage}`);
  }
  removeCrackOverlay(cell) {
    const key = tileKey(cell);
    const overlay = this.crackOverlays.get(key);
    if (overlay) this.world.removeChild(overlay);
    this.crackOverlays.delete(key);
  }
  clearCrackOverlays() {
    for (const overlay of this.crackOverlays.values()) this.world?.removeChild(overlay);
    this.crackOverlays.clear();
  }
  mineTile(cell) {
    const minedType = cell.type;
    this.levelNode.clearTile(cell);
    this.removeCrackOverlay(cell);
    this.playerState.recordMinedTile(minedType);
    const detune = Math.round(Math.random() * 90 - 45);
    (RESOURCE_TILE_TYPES.has(minedType) ? this.gemBreakAudio : this.dirtBreakAudio).playOneShot({ detune });
  }
  tileCenter(cell) {
    return { x: cell.x * this.tileSize + this.tileSize / 2, y: cell.y * this.tileSize + this.tileSize / 2 };
  }
  requireResolvedNode(instanceId, fallbackName) {
    const node = (instanceId ? this.getNodeById(instanceId) : void 0) ?? this.getNode(fallbackName);
    if (!node) throw new Error(`Required node '${instanceId ?? fallbackName}' was not found`);
    return node;
  }
};
var Vec2 = class _Vec2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
  x;
  y;
  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }
  copy(value) {
    this.x = value.x;
    this.y = value.y;
    return this;
  }
  clone() {
    return new _Vec2(this.x, this.y);
  }
  subtract(value) {
    this.x -= value.x;
    this.y -= value.y;
    return this;
  }
  lengthSq() {
    return this.x * this.x + this.y * this.y;
  }
  normalize() {
    const length = Math.hypot(this.x, this.y) || 1;
    this.x /= length;
    this.y /= length;
    return this;
  }
};
function findFirstMineableTile(origin, aimWorld, range, level) {
  const direction = aimWorld.clone().subtract(origin);
  if (direction.lengthSq() <= 1) return void 0;
  direction.normalize();
  for (let distance = 8; distance <= range; distance += 8) {
    const cell = level.getCellAtWorld(origin.x + direction.x * distance, origin.y + direction.y * distance);
    if (cell?.type && cell.type !== "air") return cell.type === "bedrock" ? void 0 : cell;
  }
  return void 0;
}
function readMovementInputBlocked(controller) {
  return (controller.inputBlocked ?? controller.callScriptMethod?.("isInputBlocked") ?? controller.getScriptProperty?.("inputBlocked")) === true;
}
function tileKey(cell) {
  return `${cell.x}:${cell.y}`;
}
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// public/scripts/Gameplay/PlayerAnimationScript.node.ts
var PlayerAnimationScript = class extends ScriptNode {
  id = "dynamic.player-animation";
  name = "Player Animator";
  worldNodeId = prop.nodeRef(null, { label: "World" });
  movementNodeId = prop.nodeRef("8e9c3d71-ea21-4882-809a-e75645ce74ef", { label: "Movement" });
  miningNodeId = prop.nodeRef("cb278fb8-c7fd-555f-98ef-6a9b0283abe4", { label: "Mining Tool" });
  imageNodeId = prop.nodeRef("fe8c9a25-c18c-4154-aa84-e4272055d66b", { label: "Player Image" });
  footstepAudioNodeIds = prop.nodeRefList([], { label: "Footstep Audio" });
  footstepIntervalMs = prop.number(240, { min: 50, max: 1e3, step: 10, label: "Footstep Interval ms" });
  facing = "east";
  animationId = "idle.east";
  world;
  movement;
  mining;
  image;
  footstepAudio = [];
  footstepTimerMs = 0;
  walkSoundIndex = 0;
  resolve() {
    this.world = this.requireResolvedNode(this.worldNodeId, "World");
    this.movement = this.requireResolvedNode(this.movementNodeId, "PlayerMovementController");
    this.mining = this.requireResolvedNode(this.miningNodeId, "MiningTool");
    this.image = this.requireResolvedNode(this.imageNodeId, "PlayerImage");
    this.footstepAudio = this.footstepAudioNodeIds.flatMap((id) => {
      const node = this.getNodeById(id);
      return node ? [node] : [];
    });
  }
  update(deltaMs) {
    const player = this.world.player;
    if (!this.image.isEffectivelyActive()) {
      player.setVisible(false);
      return;
    }
    player.setVisible(true);
    const aim = this.mining.callScriptMethod("getAimWorldPoint");
    const aimX = this.mining.callScriptMethod("isMiningPressed") === true ? aim?.x : void 0;
    const velocity = readPoint(this.movement.callScriptMethod?.("getVelocity") ?? this.movement.getScriptProperty?.("velocity"));
    const grounded = (this.movement.callScriptMethod?.("isGrounded") ?? this.movement.getScriptProperty?.("grounded")) === true;
    if (aimX !== void 0 && Math.abs(aimX - player.x) > 10) this.facing = aimX >= player.x ? "east" : "west";
    else if (Math.abs(velocity.x) > 1) this.facing = velocity.x > 0 ? "east" : "west";
    const airborne = !grounded;
    const moving = Math.abs(velocity.x) > 1;
    const animationName = airborne ? velocity.y <= 30 ? "jump" : "fall" : moving ? "walk" : "idle";
    this.animationId = `${animationName}.east`;
    this.image.play(this.animationId);
    this.image.flipX = this.facing === "west";
    this.updateFootstep(!airborne && moving, deltaMs);
  }
  updateFootstep(active, deltaMs) {
    if (!active) {
      this.footstepTimerMs = 0;
      return;
    }
    this.footstepTimerMs += deltaMs;
    if (this.footstepTimerMs < this.footstepIntervalMs || this.footstepAudio.length === 0) return;
    this.footstepTimerMs = 0;
    this.walkSoundIndex = (this.walkSoundIndex + 1) % this.footstepAudio.length;
    this.footstepAudio[this.walkSoundIndex].playOneShot({ detune: Math.round(Math.random() * 60 - 30) });
  }
  requireResolvedNode(instanceId, fallbackName) {
    const node = (instanceId ? this.getNodeById(instanceId) : void 0) ?? this.getNode(fallbackName);
    if (!node) throw new Error(`Required node '${instanceId ?? fallbackName}' was not found`);
    return node;
  }
};
function readPoint(value) {
  return value && typeof value === "object" && "x" in value && "y" in value ? { x: Number(value.x), y: Number(value.y) } : { x: 0, y: 0 };
}

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
  shipScriptNodeId = prop.nodeRef(null, { label: "Ship Script Node" });
  bodyNodeId = prop.nodeRef(null, { label: "Player Body" });
  imageNodeId = prop.nodeRef(null, { label: "Player Image" });
  velocity = { x: 0, y: 0 };
  grounded = false;
  inputBlocked = false;
  levelNode;
  playerState;
  gameplayInput;
  shipScript;
  player;
  imageNode;
  coyoteTimerSeconds = 0;
  jumpBufferTimerSeconds = 0;
  jumpHeld = false;
  resolve() {
    this.levelNode = this.requireResolvedNode(this.levelNodeId, "Level");
    this.playerState = this.requireResolvedNode(this.playerStateNodeId, "PlayerState");
    this.gameplayInput = this.requireResolvedNode(this.inputNodeId, "GameplayInput");
    this.shipScript = this.resolveNode(this.shipScriptNodeId, "ShipBehavior");
    this.player = this.requireResolvedNode(this.bodyNodeId, "PlayerBody");
    this.imageNode = this.requireResolvedNode(this.imageNodeId, "PlayerImage");
  }
  spawnAt(x, y) {
    this.player.setPosition(x, y);
    this.imageNode.update(0);
    this.resetMotion();
    return this.imageNode.image;
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
    if (intent.interactPressed) this.shipScript?.callScriptMethod("interact");
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
    if (this.grounded || this.velocity.y < 0) return;
    if (!this.levelNode.collidesBox(this.player.x, this.player.y + 1, VERTICAL_COLLISION_SIZE.w, VERTICAL_COLLISION_SIZE.h)) return;
    this.grounded = true;
    this.velocity.y = 0;
  }
  moveAxis(dx, dy) {
    if (dx === 0 && dy === 0) return;
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
    this.emit("player:jump");
  }
  resolveNode(instanceId, fallbackName) {
    return (instanceId ? this.getNodeById(instanceId) : void 0) ?? this.getNode(fallbackName);
  }
  requireResolvedNode(instanceId, fallbackName) {
    const node = this.resolveNode(instanceId, fallbackName);
    if (!node) throw new Error(`Required node '${instanceId ?? fallbackName}' was not found`);
    return node;
  }
};

// public/scripts/Gameplay/ShipScript.node.ts
var SHIP_DOCK_CENTER_X = -288;
var SHIP_DOCK_CENTER_Y = 240;
var SHIP_DOCK_RADIUS = 120;
var ShipScript = class extends ScriptNode {
  id = "dynamic.ship";
  name = "Ship Script";
  worldNodeId = prop.nodeRef(null, { label: "World Node" });
  playerStateNodeId = prop.nodeRef(null, { label: "Player State Node" });
  shipImageNodeId = prop.nodeRef(null, { label: "Ship Image" });
  promptNodeId = prop.nodeRef(null, { label: "Prompt Text" });
  shipWidth = prop.number(548.16, { label: "Ship Width", min: 1, step: 1 });
  shipHeight = prop.number(336, { label: "Ship Height", min: 1, step: 1 });
  promptOffsetY = prop.number(57.6, { label: "Prompt Offset Y", min: 0, step: 1 });
  messageDurationMs = prop.number(2200, { label: "Message Duration", min: 0, step: 100 });
  world;
  playerState;
  shipImage;
  promptText;
  lastMessage = "";
  lastMessageTimerMs = 0;
  resolve() {
    this.world = this.requireResolvedNode(this.worldNodeId, "World");
    this.playerState = this.requireResolvedNode(this.playerStateNodeId, "PlayerState");
    this.shipImage = this.requireResolvedNode(this.shipImageNodeId, "ShipImage");
    this.promptText = this.requireResolvedNode(this.promptNodeId, "ShipPrompt");
    this.layoutShipImage();
    this.resetPrompt();
  }
  update(deltaMs) {
    this.layoutShipImage();
    this.lastMessageTimerMs = Math.max(0, this.lastMessageTimerMs - deltaMs);
    const player = this.world.player;
    const atDock = this.isAtDock(player);
    const hasCargo = this.playerState.run.cargo.slots.some((slot) => Boolean(slot.itemId && slot.quantity > 0));
    const message = this.lastMessageTimerMs > 0 ? this.lastMessage : atDock ? `${hasCargo ? "E: Cargo sichern & verkaufen" : "E: Energie am Schiff auff\xFCllen"} \xB7 Credits: ${this.playerState.save.profile.credits}` : "";
    this.promptText.setText?.(message);
    this.promptText.position = this.promptText.worldToLocalPosition({ x: player.x, y: player.y - this.promptOffsetY });
    this.promptText.visible = Boolean(message);
  }
  interact() {
    const player = this.world.player;
    if (!this.isAtDock(player)) {
      this.showMessage("Zu weit vom Schiff entfernt");
      return;
    }
    this.showMessage(this.playerState.returnCargoToShip().message);
  }
  resetPrompt() {
    this.lastMessage = "";
    this.lastMessageTimerMs = 0;
    this.promptText?.setText?.("");
    if (this.promptText) this.promptText.visible = false;
  }
  layoutShipImage() {
    const frame = this.shipImage.image.frame;
    if (frame.width <= 0 || frame.height <= 0) return;
    this.shipImage.scaleX = this.shipWidth / frame.width;
    this.shipImage.scaleY = this.shipHeight / frame.height;
  }
  isAtDock(player) {
    return Math.hypot(player.x - SHIP_DOCK_CENTER_X, player.y - SHIP_DOCK_CENTER_Y) <= SHIP_DOCK_RADIUS;
  }
  showMessage(message) {
    this.lastMessage = message;
    this.lastMessageTimerMs = this.messageDurationMs;
  }
  requireResolvedNode(instanceId, fallbackName) {
    const node = (instanceId ? this.getNodeById(instanceId) : void 0) ?? this.getNode(fallbackName);
    if (!node) throw new Error(`Required node '${instanceId ?? fallbackName}' was not found`);
    return node;
  }
};

// public/scripts/Loading/LoadingScript.node.ts
var LoadingScript = class extends ScriptNode {
  id = "dynamic.loading-script";
  name = "Loading Script";
  progressNodeId = prop.nodeRef("d68a8bc0-3995-48d8-8d70-a75477d881d7", { label: "Progress Text Node" });
  minimumDurationMs = prop.number(900, { min: 0, max: 5e3, step: 100, label: "Minimum Duration ms" });
  loadEvent = prop.string("game:load", { label: "Load Event" });
  mountEvent = prop.string("game:mount", { label: "Mount Event" });
  elapsedMs = 0;
  loaded = false;
  mounted = false;
  resolve() {
    this.setProgress(0);
    if (this.getRuntimeMode() === "play") this.emit(this.loadEvent);
  }
  update(deltaMs) {
    if (this.mounted || this.getRuntimeMode() !== "play") return;
    this.elapsedMs += deltaMs;
    if (!this.loaded || this.elapsedMs < this.minimumDurationMs) return;
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
    return this.progressNodeId ? this.getNodeById(this.progressNodeId) : void 0;
  }
};

// public/scripts/Managers/GameplayInput.node.ts
var GameplayInputScript = class extends ScriptNode {
  id = "dynamic.gameplay-input";
  name = "Gameplay Input";
  deviceNodeId = prop.nodeRef("87b03f69-911d-55e3-a00f-d2f92f460f4e", { label: "Input Device" });
  device;
  inputMode = "desktop";
  moveVector = { x: 0, y: 0 };
  aimVector = { x: 1, y: 0 };
  gamepadAim = { x: 1, y: 0 };
  aiming = false;
  menuOpen = false;
  controlPointerResolver = () => false;
  resolve() {
    const device = this.deviceNodeId ? this.getNodeById(this.deviceNodeId) : void 0;
    if (!device) throw new Error("Required node 'InputDevice' was not resolved");
    this.device = device;
  }
  setInputMode(mode) {
    this.inputMode = mode;
  }
  getInputMode() {
    return this.inputMode;
  }
  setMoveVector(vector) {
    this.moveVector = { x: vector.x, y: vector.y };
  }
  getMoveVector() {
    return this.moveVector;
  }
  setAimVector(vector) {
    this.aimVector = normalized(vector, this.aimVector);
  }
  getAimVector() {
    return this.aimVector;
  }
  setAiming(aiming) {
    this.aiming = aiming;
  }
  isAiming() {
    return !this.menuOpen && this.inputMode === "touch" && this.aiming;
  }
  setMenuOpen(open) {
    this.menuOpen = open;
  }
  isMenuOpen() {
    return this.menuOpen;
  }
  setControlPointerResolver(resolver) {
    this.controlPointerResolver = resolver;
  }
  containsControlPointer(pointer) {
    return this.inputMode === "touch" && this.controlPointerResolver(pointer);
  }
  getPlayerIntent(options) {
    const desktop = this.inputMode === "desktop";
    const touch = this.inputMode === "touch";
    const gamepad = this.inputMode === "gamepad";
    const gamepadX = gamepad ? this.device.getGamepadAxis(0) : 0;
    const gamepadY = gamepad ? this.device.getGamepadAxis(1) : 0;
    const left = desktop && (this.device.isKeyDown("LEFT") || this.device.isKeyDown("A")) || touch && this.moveVector.x < -0.22 || gamepad && gamepadX < -0.22;
    const right = desktop && (this.device.isKeyDown("RIGHT") || this.device.isKeyDown("D")) || touch && this.moveVector.x > 0.22 || gamepad && gamepadX > 0.22;
    const touchJumpHeld = touch && this.moveVector.y < -0.56;
    const gamepadJumpHeld = gamepad && this.device.isGamepadButtonDown(0);
    const keyboardJumpHeld = desktop && (this.device.isKeyDown("UP") || this.device.isKeyDown("W") || this.device.isKeyDown("SPACE"));
    const moveStrength = touch ? Math.max(0.45, Math.abs(this.moveVector.x)) : gamepad ? Math.max(0.45, Math.abs(gamepadX)) : 1;
    return {
      moveX: this.menuOpen ? 0 : ((left ? -1 : 0) + (right ? 1 : 0)) * moveStrength,
      jumpPressed: !this.menuOpen && (desktop && (this.device.isKeyJustDown("SPACE") || this.device.isKeyJustDown("W")) || (touchJumpHeld || gamepadJumpHeld) && !options.previousJumpHeld),
      jumpHeld: !this.menuOpen && (touchJumpHeld || keyboardJumpHeld || gamepadJumpHeld || gamepad && gamepadY < -0.56),
      interactPressed: !this.menuOpen && desktop && this.device.isKeyJustDown("E")
    };
  }
  getMiningIntent(options) {
    const blocked = options.inputBlocked || this.menuOpen;
    if (blocked) return { aiming: false, miningPressed: false };
    const origin = { x: options.playerX, y: options.playerY };
    if (this.inputMode === "touch") {
      const active = this.isAiming();
      return { aiming: active, miningPressed: active, aimWorld: active ? pointAtRange(origin, this.aimVector, options.miningRange) : void 0 };
    }
    if (this.inputMode === "gamepad") {
      const stick = { x: this.device.getGamepadAxis(2), y: this.device.getGamepadAxis(3) };
      if (Math.hypot(stick.x, stick.y) > 0.22) this.gamepadAim = normalized(stick, this.gamepadAim);
      options.gamepadAim.x = this.gamepadAim.x;
      options.gamepadAim.y = this.gamepadAim.y;
      return {
        aiming: true,
        miningPressed: this.device.isGamepadButtonDown(7) || this.device.isGamepadButtonDown(5),
        aimWorld: pointAtRange(origin, this.gamepadAim, options.miningRange)
      };
    }
    const pointer = this.device.getPointer();
    return { aiming: true, miningPressed: pointer.isDown, aimWorld: pointer.world };
  }
};
function normalized(value, fallback) {
  const length = Math.hypot(value.x, value.y);
  return length > 1e-4 ? { x: value.x / length, y: value.y / length } : { ...fallback };
}
function pointAtRange(origin, direction, range) {
  return { x: origin.x + direction.x * range, y: origin.y + direction.y * range };
}

// public/scripts/LevelGeneration/math.ts
function clamp2(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function distanceToCore(context, x, y) {
  return Math.hypot(x - context.core.x, y - context.core.y);
}
function referenceCoreDistance(context) {
  return Math.max(1, Math.hypot(context.core.x - context.spawn.x, context.core.y - context.spawn.y));
}
function distanceToStart(context, x, y) {
  return Math.hypot(x - context.spawn.x, y - context.spawn.y);
}

// public/scripts/LevelGeneration/random.ts
function hashSeed(seed) {
  const text = String(seed);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 1831565813;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function randomInt(random, min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}

// public/scripts/LevelGeneration/tileTypes.ts
var RESOURCE_TYPES = /* @__PURE__ */ new Set(["copper", "iron", "gold", "diamond"]);
var TILE_HEALTH = {
  air: 0,
  dirt: 20,
  sand: 15,
  clay: 25,
  gravel: 40,
  stone: 50,
  basalt: 55,
  copper: 60,
  iron: 70,
  gold: 80,
  diamond: 110,
  bedrock: 9999
};
var TILE_ATLAS_COORDS = {
  basalt: [2, 0],
  bedrock: [3, 0],
  clay: [4, 0],
  copper: [6, 0],
  diamond: [0, 1],
  dirt: [1, 1],
  gold: [6, 1],
  gravel: [0, 2],
  iron: [2, 2],
  sand: [4, 4],
  stone: [6, 5]
};
function isResourceTile(type) {
  return RESOURCE_TYPES.has(type);
}
function foregroundFrameForTile(type) {
  if (type === "air") return -1;
  const [x, y] = TILE_ATLAS_COORDS[type];
  return y * 8 + x;
}

// public/scripts/LevelGeneration/tileMap.ts
function tileKey2(x, y) {
  return `${x},${y}`;
}
function setTile(tiles, x, y, type, boundary) {
  tiles.set(tileKey2(x, y), {
    x,
    y,
    type,
    health: TILE_HEALTH[type],
    maxHealth: TILE_HEALTH[type],
    boundary,
    solid: type !== "air",
    foregroundFrame: foregroundFrameForTile(type),
    backwallFrame: boundary ? -1 : 0
  });
}
function clearTile(level, tileX, tileY) {
  const key = tileKey2(tileX, tileY);
  const cell = level.tiles.get(key);
  if (!cell || cell.boundary || cell.type === "air") return false;
  cell.type = "air";
  cell.health = 0;
  cell.solid = false;
  cell.foregroundFrame = -1;
  level.resources.delete(key);
  return true;
}

// public/scripts/LevelGeneration/resourceGenerator.ts
var RESOURCE_PROFILES = [
  { type: "copper", minCoreRatio: 0.48, maxCoreRatio: Infinity, minAbsY: 0, baseChance: 0.032, veinMin: 3, veinMax: 7 },
  { type: "iron", minCoreRatio: 0.34, maxCoreRatio: Infinity, minAbsY: 6, baseChance: 0.027, veinMin: 3, veinMax: 7 },
  { type: "gold", minCoreRatio: 0.16, maxCoreRatio: 0.72, minAbsY: 12, baseChance: 0.019, veinMin: 2, veinMax: 6 },
  { type: "diamond", minCoreRatio: 0.05, maxCoreRatio: 0.45, minAbsY: 22, baseChance: 0.01, veinMin: 2, veinMax: 4 }
];
function spawnResources(context, tiles, random) {
  const richness = context.scaled.resource_richness ?? 1;
  for (const cell of tiles.values()) {
    if (!canReplaceWithResource(cell)) continue;
    if (distanceToStart(context, cell.x, cell.y) < 10) continue;
    const profile = pickResourceForCell(context, cell, richness, random);
    if (!profile) continue;
    const veinSize = randomInt(random, profile.veinMin, profile.veinMax);
    spawnVein(cell.x, cell.y, profile.type, veinSize, context, tiles, random);
  }
}
function rebuildResources(tiles) {
  const resources = /* @__PURE__ */ new Map();
  for (const cell of tiles.values()) {
    if (isResourceTile(cell.type)) resources.set(tileKey2(cell.x, cell.y), cell.type);
  }
  return resources;
}
function pickResourceForCell(context, cell, richness, random) {
  const coreDistance = distanceToCore(context, cell.x, cell.y);
  const coreRatio = coreDistance / referenceCoreDistance(context);
  const absY = Math.abs(cell.y);
  const possible = RESOURCE_PROFILES.filter(
    (profile) => coreRatio >= profile.minCoreRatio && coreRatio <= profile.maxCoreRatio && absY >= profile.minAbsY
  );
  if (possible.length === 0) return void 0;
  const zonePressure = clamp2(1.55 - coreRatio, 0.55, 1.45);
  const depthPressure = clamp2(0.75 + absY / 160, 0.75, 1.6);
  for (const profile of possible) {
    const rarityFactor = profile.type === "diamond" ? 0.68 : profile.type === "gold" ? 0.84 : 1;
    const chance = profile.baseChance * richness * zonePressure * depthPressure * rarityFactor;
    if (random() < chance) return profile;
  }
  return void 0;
}
function spawnVein(startX, startY, type, size, context, tiles, random) {
  let x = startX;
  let y = startY;
  for (let i = 0; i < size; i += 1) {
    const cell = tiles.get(tileKey2(x, y));
    if (cell && canReplaceWithResource(cell) && distanceToStart(context, x, y) >= 10) {
      setTile(tiles, x, y, type, false);
    }
    x += randomInt(random, -1, 1);
    y += randomInt(random, -1, 1);
  }
}
function canReplaceWithResource(cell) {
  return (cell.type === "dirt" || cell.type === "stone" || cell.type === "basalt") && !cell.boundary;
}

// public/scripts/LevelGeneration/levelConstants.ts
var WORLD_MIN_X = -10;
var LEFT_BOUNDARY_THICKNESS = 2;
var SHIP_TUNNEL_LEFT_X = WORLD_MIN_X;
var SHIP_TUNNEL_TIP_X = 0;
var SHIP_TUNNEL_TOP_Y = -1;
var SHIP_TUNNEL_BOTTOM_Y = 2;
var SHIP_CEILING_Y = -2;
var SHIP_FLOOR_Y = 3;

// public/scripts/LevelGeneration/terrainGenerator.ts
function generateBaseTerrain(context, random) {
  const tiles = /* @__PURE__ */ new Map();
  for (let x = WORLD_MIN_X; x <= context.width; x += 1) {
    for (let y = -context.heightDown; y <= context.heightUp; y += 1) {
      const type = calculateBaseTile(context, x, y, random);
      setTile(tiles, x, y, type, false);
    }
  }
  return tiles;
}
function calculateBaseTile(context, x, y, random) {
  const distanceRatio = distanceToCore(context, x, y) / referenceCoreDistance(context);
  const absY = Math.abs(y);
  const roll = random();
  if (distanceRatio < 0.2) {
    if (roll < 0.62) return "basalt";
    if (roll < 0.93) return "stone";
    return absY < 24 ? "gravel" : "basalt";
  }
  if (distanceRatio < 0.4) {
    if (roll < 0.46) return "stone";
    if (roll < 0.76) return "basalt";
    if (roll < 0.88) return "gravel";
    return "dirt";
  }
  if (distanceRatio < 0.7) {
    if (roll < 0.45) return "stone";
    if (roll < 0.65) return "dirt";
    if (roll < 0.78) return "gravel";
    if (roll < 0.9) return absY < 22 ? "clay" : "stone";
    return "sand";
  }
  if (roll < 0.52) return "dirt";
  if (roll < 0.68) return "sand";
  if (roll < 0.8) return "clay";
  if (roll < 0.9) return "gravel";
  return "stone";
}

// public/scripts/LevelGeneration/worldContext.ts
function createWorldContext(config, difficultyLevel, customSeed) {
  const planet = config.planet;
  const difficulty = clamp2(Math.round(difficultyLevel), 1, 10);
  const seed = hashSeed(customSeed);
  const random = mulberry32(seed);
  const scaled = applyDifficultyScaling(config, difficulty);
  const radius = Math.round(scaled.core_radius ?? planet.core.radius);
  return {
    random,
    context: {
      config,
      difficulty,
      seed,
      scaled,
      width: planet.base_config.level_width,
      heightUp: planet.base_config.level_height_up,
      heightDown: planet.base_config.level_height_down,
      tileSize: planet.base_config.block_size,
      core: { ...calculateCore(config, scaled, random), radius },
      spawn: { x: -2, y: 2 },
      // World-space tile rect for the drilled-in ship visual plus clearance.
      spaceshipRect: { x: SHIP_TUNNEL_LEFT_X, y: SHIP_CEILING_Y, w: SHIP_TUNNEL_TIP_X - SHIP_TUNNEL_LEFT_X + 1, h: SHIP_FLOOR_Y - SHIP_CEILING_Y + 1 }
    }
  };
}
function applyDifficultyScaling(config, difficulty) {
  const scaled = {};
  const normalized2 = (difficulty - 1) / 9;
  for (const [key, params] of Object.entries(config.planet.difficulty_scaling ?? {})) {
    let factor = normalized2;
    if (params.formula === "exponential") factor = normalized2 ** 2;
    if (params.formula === "logarithmic") factor = Math.log(difficulty) / Math.log(10);
    scaled[key] = params.mode === "decrease" ? params.max - (params.max - params.min) * factor : params.min + (params.max - params.min) * factor;
  }
  scaled.core_radius = config.planet.core.radius;
  return scaled;
}
function calculateCore(config, scaled, random) {
  const coreDistance = scaled.core_distance ?? config.planet.core.distance.max;
  const [minY, maxY] = config.planet.core.y_range;
  return {
    x: Math.round(coreDistance),
    y: Math.round(minY + random() * (maxY - minY))
  };
}

// public/scripts/LevelGeneration/worldReplacers.ts
function applyWorldReplacers(context, tiles) {
  const replacers = [
    applyStartAndShipChamber,
    applyStarterResourceDeposits,
    applyCore,
    applyWorldBoundaries
  ];
  for (const replacer of replacers) replacer(context, tiles);
}
function applyStartAndShipChamber(_context, tiles) {
  for (let x = SHIP_TUNNEL_LEFT_X; x <= SHIP_TUNNEL_TIP_X; x += 1) {
    setTile(tiles, x, SHIP_CEILING_Y, "bedrock", true);
    setTile(tiles, x, SHIP_FLOOR_Y, "bedrock", true);
    for (let y = SHIP_TUNNEL_TOP_Y; y <= SHIP_TUNNEL_BOTTOM_Y; y += 1) {
      setTile(tiles, x, y, "air", false);
    }
  }
}
function applyStarterResourceDeposits(context, tiles) {
  if (context.config.planet.id !== "dev_planet") return;
  const deposits = [
    { type: "copper", cells: [[4, 1], [5, 1], [5, 2], [6, 1], [6, 2]] },
    { type: "iron", cells: [[8, -4], [9, -4], [9, -3], [10, -4], [10, -3]] },
    { type: "gold", cells: [[10, 5], [11, 5], [11, 6], [12, 5]] },
    { type: "diamond", cells: [[16, -8], [17, -8], [17, -7]] }
  ];
  for (const deposit of deposits) {
    for (const [x, y] of deposit.cells) {
      const cell = tiles.get(tileKey2(x, y));
      if (!cell || cell.type === "air" || cell.type === "bedrock" || cell.boundary) continue;
      setTile(tiles, x, y, deposit.type, false);
    }
  }
}
function applyCore(context, tiles) {
  const { x: cx, y: cy, radius } = context.core;
  const radiusSq = radius ** 2;
  for (let x = cx - radius; x <= cx + radius; x += 1) {
    for (let y = cy - radius; y <= cy + radius; y += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radiusSq) {
        setTile(tiles, x, y, "bedrock", true);
      }
    }
  }
}
function applyWorldBoundaries(context, tiles) {
  for (let x = WORLD_MIN_X; x <= context.width; x += 1) {
    setTile(tiles, x, context.heightUp + 1, "bedrock", true);
    setTile(tiles, x, -context.heightDown - 1, "bedrock", true);
  }
  for (let y = -context.heightDown; y <= context.heightUp; y += 1) {
    for (let x = WORLD_MIN_X; x < WORLD_MIN_X + LEFT_BOUNDARY_THICKNESS; x += 1) {
      if (y >= SHIP_TUNNEL_TOP_Y && y <= SHIP_TUNNEL_BOTTOM_Y) continue;
      setTile(tiles, x, y, "bedrock", true);
    }
    setTile(tiles, context.width + 1, y, "bedrock", true);
  }
}

// public/scripts/LevelGeneration/GravityDigLevelGenerator.ts
var GravityDigLevelGenerator = class {
  generate(config, difficultyLevel = 1, customSeed = "gravity-dig-phaser") {
    const start = performance.now();
    const { context, random } = createWorldContext(config, difficultyLevel, customSeed);
    const tiles = generateBaseTerrain(context, random);
    spawnResources(context, tiles, random);
    applyWorldReplacers(context, tiles);
    const resources = rebuildResources(tiles);
    return {
      planetId: config.planet.id,
      planetName: config.planet.name,
      difficulty: context.difficulty,
      seed: context.seed,
      tileSize: context.tileSize,
      width: context.width,
      heightUp: context.heightUp,
      heightDown: context.heightDown,
      core: context.core,
      spawn: context.spawn,
      spaceshipRect: context.spaceshipRect,
      tiles,
      resources,
      generationTimeMs: Math.round(performance.now() - start)
    };
  }
  key(x, y) {
    return tileKey2(x, y);
  }
};

// public/scripts/LevelGeneration/levelCollision.ts
function getCell(level, tileX, tileY) {
  return level.tiles.get(tileKey2(tileX, tileY));
}
function getCellAtWorld(level, worldX, worldY) {
  return getCell(level, Math.floor(worldX / level.tileSize), Math.floor(worldY / level.tileSize));
}
function collidesBox(level, centerX, centerY, width, height) {
  return getBoxProbePoints(centerX, centerY, width, height).some(([x, y]) => isSolidAtWorld(level, x, y));
}
function isSolidAtWorld(level, worldX, worldY) {
  if (isBehindShipNozzleWall(level, worldX, worldY)) return true;
  const cell = getCellAtWorld(level, worldX, worldY);
  return !!cell && cell.type !== "air";
}
function getBoxProbePoints(centerX, centerY, width, height) {
  const halfW = width / 2;
  const halfH = height / 2;
  return [
    [centerX - halfW, centerY - halfH],
    [centerX + halfW, centerY - halfH],
    [centerX - halfW, centerY + halfH],
    [centerX + halfW, centerY + halfH]
  ];
}
function isBehindShipNozzleWall(level, worldX, worldY) {
  const rect = level.spaceshipRect;
  return worldX < (rect.x + 1.35) * level.tileSize && worldY >= (rect.y + 0.6) * level.tileSize && worldY <= (rect.y + rect.h - 1.05) * level.tileSize;
}

// public/scripts/Managers/LevelManager.node.ts
var LevelManager = class extends ScriptNode {
  id = "dynamic.level-manager";
  name = "Level Manager";
  planetConfigAssetId = prop.string("dev-planet", { label: "Planet Config Asset ID" });
  defaultDifficulty = prop.number(1, { label: "Default Difficulty", min: 1, max: 10, step: 1 });
  defaultSeed = prop.string("gravity-dig-phaser", { label: "Default Seed" });
  generator = new GravityDigLevelGenerator();
  planetConfig;
  init() {
    this.planetConfig = this.requireJsonAsset(this.planetConfigAssetId);
  }
  getConfig() {
    if (!this.planetConfig) throw new Error(`Planet config '${this.planetConfigAssetId}' is not initialized`);
    return this.planetConfig;
  }
  generateLevel(seed = this.defaultSeed, difficultyLevel = this.defaultDifficulty) {
    return this.generator.generate(this.getConfig(), difficultyLevel, seed);
  }
  getCell(level, tileX, tileY) {
    return getCell(level, tileX, tileY);
  }
  getCellAtWorld(level, worldX, worldY) {
    return getCellAtWorld(level, worldX, worldY);
  }
  collidesBox(level, centerX, centerY, width, height) {
    return collidesBox(level, centerX, centerY, width, height);
  }
  clearTile(level, tileX, tileY) {
    return clearTile(level, tileX, tileY);
  }
};

// public/scripts/PlayerState/catalogs/items.ts
var ITEM_DEFINITIONS = {
  dirt: { id: "dirt", label: "Erde", category: "resource", value: 0, stackSize: 999 },
  sand: { id: "sand", label: "Sand", category: "resource", value: 1, stackSize: 999 },
  clay: { id: "clay", label: "Lehm", category: "resource", value: 1, stackSize: 999 },
  gravel: { id: "gravel", label: "Kies", category: "resource", value: 1, stackSize: 999 },
  stone: { id: "stone", label: "Stein", category: "resource", value: 1, stackSize: 999 },
  basalt: { id: "basalt", label: "Basalt", category: "resource", value: 3, stackSize: 999 },
  copper: { id: "copper", label: "Kupfer", category: "resource", value: 3, stackSize: 999 },
  iron: { id: "iron", label: "Eisen", category: "resource", value: 5, stackSize: 999 },
  gold: { id: "gold", label: "Gold", category: "resource", value: 25, stackSize: 999 },
  diamond: { id: "diamond", label: "Diamant", category: "resource", value: 100, stackSize: 999 },
  energy_cell: { id: "energy_cell", label: "Energie-Zelle", category: "consumable", value: 30, stackSize: 20 },
  repair_kit: { id: "repair_kit", label: "Repair-Kit", category: "consumable", value: 40, stackSize: 20 },
  teleport_bracelet: { id: "teleport_bracelet", label: "Teleport-Armband", category: "consumable", value: 200, stackSize: 5 }
};

// public/scripts/PlayerState/inventory.ts
function createInventory(slotCount, stackLimit) {
  return {
    slots: Array.from({ length: Math.max(0, Math.floor(slotCount)) }, () => ({ quantity: 0 })),
    stackLimit
  };
}
function normalizeInventory(raw, slotCount, stackLimit) {
  const fallback = createInventory(slotCount, stackLimit);
  if (!raw || typeof raw !== "object") return fallback;
  const maybe = raw;
  if (Array.isArray(maybe.slots)) {
    const slots = maybe.slots.slice(0, slotCount).map(normalizeSlot);
    while (slots.length < slotCount) slots.push({ quantity: 0 });
    return { slots, stackLimit };
  }
  if (maybe.items && typeof maybe.items === "object") {
    const inventory = fallback;
    for (const [itemId, count] of Object.entries(maybe.items)) {
      addItem(inventory, itemId, count ?? 0);
    }
    return inventory;
  }
  return fallback;
}
function addItem(inventory, itemId, quantity = 1) {
  let remaining = Math.max(0, Math.floor(quantity));
  let accepted = 0;
  while (remaining > 0) {
    const slot = findWritableSlot(inventory, itemId, 1);
    if (!slot) break;
    if (!slot.itemId || slot.quantity <= 0) {
      slot.itemId = itemId;
      slot.quantity = 0;
    }
    const space = inventory.stackLimit - slot.quantity;
    const added = Math.min(space, remaining);
    slot.quantity += added;
    accepted += added;
    remaining -= added;
  }
  return accepted;
}
function findWritableSlot(inventory, itemId, quantity) {
  const stack = inventory.slots.find((slot) => slot.itemId === itemId && slot.quantity + quantity <= inventory.stackLimit);
  if (stack) return stack;
  return inventory.slots.find((slot) => !slot.itemId || slot.quantity <= 0);
}
function normalizeSlot(slot) {
  if (!slot || typeof slot !== "object") return { quantity: 0 };
  const raw = slot;
  if (!raw.itemId || !raw.quantity || raw.quantity <= 0) return { quantity: 0 };
  return { itemId: raw.itemId, quantity: Math.floor(raw.quantity) };
}

// public/scripts/PlayerState/RunState.ts
function createRunState(planetId, seed, stats) {
  return {
    planetId,
    seed,
    health: stats.maxHealth,
    energy: stats.maxEnergy,
    fuel: 100,
    cargo: createInventory(stats.cargoSlots, stats.cargoStackLimit),
    temporaryEffects: [],
    discoveredTiles: []
  };
}
function normalizeRunState(run, stats) {
  return {
    ...run,
    health: Math.min(run.health, stats.maxHealth),
    energy: Math.min(run.energy, stats.maxEnergy),
    cargo: normalizeInventory(run.cargo, stats.cargoSlots, stats.cargoStackLimit),
    temporaryEffects: run.temporaryEffects ?? [],
    discoveredTiles: run.discoveredTiles ?? []
  };
}

// public/scripts/PlayerState/PlayerProfile.ts
function createDefaultPlayerProfile() {
  return {
    version: 1,
    credits: 0,
    inventory: createInventory(8, 99),
    equipment: {
      laser: "laser_mk1",
      visor: "standard_visor",
      battery: "standard_battery",
      boots: "no_boots",
      coreDetector: "no_core_detector"
    },
    upgrades: {
      purchased: []
    },
    perks: {
      unlocked: [],
      equipped: []
    },
    unlockedPlanets: ["dev_planet", "terra_prime"],
    stats: {
      runsStarted: 0,
      runsCompleted: 0,
      deaths: 0,
      blocksMined: 0,
      resourcesMined: 0,
      creditsEarned: 0,
      deepestTileReached: 0
    }
  };
}

// public/scripts/PlayerState/saveGame.ts
var SAVE_KEY = "gravity-dig-save-v1";
function createDefaultSaveGame() {
  return {
    version: 1,
    profile: createDefaultPlayerProfile()
  };
}
function loadSaveGame() {
  if (typeof localStorage === "undefined") return createDefaultSaveGame();
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return createDefaultSaveGame();
  try {
    const parsed = JSON.parse(raw);
    if (parsed.version !== 1 || !parsed.profile) return createDefaultSaveGame();
    const defaults = createDefaultPlayerProfile();
    return {
      version: 1,
      profile: {
        ...defaults,
        ...parsed.profile,
        inventory: normalizeInventory(parsed.profile.inventory, defaults.inventory.slots.length, defaults.inventory.stackLimit),
        equipment: parsed.profile.equipment ?? defaults.equipment,
        upgrades: parsed.profile.upgrades ?? defaults.upgrades,
        perks: parsed.profile.perks ?? defaults.perks,
        stats: parsed.profile.stats ?? defaults.stats
      },
      activeRun: parsed.activeRun
    };
  } catch {
    return createDefaultSaveGame();
  }
}
function saveGame(save) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

// public/scripts/PlayerState/playerConfig.ts
var TILE_SIZE = 96;
var PLAYER_SPEED = 470;
var JUMP_VELOCITY = -1040;
var MINING_RANGE = 330;
var MINING_DAMAGE_PER_SEC = 120;
var ENERGY_REGEN_PER_SEC = 18;
var ENERGY_COST_PER_SEC = 12;

// public/scripts/PlayerState/catalogs/perks.ts
var PERK_DEFINITIONS = {
  magnet_core: {
    id: "magnet_core",
    label: "Magnet-Kern",
    source: "artifact",
    effects: []
  },
  luck_amulet: {
    id: "luck_amulet",
    label: "Gl\xFCcks-Amulett",
    source: "artifact",
    effects: []
  },
  energy_artifact: {
    id: "energy_artifact",
    label: "Energie-Zelle",
    source: "artifact",
    effects: [{ stat: "energyCostPerSec", op: "multiply", value: 0.8 }]
  },
  double_drop: {
    id: "double_drop",
    label: "Doppelg\xE4nger",
    source: "artifact",
    effects: []
  },
  phoenix_feather: {
    id: "phoenix_feather",
    label: "Phoenix-Feder",
    source: "artifact",
    effects: []
  }
};

// public/scripts/PlayerState/catalogs/upgrades.ts
var UPGRADE_DEFINITIONS = {
  laser_mk2: {
    id: "laser_mk2",
    label: "Laser MK2",
    category: "laser",
    cost: { credits: 100 },
    effects: [{ stat: "miningRange", op: "add", value: TILE_SIZE }]
  },
  laser_mk3: {
    id: "laser_mk3",
    label: "Laser MK3",
    category: "laser",
    cost: { credits: 300 },
    prerequisites: ["laser_mk2"],
    effects: [{ stat: "miningRange", op: "add", value: TILE_SIZE * 2 }]
  },
  laser_mk4: {
    id: "laser_mk4",
    label: "Laser MK4",
    category: "laser",
    cost: { credits: 800 },
    prerequisites: ["laser_mk3"],
    effects: [{ stat: "miningRange", op: "add", value: TILE_SIZE * 3 }]
  },
  piercing_laser: {
    id: "piercing_laser",
    label: "Durchschlags-Laser",
    category: "laser",
    cost: { credits: 500 },
    effects: [{ stat: "miningDamagePerSec", op: "multiply", value: 1.15 }]
  },
  fast_laser: {
    id: "fast_laser",
    label: "Schnell-Laser",
    category: "laser",
    cost: { credits: 600 },
    effects: [{ stat: "miningDamagePerSec", op: "multiply", value: 1.5 }]
  },
  auto_laser: {
    id: "auto_laser",
    label: "Auto-Laser",
    category: "laser",
    cost: { credits: 1e3 },
    effects: [{ stat: "energyCostPerSec", op: "multiply", value: 0.9 }]
  },
  spectral_laser: {
    id: "spectral_laser",
    label: "Spektral-Laser",
    category: "laser",
    cost: { credits: 1500 },
    effects: [{ stat: "sightRadius", op: "add", value: 1 }]
  },
  visor_mk1: {
    id: "visor_mk1",
    label: "Visier MK1",
    category: "visor",
    cost: { credits: 150 },
    effects: [{ stat: "sightRadius", op: "set", value: 4 }]
  },
  visor_mk2: {
    id: "visor_mk2",
    label: "Visier MK2",
    category: "visor",
    cost: { credits: 400 },
    prerequisites: ["visor_mk1"],
    effects: [{ stat: "sightRadius", op: "set", value: 5 }]
  },
  radar_visor: {
    id: "radar_visor",
    label: "Radar-Visier",
    category: "visor",
    cost: { credits: 900 },
    prerequisites: ["visor_mk2"],
    effects: [{ stat: "sightRadius", op: "set", value: 6 }]
  },
  quantum_visor: {
    id: "quantum_visor",
    label: "Quantum-Visier",
    category: "visor",
    cost: { credits: 2e3 },
    prerequisites: ["radar_visor"],
    effects: [{ stat: "sightRadius", op: "set", value: 7 }]
  },
  battery_mk1: {
    id: "battery_mk1",
    label: "Batterie MK1",
    category: "battery",
    cost: { credits: 400 },
    effects: [{ stat: "maxEnergy", op: "set", value: 150 }]
  },
  battery_mk2: {
    id: "battery_mk2",
    label: "Batterie MK2",
    category: "battery",
    cost: { credits: 900 },
    prerequisites: ["battery_mk1"],
    effects: [{ stat: "maxEnergy", op: "set", value: 250 }]
  },
  battery_mk3: {
    id: "battery_mk3",
    label: "Batterie MK3",
    category: "battery",
    cost: { credits: 2e3 },
    prerequisites: ["battery_mk2"],
    effects: [{ stat: "maxEnergy", op: "set", value: 400 }]
  },
  battery_fusion: {
    id: "battery_fusion",
    label: "Batterie Fusion",
    category: "battery",
    cost: { credits: 5e3 },
    prerequisites: ["battery_mk3"],
    effects: [{ stat: "maxEnergy", op: "set", value: 700 }]
  },
  boots_mk1: {
    id: "boots_mk1",
    label: "Stiefel MK1",
    category: "boots",
    cost: { credits: 500 },
    effects: [{ stat: "jumpVelocity", op: "multiply", value: 1.05 }]
  },
  boots_mk2: {
    id: "boots_mk2",
    label: "Stiefel MK2",
    category: "boots",
    cost: { credits: 1200 },
    prerequisites: ["boots_mk1"],
    effects: [{ stat: "jumpVelocity", op: "multiply", value: 1.1 }]
  },
  boots_mk3: {
    id: "boots_mk3",
    label: "Stiefel MK3",
    category: "boots",
    cost: { credits: 3e3 },
    prerequisites: ["boots_mk2"],
    effects: [{ stat: "jumpVelocity", op: "multiply", value: 1.16 }]
  },
  boots_mk4: {
    id: "boots_mk4",
    label: "Stiefel MK4",
    category: "boots",
    cost: { credits: 6e3 },
    prerequisites: ["boots_mk3"],
    effects: [{ stat: "jumpVelocity", op: "multiply", value: 1.22 }]
  },
  core_compass: {
    id: "core_compass",
    label: "Core-Compass",
    category: "core",
    cost: { credits: 800 },
    effects: []
  },
  core_scanner: {
    id: "core_scanner",
    label: "Core-Scanner",
    category: "core",
    cost: { credits: 2e3 },
    prerequisites: ["core_compass"],
    effects: []
  },
  advanced_mapper: {
    id: "advanced_mapper",
    label: "Advanced-Mapper",
    category: "core",
    cost: { credits: 5e3 },
    prerequisites: ["core_scanner"],
    effects: [{ stat: "sightRadius", op: "add", value: 1 }]
  },
  cargo_mk1: {
    id: "cargo_mk1",
    label: "Erweiterter Laderaum I",
    category: "cargo",
    cost: { credits: 300 },
    effects: [{ stat: "cargoSlots", op: "set", value: 2 }]
  },
  cargo_mk2: {
    id: "cargo_mk2",
    label: "Erweiterter Laderaum II",
    category: "cargo",
    cost: { credits: 800 },
    prerequisites: ["cargo_mk1"],
    effects: [{ stat: "cargoSlots", op: "set", value: 3 }]
  },
  cargo_mk3: {
    id: "cargo_mk3",
    label: "Erweiterter Laderaum III",
    category: "cargo",
    cost: { credits: 2e3 },
    prerequisites: ["cargo_mk2"],
    effects: [{ stat: "cargoSlots", op: "set", value: 4 }]
  },
  cargo_stack_mk1: {
    id: "cargo_stack_mk1",
    label: "Stack-Kompression I",
    category: "cargo",
    cost: { credits: 600 },
    effects: [{ stat: "cargoStackLimit", op: "set", value: 5 }]
  },
  cargo_stack_mk2: {
    id: "cargo_stack_mk2",
    label: "Stack-Kompression II",
    category: "cargo",
    cost: { credits: 1500 },
    prerequisites: ["cargo_stack_mk1"],
    effects: [{ stat: "cargoStackLimit", op: "set", value: 10 }]
  },
  engine_mk1: {
    id: "engine_mk1",
    label: "Triebwerke MK1",
    category: "ship",
    cost: { credits: 500 },
    effects: [{ stat: "fuelEfficiency", op: "multiply", value: 1.1 }]
  },
  engine_mk2: {
    id: "engine_mk2",
    label: "Triebwerke MK2",
    category: "ship",
    cost: { credits: 1500 },
    prerequisites: ["engine_mk1"],
    effects: [{ stat: "fuelEfficiency", op: "multiply", value: 1.25 }]
  },
  engine_mk3: {
    id: "engine_mk3",
    label: "Triebwerke MK3",
    category: "ship",
    cost: { credits: 4e3 },
    prerequisites: ["engine_mk2"],
    effects: [{ stat: "fuelEfficiency", op: "multiply", value: 1.4 }]
  }
};

// public/scripts/PlayerState/stats.ts
function computeEffectiveStats(profile) {
  const stats = {
    maxHealth: 100,
    maxEnergy: 100,
    energyRegenPerSec: ENERGY_REGEN_PER_SEC,
    energyCostPerSec: ENERGY_COST_PER_SEC,
    miningDamagePerSec: MINING_DAMAGE_PER_SEC,
    miningRange: MINING_RANGE,
    moveSpeed: PLAYER_SPEED,
    jumpVelocity: JUMP_VELOCITY,
    cargoSlots: 2,
    cargoStackLimit: 3,
    sightRadius: 3,
    fuelEfficiency: 1
  };
  const modifiers = collectModifiers(profile);
  for (const modifier of modifiers) applyModifier(stats, modifier);
  return stats;
}
function collectModifiers(profile) {
  const upgradeModifiers = profile.upgrades.purchased.flatMap((upgradeId) => UPGRADE_DEFINITIONS[upgradeId]?.effects ?? []);
  const perkModifiers = profile.perks.equipped.flatMap((perkId) => PERK_DEFINITIONS[perkId]?.effects ?? []);
  return [...upgradeModifiers, ...perkModifiers];
}
function applyModifier(stats, modifier) {
  if (modifier.op === "add") {
    stats[modifier.stat] += modifier.value;
    return;
  }
  if (modifier.op === "multiply") {
    stats[modifier.stat] *= modifier.value;
    return;
  }
  stats[modifier.stat] = modifier.value;
}

// public/scripts/PlayerState/PlayerStateManager.node.ts
var PlayerStateManager = class extends ScriptNode {
  id = "dynamic.player-state";
  name = "Player State";
  saveGameState;
  activeRunState;
  effectivePlayerStats;
  saveTimerMs = 0;
  miningActive = false;
  init() {
    this.saveGameState = loadSaveGame();
    this.effectivePlayerStats = computeEffectiveStats(this.saveGameState.profile);
  }
  get save() {
    return this.saveGameState;
  }
  get run() {
    if (!this.activeRunState) throw new Error("No active run has been started");
    return this.activeRunState;
  }
  getActiveRun() {
    return this.activeRunState;
  }
  get stats() {
    return this.effectivePlayerStats;
  }
  getActiveRunSeed(fallback) {
    return this.saveGameState.activeRun?.seed ?? fallback;
  }
  startRun(planetId, seed, restoreActiveRun) {
    const activeRun = restoreActiveRun && this.saveGameState.activeRun?.planetId === planetId && this.saveGameState.activeRun.seed === seed ? this.saveGameState.activeRun : void 0;
    this.activeRunState = activeRun ? normalizeRunState(activeRun, this.effectivePlayerStats) : createRunState(planetId, seed, this.effectivePlayerStats);
    this.saveTimerMs = 0;
    this.miningActive = false;
    this.saveActiveRun();
    return this.activeRunState;
  }
  update(deltaMs) {
    if (!this.activeRunState) return;
    if (!this.miningActive) this.recoverEnergy(deltaMs / 1e3);
    this.saveTimerMs += deltaMs;
    if (this.saveTimerMs < 1e3) return;
    this.saveTimerMs = 0;
    this.saveActiveRun();
  }
  setMiningActive(active) {
    this.miningActive = active;
  }
  hasMiningEnergy() {
    return this.run.energy > 0;
  }
  consumeMiningEnergy(deltaSeconds) {
    this.run.energy = Math.max(0, this.run.energy - this.effectivePlayerStats.energyCostPerSec * deltaSeconds);
  }
  recoverEnergy(deltaSeconds) {
    this.run.energy = Math.min(this.effectivePlayerStats.maxEnergy, this.run.energy + this.effectivePlayerStats.energyRegenPerSec * deltaSeconds);
  }
  refillEnergy() {
    this.run.energy = this.effectivePlayerStats.maxEnergy;
    this.saveActiveRun();
  }
  recordMinedTile(tileType) {
    this.syncCargoToStats();
    if (tileType in ITEM_DEFINITIONS) {
      addItem(this.run.cargo, tileType, 1);
      this.saveGameState.profile.stats.resourcesMined += 1;
    }
    this.saveGameState.profile.stats.blocksMined += 1;
    this.saveActiveRun();
  }
  syncCargoToStats() {
    if (!this.activeRunState) return;
    this.activeRunState.cargo = normalizeInventory(
      this.activeRunState.cargo,
      this.effectivePlayerStats.cargoSlots,
      this.effectivePlayerStats.cargoStackLimit
    );
  }
  hasCargo() {
    return this.run.cargo.slots.some((slot) => Boolean(slot.itemId && slot.quantity > 0));
  }
  returnCargoToShip() {
    const cargo = this.run.cargo.slots.filter((slot) => Boolean(slot.itemId && slot.quantity > 0));
    if (cargo.length === 0) {
      this.refillEnergy();
      return { message: "Schiffsdock: Energie aufgef\xFCllt", transferred: 0, credits: 0 };
    }
    let credits = 0;
    let transferred = 0;
    for (const slot of cargo) {
      if (!slot.itemId) continue;
      const itemId = slot.itemId;
      const definition = ITEM_DEFINITIONS[itemId];
      const quantity = slot.quantity;
      addItem(this.saveGameState.profile.inventory, itemId, quantity);
      credits += definition.value * quantity;
      transferred += quantity;
      delete slot.itemId;
      slot.quantity = 0;
    }
    this.saveGameState.profile.credits += credits;
    this.saveGameState.profile.stats.creditsEarned += credits;
    this.refillEnergy();
    return { message: `Cargo gesichert: ${transferred} Items \xB7 +${credits} Credits`, transferred, credits };
  }
  saveActiveRun() {
    if (!this.activeRunState) return;
    this.saveGameState.activeRun = this.activeRunState;
    saveGame(this.saveGameState);
  }
};

// public/scripts/UI/BottomHudScript.node.ts
var SLOT_PREFAB_ID = "fc891d95-3efb-567e-81d1-7fb0a446ebf5";
var FIRST_SLOT_ASSET = "hud-hp-fuel-atlas#inventoryFirstSlot";
var BottomHudScript = class extends ScriptNode {
  id = "dynamic.bottom-hud";
  name = "Bottom HUD Script";
  hudRootNodeId = prop.nodeRef(null, { label: "HUD Root" });
  energyFillNodeId = prop.nodeRef(null, { label: "Energy Fill" });
  playerStateNodeId = prop.nodeRef(null, { label: "Player State" });
  slotPrefabId = prop.string(SLOT_PREFAB_ID, { label: "Slot Prefab ID" });
  slotOriginX = prop.number(362.93, { label: "Slot Origin X", step: 1 });
  slotOriginY = prop.number(21.767, { label: "Slot Origin Y", step: 1 });
  hudRoot;
  energyFill;
  playerState;
  slots = [];
  slotItems = [];
  slotLabels = [];
  resolve() {
    this.hudRoot = this.requireResolvedNode(this.hudRootNodeId, "UI.BottomHud");
    this.energyFill = this.requireResolvedNode(this.energyFillNodeId, "UI.EnergyFill");
    this.playerState = this.requireResolvedNode(this.playerStateNodeId, "PlayerState");
    this.syncSlotCount();
    this.updateHud();
  }
  update() {
    this.syncSlotCount();
    this.updateHud();
  }
  editorUpdate() {
    this.syncSlotCount();
    this.updateHud();
  }
  destroy() {
    while (this.slots.length > 0) this.removeLastSlot();
  }
  syncSlotCount() {
    const targetCount = Math.max(0, Math.floor(this.playerState.stats.cargoSlots));
    while (this.slots.length < targetCount) this.addSlot(this.slots.length);
    while (this.slots.length > targetCount) this.removeLastSlot();
    this.layoutSlots();
  }
  addSlot(index) {
    const slot = this.instantiatePrefab(this.slotPrefabId, {
      name: `UI.Slot${index}`,
      props: {
        position: { x: this.slotOriginX, y: this.slotOriginY },
        ...index === 0 ? { assetId: FIRST_SLOT_ASSET } : {}
      }
    });
    this.hudRoot.addChild(slot);
    const item = this.requireChildByName(slot, "Item");
    const label = this.requireChildByName(slot, "Label");
    label.resolution = Math.max(2, window.devicePixelRatio || 1);
    this.slots.push(slot);
    this.slotItems.push(item);
    this.slotLabels.push(label);
  }
  layoutSlots() {
    const firstSlot = this.slots[0];
    if (!firstSlot) return;
    const slotWidth = firstSlot.getContentBoundsForParentSizing()?.width ?? firstSlot.size.width;
    for (let index = 0; index < this.slots.length; index += 1) {
      this.slots[index].position = {
        x: this.slotOriginX + index * slotWidth,
        y: this.slotOriginY
      };
    }
  }
  removeLastSlot() {
    const slot = this.slots.pop();
    this.slotItems.pop();
    this.slotLabels.pop();
    if (slot) this.hudRoot.removeChild(slot);
  }
  updateHud() {
    const run = this.playerState.getActiveRun();
    const maxEnergy = Math.max(1, this.playerState.stats.maxEnergy);
    const energyPct = clamp3((run?.energy ?? maxEnergy) / maxEnergy, 0, 1);
    this.energyFill.setHorizontalFill(energyPct);
    for (let index = 0; index < this.slots.length; index += 1) {
      const cargo = run?.cargo.slots[index];
      const item = this.slotItems[index];
      const label = this.slotLabels[index];
      const hasItem = Boolean(cargo?.itemId && cargo.quantity > 0);
      item.visible = hasItem;
      item.image.setVisible(hasItem);
      if (cargo?.itemId && cargo.quantity > 0) item.image.setTint(ITEM_TINTS[cargo.itemId]);
      else item.image.clearTint();
      const text = cargo?.itemId && cargo.quantity > 0 ? `${ITEM_SHORT_LABELS[cargo.itemId]} x${cargo.quantity}` : "";
      if (label.setText) label.setText(text);
      else label.text = text;
    }
  }
  requireResolvedNode(instanceId, fallbackName) {
    const node = (instanceId ? this.getNodeById(instanceId) : void 0) ?? this.getNode(fallbackName);
    if (!node) throw new Error(`Required node '${instanceId ?? fallbackName}' was not found`);
    return node;
  }
  requireChildByName(root, name) {
    const child = root.children.find((node) => node.debugName() === name);
    if (!child) throw new Error(`Inventory slot is missing child '${name}'`);
    return child;
  }
};
var ITEM_SHORT_LABELS = {
  dirt: "Er",
  sand: "Sa",
  clay: "Le",
  gravel: "Ki",
  stone: "St",
  basalt: "Ba",
  copper: "Cu",
  iron: "Fe",
  gold: "Au",
  diamond: "Di",
  energy_cell: "EZ",
  repair_kit: "RK",
  teleport_bracelet: "TP"
};
var ITEM_TINTS = {
  dirt: 10119749,
  sand: 14204280,
  clay: 12150869,
  gravel: 9407363,
  stone: 10265519,
  basalt: 4937059,
  copper: 14251845,
  iron: 9741240,
  gold: 16436245,
  diamond: 6809849,
  energy_cell: 8702998,
  repair_kit: 15680580,
  teleport_bracelet: 12616956
};
function clamp3(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// public/scripts/UI/StatusHudScript.node.ts
var HP_FRAME = { width: 655, height: 95 };
var FUEL_FRAME = { width: 632, height: 81 };
var MAX_FUEL = 100;
var StatusHudScript = class extends ScriptNode {
  id = "dynamic.status-hud";
  name = "Status HUD Script";
  hpFillNodeId = prop.nodeRef(null, { label: "HP Fill" });
  fuelFillNodeId = prop.nodeRef(null, { label: "Fuel Fill" });
  playerStateNodeId = prop.nodeRef(null, { label: "Player State" });
  hpFill;
  fuelFill;
  playerState;
  resolve() {
    this.hpFill = this.requireResolvedNode(this.hpFillNodeId, "UI.HpFill");
    this.fuelFill = this.requireResolvedNode(this.fuelFillNodeId, "UI.FuelFill");
    this.playerState = this.requireResolvedNode(this.playerStateNodeId, "PlayerState");
    this.updateHud();
  }
  update() {
    this.updateHud();
  }
  editorUpdate() {
    this.updateHud();
  }
  updateHud() {
    const run = this.playerState.getActiveRun();
    const maxHealth = Math.max(1, this.playerState.stats.maxHealth);
    this.updateBarFill(this.hpFill, HP_FRAME, (run?.health ?? maxHealth) / maxHealth);
    this.updateBarFill(this.fuelFill, FUEL_FRAME, (run?.fuel ?? MAX_FUEL) / MAX_FUEL);
  }
  updateBarFill(node, frame, pct) {
    const safePct = clamp4(pct, 0, 1);
    const visible = safePct > 0;
    node.visible = visible;
    node.image.setCrop(0, 0, Math.max(1, Math.round(frame.width * safePct)), frame.height);
    node.image.setVisible(visible);
  }
  requireResolvedNode(instanceId, fallbackName) {
    const node = (instanceId ? this.getNodeById(instanceId) : void 0) ?? this.getNode(fallbackName);
    if (!node) throw new Error(`Required node '${instanceId ?? fallbackName}' was not found`);
    return node;
  }
};
function clamp4(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
  createDynamicNodeModule(MiningScript, "Gameplay-MiningScript"),
  createDynamicNodeModule(PlayerAnimationScript, "Gameplay-PlayerAnimationScript"),
  createDynamicNodeModule(PlayerMovementScript, "Gameplay-PlayerMovementScript"),
  createDynamicNodeModule(ShipScript, "Gameplay-ShipScript"),
  createDynamicNodeModule(LoadingScript, "Loading-LoadingScript"),
  createDynamicNodeModule(GameplayInputScript, "Managers-GameplayInput"),
  createDynamicNodeModule(LevelManager, "Managers-LevelManager"),
  createDynamicNodeModule(PlayerStateManager, "PlayerState-PlayerStateManager"),
  createDynamicNodeModule(BottomHudScript, "UI-BottomHudScript"),
  createDynamicNodeModule(StatusHudScript, "UI-StatusHudScript")
];
var dynamic_nodes_entry_default = { modules };
export {
  dynamic_nodes_entry_default as default,
  modules
};
//# sourceMappingURL=dynamic-nodes.ef59899c32af.js.map
