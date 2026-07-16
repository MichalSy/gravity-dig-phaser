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
function marker(value, type, options) {
  const { group, ...definitionOptions } = options;
  return { __dynamicNodeProp: true, value, definition: { type, ...definitionOptions }, group };
}
var prop = {
  string: (value, options = {}) => marker(value, "String", options),
  number: (value, options = {}) => marker(value, "Number", options),
  boolean: (value, options = {}) => marker(value, "Boolean", options),
  assetId: (value, options = {}) => marker(value, "AssetId", options),
  color: (value, options = {}) => marker(value, "Color", options),
  nodeRef: (value = null, options = {}) => marker(value, "NodeRef", options),
  nodeRefList: (value = [], options = {}) => marker(value, "NodeRefList", options)
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
var DROPPABLE_TILE_TYPES = /* @__PURE__ */ new Set(["sand", "clay", "gravel", "stone", "basalt", "copper", "iron", "gold", "diamond"]);
var FRAGMENT_INTERVAL_MS = 45;
var CHAIN_OFFSETS = [
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: 1, y: 1 },
  { x: -2, y: 0 },
  { x: 2, y: 0 },
  { x: 0, y: -2 },
  { x: 0, y: 2 }
];
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
  fragmentTimerMs = 0;
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
    this.fragmentTimerMs = 0;
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
    this.target = target;
    this.clearPresentation(false);
    if (!target) {
      this.fragmentTimerMs = 0;
      this.laserAudio.stop();
      return;
    }
    this.showTargetAndBeam(target, origin, firing);
    if (!firing || !this.playerState.hasMiningEnergy()) {
      this.fragmentTimerMs = 0;
      this.laserAudio.stop();
      return;
    }
    this.laserAudio.play();
    this.playerState.consumeMiningEnergy(deltaSeconds);
    target.health -= this.playerState.stats.miningDamagePerSec * deltaSeconds;
    this.emitMiningFragments(target, deltaSeconds * 1e3);
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
  mineTile(cell, triggerChain = true) {
    const minedType = cell.type;
    const frame = cell.foregroundFrame;
    const center = this.tileCenter(cell);
    if (!this.levelNode.clearTile(cell)) return;
    this.world.emitMiningFragments(minedType, center.x, center.y, 12);
    if (DROPPABLE_TILE_TYPES.has(minedType)) this.world.spawnResourceDrop(minedType, frame, center.x, center.y);
    this.removeCrackOverlay(cell);
    this.playerState.recordMinedTile(minedType);
    const detune = Math.round(Math.random() * 90 - 45);
    (RESOURCE_TILE_TYPES.has(minedType) ? this.gemBreakAudio : this.dirtBreakAudio).playOneShot({ detune });
    if (triggerChain) this.triggerChainMining(cell, center);
  }
  triggerChainMining(originCell, origin) {
    const targetCount = Math.max(0, Math.round(this.playerState.stats.chainMiningTargets));
    if (targetCount === 0) return;
    const candidates = [];
    for (const offset of CHAIN_OFFSETS) {
      const cell = this.levelNode.getCell(originCell.x + offset.x, originCell.y + offset.y);
      if (!cell || !cell.type || cell.type === "air" || cell.type === "bedrock") continue;
      candidates.push(cell);
      if (candidates.length >= targetCount) break;
    }
    if (candidates.length === 0) return;
    const points = [origin];
    for (const cell of candidates) {
      points.push(this.tileCenter(cell));
      this.mineTile(cell, false);
    }
    this.world.emitChainLightning(points);
  }
  emitMiningFragments(cell, deltaMs) {
    this.fragmentTimerMs += deltaMs;
    if (this.fragmentTimerMs < FRAGMENT_INTERVAL_MS) return;
    this.fragmentTimerMs %= FRAGMENT_INTERVAL_MS;
    const center = this.tileCenter(cell);
    this.world.emitMiningFragments(cell.type, center.x, center.y, 3);
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
  airJumpsRemaining = 0;
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
    this.airJumpsRemaining = this.playerState.stats.airJumps;
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
    if (this.airJumpsRemaining > 0) {
      this.airJumpsRemaining -= 1;
      this.jump(true);
      return;
    }
    this.jumpBufferTimerSeconds = 0.1;
  }
  applyPhysics(deltaSeconds) {
    const wasGrounded = this.grounded;
    this.velocity.y += GRAVITY * this.playerState.stats.gravityMultiplier * deltaSeconds;
    this.moveAxis(this.velocity.x * deltaSeconds, 0);
    this.grounded = false;
    this.moveAxis(0, this.velocity.y * deltaSeconds);
    this.stabilizeGroundContact();
    if (this.grounded) this.airJumpsRemaining = this.playerState.stats.airJumps;
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
  jump(jetpack = false) {
    this.velocity.y = this.playerState.stats.jumpVelocity;
    this.grounded = false;
    this.coyoteTimerSeconds = 0;
    this.emit(jetpack ? "player:jetpack" : "player:jump");
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
var CARGO_TRANSFER_MIN_INTERVAL_MS = 120;
var CARGO_TRANSFER_MAX_INTERVAL_MS = 230;
var ShipScript = class extends ScriptNode {
  id = "dynamic.ship";
  name = "Ship Script";
  worldNodeId = prop.nodeRef(null, { label: "World Node" });
  playerStateNodeId = prop.nodeRef(null, { label: "Player State Node" });
  shipImageNodeId = prop.nodeRef(null, { label: "Ship Image" });
  promptNodeId = prop.nodeRef(null, { label: "Prompt Text" });
  bottomHudNodeId = prop.nodeRef(null, { label: "Bottom HUD Behavior" });
  upgradeDialogNodeId = prop.nodeRef(null, { label: "Upgrade Dialog Behavior" });
  shipWidth = prop.number(548.16, { label: "Ship Width", min: 1, step: 1 });
  shipHeight = prop.number(336, { label: "Ship Height", min: 1, step: 1 });
  promptOffsetY = prop.number(57.6, { label: "Prompt Offset Y", min: 0, step: 1 });
  messageDurationMs = prop.number(2200, { label: "Message Duration", min: 0, step: 100 });
  world;
  playerState;
  shipImage;
  promptText;
  bottomHud;
  upgradeDialog;
  gameplayInput;
  lastMessage = "";
  lastMessageTimerMs = 0;
  transferTimerMs = 0;
  resolve() {
    this.world = this.requireResolvedNode(this.worldNodeId, "World");
    this.playerState = this.requireResolvedNode(this.playerStateNodeId, "PlayerState");
    this.shipImage = this.requireResolvedNode(this.shipImageNodeId, "ShipImage");
    this.promptText = this.requireResolvedNode(this.promptNodeId, "ShipPrompt");
    this.bottomHud = this.requireResolvedNode(this.bottomHudNodeId, "BottomHudBehavior");
    this.upgradeDialog = this.requireResolvedNode(this.upgradeDialogNodeId, "UpgradeDialogBehavior");
    this.gameplayInput = this.requireResolvedNode(null, "GameplayInput");
    this.layoutShipImage();
    this.resetPrompt();
  }
  update(deltaMs) {
    this.layoutShipImage();
    this.lastMessageTimerMs = Math.max(0, this.lastMessageTimerMs - deltaMs);
    const player = this.world.player;
    const atDock = this.isAtDock(player);
    const hasCargo = this.playerState.run.cargo.slots.some((slot) => Boolean(slot.itemId && slot.quantity > 0));
    if (atDock) {
      this.playerState.recoverEnergyAtShip(deltaMs / 1e3);
      this.updateCargoTransfer(deltaMs);
    } else {
      this.playerState.consumeLifeSupportEnergy(deltaMs / 1e3);
      this.transferTimerMs = 0;
    }
    const upgradePrompt = this.gameplayInput.getInputMode() === "touch" ? "UPGRADES VERF\xDCGBAR" : "[E] UPGRADES";
    const message = this.upgradeDialog.isOpen() ? "" : this.lastMessageTimerMs > 0 ? this.lastMessage : atDock ? `${upgradePrompt}
${hasCargo ? "Cargo wird automatisch verladen" : "Energie wird aufgeladen"} \xB7 ${this.playerState.save.profile.credits} C` : "";
    this.promptText.setText?.(message);
    this.promptText.position = this.promptText.worldToLocalPosition({ x: player.x, y: player.y - this.promptOffsetY });
    this.promptText.visible = Boolean(message);
  }
  interact() {
    if (!this.isAtDock(this.world.player)) {
      this.showMessage("Zu weit vom Schiff entfernt");
      return;
    }
    this.upgradeDialog.open();
  }
  isPlayerAtDock() {
    return this.isAtDock(this.world.player);
  }
  resetPrompt() {
    this.lastMessage = "";
    this.lastMessageTimerMs = 0;
    this.transferTimerMs = 0;
    this.promptText?.setText?.("");
    if (this.promptText) this.promptText.visible = false;
  }
  updateCargoTransfer(deltaMs) {
    this.transferTimerMs = Math.max(0, this.transferTimerMs - deltaMs);
    if (this.transferTimerMs > 0) return;
    const slotIndex = this.playerState.run.cargo.slots.findIndex((slot) => Boolean(slot.itemId && slot.quantity > 0));
    if (slotIndex < 0) return;
    const start = this.bottomHud.getCargoSlotScreenPosition(slotIndex);
    if (!start) return;
    const transfer = this.playerState.transferNextCargoItemToShip();
    if (!transfer) return;
    this.world.launchCargoTransfer(transfer.itemId, start.x, start.y, SHIP_DOCK_CENTER_X, SHIP_DOCK_CENTER_Y);
    this.transferTimerMs = CARGO_TRANSFER_MIN_INTERVAL_MS + Math.random() * (CARGO_TRANSFER_MAX_INTERVAL_MS - CARGO_TRANSFER_MIN_INTERVAL_MS);
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
  sand: { id: "sand", label: "Sand", category: "resource", value: 2, stackSize: 999 },
  clay: { id: "clay", label: "Lehm", category: "resource", value: 2, stackSize: 999 },
  gravel: { id: "gravel", label: "Kies", category: "resource", value: 2, stackSize: 999 },
  stone: { id: "stone", label: "Stein", category: "resource", value: 2, stackSize: 999 },
  basalt: { id: "basalt", label: "Basalt", category: "resource", value: 4, stackSize: 999 },
  copper: { id: "copper", label: "Kupfer", category: "resource", value: 6, stackSize: 999 },
  iron: { id: "iron", label: "Eisen", category: "resource", value: 10, stackSize: 999 },
  gold: { id: "gold", label: "Gold", category: "resource", value: 30, stackSize: 999 },
  diamond: { id: "diamond", label: "Diamant", category: "resource", value: 100, stackSize: 999 },
  energy_cell: { id: "energy_cell", label: "Energie-Zelle", category: "consumable", value: 30, stackSize: 20 },
  repair_kit: { id: "repair_kit", label: "Repair-Kit", category: "consumable", value: 40, stackSize: 20 },
  teleport_bracelet: { id: "teleport_bracelet", label: "Teleport-Armband", category: "consumable", value: 200, stackSize: 5 }
};

// public/scripts/PlayerState/playerConfig.ts
var TILE_SIZE = 96;
var PLAYER_SPEED = 470;
var JUMP_VELOCITY = -1040;
var MINING_RANGE = 330;
var MINING_DAMAGE_PER_SEC = 120;
var ENERGY_REGEN_PER_SEC = 18;
var ENERGY_COST_PER_SEC = 12;
var LIFE_SUPPORT_ENERGY_COST_PER_SEC = 1.5;

// public/scripts/PlayerState/catalogs/upgrades.ts
var SKILL_TREE_BRANCHES = {
  movement: [
    "spring_boots",
    "micro_jetpack",
    "rocket_pants",
    "moonwalk_insurance",
    "ceiling_negotiator",
    "turbo_snail",
    "chrono_shoelaces",
    "bounce_tax_refund",
    "antigravity_sandwich",
    "panic_teleporter",
    "comet_kneecaps",
    "quantum_hopscotch",
    "uninstall_gravity"
  ],
  vision: [
    "wide_visor",
    "ore_scanner",
    "xray_potato",
    "spectrum_monocle",
    "copper_gossip",
    "fog_coupon",
    "geology_karaoke",
    "schrodinger_map",
    "bureaucratic_xray",
    "prophetic_breadcrumbs",
    "seismic_gossip",
    "omniscient_toaster",
    "privacy_abolished"
  ],
  mining: [
    "laser_focus",
    "chain_lightning",
    "storm_subscription",
    "arc_apprentice",
    "ore_blender",
    "laser_spaghetti",
    "thunder_ferret",
    "tax_evasion_drill",
    "plasma_fondue",
    "recursive_pickaxe",
    "caffeinated_beam",
    "localized_apocalypse",
    "planetary_unsubscribe"
  ],
  utility: [
    "cargo_tetris",
    "pocket_wormhole",
    "rubber_duck_protocol",
    "emergency_banana",
    "cargo_origami",
    "pocket_dimension",
    "unionized_nanobots",
    "loot_boomerang",
    "insurance_fraud",
    "portable_shipyard",
    "cosmic_vacuum",
    "administrative_immortality",
    "reality_premium"
  ]
};
var SKILL_TREE_IDS = [
  "prospector_core",
  ...SKILL_TREE_BRANCHES.movement,
  ...SKILL_TREE_BRANCHES.vision,
  ...SKILL_TREE_BRANCHES.mining,
  ...SKILL_TREE_BRANCHES.utility
];
var UPGRADE_DEFINITIONS = {
  prospector_core: {
    id: "prospector_core",
    label: "Prospektor-Kern",
    description: "Schaltet die vier Forschungs\xE4ste frei und spendiert 10 Energie.",
    category: "core",
    cost: { credits: 50 },
    effects: [{ stat: "maxEnergy", op: "add", value: 10 }],
    tree: { x: 0, y: 0, branch: "core" }
  },
  spring_boots: {
    id: "spring_boots",
    label: "Federstiefel",
    description: "12 % h\xF6her springen. Boing ist eine Wissenschaft.",
    category: "boots",
    cost: { credits: 100 },
    prerequisites: ["prospector_core"],
    effects: [{ stat: "jumpVelocity", op: "multiply", value: 1.12 }],
    tree: { x: -1, y: 1, branch: "movement" }
  },
  micro_jetpack: {
    id: "micro_jetpack",
    label: "Mikro-Jetpack",
    description: "Ein zus\xE4tzlicher Sprung in der Luft.",
    category: "boots",
    cost: { credits: 350 },
    prerequisites: ["spring_boots"],
    effects: [{ stat: "airJumps", op: "set", value: 1 }],
    tree: { x: -2, y: 2, branch: "movement" }
  },
  rocket_pants: {
    id: "rocket_pants",
    label: "Raketenhose",
    description: "Zwei Luftspr\xFCnge und 28 % weniger Schwerkraft. Garantie erloschen.",
    category: "boots",
    cost: { credits: 900 },
    prerequisites: ["micro_jetpack"],
    effects: [{ stat: "airJumps", op: "set", value: 2 }, { stat: "gravityMultiplier", op: "multiply", value: 0.72 }],
    tree: { x: -3, y: 3, branch: "movement" }
  },
  wide_visor: {
    id: "wide_visor",
    label: "Weitwinkel-Visier",
    description: "Erh\xF6ht die permanente Sichtweite auf 3 Tiles.",
    category: "visor",
    cost: { credits: 100 },
    prerequisites: ["prospector_core"],
    effects: [{ stat: "sightRadius", op: "set", value: 3 }],
    tree: { x: 1, y: -1, branch: "vision" }
  },
  ore_scanner: {
    id: "ore_scanner",
    label: "Erz-Scanner",
    description: "Markiert Erzadern im Radius von 4 Tiles durch den Fog.",
    category: "visor",
    cost: { credits: 350 },
    prerequisites: ["wide_visor"],
    effects: [{ stat: "oreScannerRadius", op: "set", value: 4 }],
    tree: { x: 2, y: -2, branch: "vision" }
  },
  xray_potato: {
    id: "xray_potato",
    label: "R\xF6ntgen-Kartoffel",
    description: "Scanner-Radius 7 und +1 Sicht. Fragt nicht, warum sie summt.",
    category: "visor",
    cost: { credits: 900 },
    prerequisites: ["ore_scanner"],
    effects: [{ stat: "oreScannerRadius", op: "set", value: 7 }, { stat: "sightRadius", op: "add", value: 1 }],
    tree: { x: 3, y: -3, branch: "vision" }
  },
  laser_focus: {
    id: "laser_focus",
    label: "Laser-Fokus",
    description: "25 % mehr Mining-Schaden.",
    category: "laser",
    cost: { credits: 125 },
    prerequisites: ["prospector_core"],
    effects: [{ stat: "miningDamagePerSec", op: "multiply", value: 1.25 }],
    tree: { x: 1, y: 1, branch: "mining" }
  },
  chain_lightning: {
    id: "chain_lightning",
    label: "Kettenblitz",
    description: "Jeder zerst\xF6rte Block zerlegt zwei benachbarte Bl\xF6cke.",
    category: "laser",
    cost: { credits: 450 },
    prerequisites: ["laser_focus"],
    effects: [{ stat: "chainMiningTargets", op: "set", value: 2 }],
    tree: { x: 2, y: 2, branch: "mining" }
  },
  storm_subscription: {
    id: "storm_subscription",
    label: "Gewitter-Abo",
    description: "Vier Kettenziele und 15 % mehr Schaden. Monatlich k\xFCndbar.*",
    category: "laser",
    cost: { credits: 1100 },
    prerequisites: ["chain_lightning"],
    effects: [{ stat: "chainMiningTargets", op: "set", value: 4 }, { stat: "miningDamagePerSec", op: "multiply", value: 1.15 }],
    tree: { x: 3, y: 3, branch: "mining" }
  },
  cargo_tetris: {
    id: "cargo_tetris",
    label: "Cargo-Tetris",
    description: "+1 Cargo-Slot. Reihen verschwinden leider nicht.",
    category: "cargo",
    cost: { credits: 100 },
    prerequisites: ["prospector_core"],
    effects: [{ stat: "cargoSlots", op: "add", value: 1 }],
    tree: { x: -1, y: -1, branch: "utility" }
  },
  pocket_wormhole: {
    id: "pocket_wormhole",
    label: "Taschen-Wurmloch",
    description: "+3 Stackgr\xF6\xDFe und 140 Pixel Sammelradius.",
    category: "cargo",
    cost: { credits: 400 },
    prerequisites: ["cargo_tetris"],
    effects: [{ stat: "cargoStackLimit", op: "add", value: 3 }, { stat: "pickupRadius", op: "set", value: 140 }],
    tree: { x: -2, y: -2, branch: "utility" }
  },
  rubber_duck_protocol: {
    id: "rubber_duck_protocol",
    label: "Goldene Gummiente",
    description: "+25 Leben, 220 Pixel Magnet und 15 % weniger Schwerkraft. Quak.",
    category: "core",
    cost: { credits: 1e3 },
    prerequisites: ["pocket_wormhole"],
    effects: [{ stat: "maxHealth", op: "add", value: 25 }, { stat: "pickupRadius", op: "set", value: 220 }, { stat: "gravityMultiplier", op: "multiply", value: 0.85 }],
    tree: { x: -3, y: -3, branch: "utility" }
  },
  moonwalk_insurance: {
    id: "moonwalk_insurance",
    label: "Mondlauf-Versicherung",
    description: "8 % Tempo und 8 % weniger Schwerkraft. Deckt keine Mondkrater.",
    category: "boots",
    cost: { credits: 1500 },
    prerequisites: ["rocket_pants"],
    effects: [{ stat: "moveSpeed", op: "multiply", value: 1.08 }, { stat: "gravityMultiplier", op: "multiply", value: 0.92 }],
    tree: { x: -4, y: 4, branch: "movement" }
  },
  ceiling_negotiator: {
    id: "ceiling_negotiator",
    label: "Decken-Verhandler",
    description: "8 % mehr Sprung und 10 Leben. Einigt sich au\xDFergerichtlich mit Decken.",
    category: "boots",
    cost: { credits: 2200 },
    prerequisites: ["moonwalk_insurance"],
    effects: [{ stat: "jumpVelocity", op: "multiply", value: 1.08 }, { stat: "maxHealth", op: "add", value: 10 }],
    tree: { x: -5, y: 5, branch: "movement" }
  },
  turbo_snail: {
    id: "turbo_snail",
    label: "Turbo-Schnecke",
    description: "5 % Tempo und 20 Energie. Langsam war gestern, Schnecke bleibt.",
    category: "boots",
    cost: { credits: 3200 },
    prerequisites: ["ceiling_negotiator"],
    effects: [{ stat: "moveSpeed", op: "multiply", value: 1.05 }, { stat: "maxEnergy", op: "add", value: 20 }],
    tree: { x: -6, y: 6, branch: "movement" }
  },
  chrono_shoelaces: {
    id: "chrono_shoelaces",
    label: "Chrono-Schn\xFCrsenkel",
    description: "8 % Tempo und 10 % schnellere Regeneration. Zeit ist nur schlecht gebunden.",
    category: "boots",
    cost: { credits: 4500 },
    prerequisites: ["turbo_snail"],
    effects: [{ stat: "moveSpeed", op: "multiply", value: 1.08 }, { stat: "energyRegenPerSec", op: "multiply", value: 1.1 }],
    tree: { x: -7, y: 7, branch: "movement" }
  },
  bounce_tax_refund: {
    id: "bounce_tax_refund",
    label: "H\xFCpfsteuer-R\xFCckzahlung",
    description: "10 % mehr Sprung und 15 Energie. Formular B-OIN-G genehmigt.",
    category: "boots",
    cost: { credits: 6200 },
    prerequisites: ["chrono_shoelaces"],
    effects: [{ stat: "jumpVelocity", op: "multiply", value: 1.1 }, { stat: "maxEnergy", op: "add", value: 15 }],
    tree: { x: -8, y: 8, branch: "movement" }
  },
  antigravity_sandwich: {
    id: "antigravity_sandwich",
    label: "Antigrav-Sandwich",
    description: "Dritter Luftsprung und 18 % weniger Schwerkraft. Mit K\xE4se stabiler.",
    category: "boots",
    cost: { credits: 8500 },
    prerequisites: ["bounce_tax_refund"],
    effects: [{ stat: "airJumps", op: "set", value: 3 }, { stat: "gravityMultiplier", op: "multiply", value: 0.82 }],
    tree: { x: -9, y: 9, branch: "movement" }
  },
  panic_teleporter: {
    id: "panic_teleporter",
    label: "Panik-Teleporter",
    description: "12 % Tempo und 25 Energie. Teleportiert nur deine Motivation.",
    category: "boots",
    cost: { credits: 11e3 },
    prerequisites: ["antigravity_sandwich"],
    effects: [{ stat: "moveSpeed", op: "multiply", value: 1.12 }, { stat: "maxEnergy", op: "add", value: 25 }],
    tree: { x: -10, y: 10, branch: "movement" }
  },
  comet_kneecaps: {
    id: "comet_kneecaps",
    label: "Kometen-Kniescheiben",
    description: "12 % mehr Sprung und 10 % weniger Schwerkraft. Orthop\xE4den hassen sie.",
    category: "boots",
    cost: { credits: 14500 },
    prerequisites: ["panic_teleporter"],
    effects: [{ stat: "jumpVelocity", op: "multiply", value: 1.12 }, { stat: "gravityMultiplier", op: "multiply", value: 0.9 }],
    tree: { x: -11, y: 11, branch: "movement" }
  },
  quantum_hopscotch: {
    id: "quantum_hopscotch",
    label: "Quantum-Himmel-und-H\xF6lle",
    description: "Vier Luftspr\xFCnge und 8 % Tempo. Jeder zweite Sprung existiert nur wahrscheinlich.",
    category: "boots",
    cost: { credits: 19e3 },
    prerequisites: ["comet_kneecaps"],
    effects: [{ stat: "airJumps", op: "set", value: 4 }, { stat: "moveSpeed", op: "multiply", value: 1.08 }],
    tree: { x: -12, y: 12, branch: "movement" }
  },
  uninstall_gravity: {
    id: "uninstall_gravity",
    label: "Schwerkraft deinstallieren",
    description: "35 % weniger Schwerkraft, 12 % mehr Sprung und 50 Energie. Neustart nicht n\xF6tig.",
    category: "boots",
    cost: { credits: 26e3 },
    prerequisites: ["quantum_hopscotch"],
    effects: [{ stat: "gravityMultiplier", op: "multiply", value: 0.65 }, { stat: "jumpVelocity", op: "multiply", value: 1.12 }, { stat: "maxEnergy", op: "add", value: 50 }],
    tree: { x: -13, y: 13, branch: "movement" }
  },
  spectrum_monocle: {
    id: "spectrum_monocle",
    label: "Spektrum-Monokel",
    description: "Ein Tile mehr Sicht. Sieht auch peinliche Mineralien.",
    category: "visor",
    cost: { credits: 1500 },
    prerequisites: ["xray_potato"],
    effects: [{ stat: "sightRadius", op: "add", value: 1 }],
    tree: { x: 4, y: -4, branch: "vision" }
  },
  copper_gossip: {
    id: "copper_gossip",
    label: "Kupfer-Klatschfunk",
    description: "Scanner +2 Tiles und Magnet +20 Pixel. Kupfer erz\xE4hlt wirklich alles.",
    category: "visor",
    cost: { credits: 2200 },
    prerequisites: ["spectrum_monocle"],
    effects: [{ stat: "oreScannerRadius", op: "add", value: 2 }, { stat: "pickupRadius", op: "add", value: 20 }],
    tree: { x: 5, y: -5, branch: "vision" }
  },
  fog_coupon: {
    id: "fog_coupon",
    label: "Nebel-Rabattcoupon",
    description: "Ein Tile mehr Sicht und 15 Energie. Nur heute: 30 % weniger Unwissen.",
    category: "visor",
    cost: { credits: 3200 },
    prerequisites: ["copper_gossip"],
    effects: [{ stat: "sightRadius", op: "add", value: 1 }, { stat: "maxEnergy", op: "add", value: 15 }],
    tree: { x: 6, y: -6, branch: "vision" }
  },
  geology_karaoke: {
    id: "geology_karaoke",
    label: "Geologie-Karaoke",
    description: "Scanner +2 und 10 % Regeneration. Erze leuchten, wenn du falsch singst.",
    category: "visor",
    cost: { credits: 4500 },
    prerequisites: ["fog_coupon"],
    effects: [{ stat: "oreScannerRadius", op: "add", value: 2 }, { stat: "energyRegenPerSec", op: "multiply", value: 1.1 }],
    tree: { x: 7, y: -7, branch: "vision" }
  },
  schrodinger_map: {
    id: "schrodinger_map",
    label: "Schr\xF6dingers Karte",
    description: "Sicht +1 und Scanner +1. Das Erz ist da und nicht da.",
    category: "visor",
    cost: { credits: 6200 },
    prerequisites: ["geology_karaoke"],
    effects: [{ stat: "sightRadius", op: "add", value: 1 }, { stat: "oreScannerRadius", op: "add", value: 1 }],
    tree: { x: 8, y: -8, branch: "vision" }
  },
  bureaucratic_xray: {
    id: "bureaucratic_xray",
    label: "B\xFCrokratie-R\xF6ntgen",
    description: "Scanner +3 und 20 Leben. Genehmigt nur korrekt gestempelte Adern.",
    category: "visor",
    cost: { credits: 8500 },
    prerequisites: ["schrodinger_map"],
    effects: [{ stat: "oreScannerRadius", op: "add", value: 3 }, { stat: "maxHealth", op: "add", value: 20 }],
    tree: { x: 9, y: -9, branch: "vision" }
  },
  prophetic_breadcrumbs: {
    id: "prophetic_breadcrumbs",
    label: "Prophetische Brotkrumen",
    description: "Sicht +1 und Magnet +40 Pixel. Folgen auf eigene Gluten-Gefahr.",
    category: "visor",
    cost: { credits: 11e3 },
    prerequisites: ["bureaucratic_xray"],
    effects: [{ stat: "sightRadius", op: "add", value: 1 }, { stat: "pickupRadius", op: "add", value: 40 }],
    tree: { x: 10, y: -10, branch: "vision" }
  },
  seismic_gossip: {
    id: "seismic_gossip",
    label: "Seismischer Klatsch",
    description: "Scanner +3 und 8 % Laserschaden. Der Planet redet im Schlaf.",
    category: "visor",
    cost: { credits: 14500 },
    prerequisites: ["prophetic_breadcrumbs"],
    effects: [{ stat: "oreScannerRadius", op: "add", value: 3 }, { stat: "miningDamagePerSec", op: "multiply", value: 1.08 }],
    tree: { x: 11, y: -11, branch: "vision" }
  },
  omniscient_toaster: {
    id: "omniscient_toaster",
    label: "Allwissender Toaster",
    description: "Sicht +1, 40 Energie und 10 % Regeneration. Kennt dein Fr\xFChst\xFCck.",
    category: "visor",
    cost: { credits: 19e3 },
    prerequisites: ["seismic_gossip"],
    effects: [{ stat: "sightRadius", op: "add", value: 1 }, { stat: "maxEnergy", op: "add", value: 40 }, { stat: "energyRegenPerSec", op: "multiply", value: 1.1 }],
    tree: { x: 12, y: -12, branch: "vision" }
  },
  privacy_abolished: {
    id: "privacy_abolished",
    label: "Planet ohne Privatsph\xE4re",
    description: "Sicht +2, Scanner +4 und Magnet +80 Pixel. Datenschutz war optional.",
    category: "visor",
    cost: { credits: 26e3 },
    prerequisites: ["omniscient_toaster"],
    effects: [{ stat: "sightRadius", op: "add", value: 2 }, { stat: "oreScannerRadius", op: "add", value: 4 }, { stat: "pickupRadius", op: "add", value: 80 }],
    tree: { x: 13, y: -13, branch: "vision" }
  },
  arc_apprentice: {
    id: "arc_apprentice",
    label: "Lichtbogen-Lehrling",
    description: "F\xFCnf Kettenziele und 5 % Schaden. Sicherheitsunterweisung \xFCbersprungen.",
    category: "laser",
    cost: { credits: 1600 },
    prerequisites: ["storm_subscription"],
    effects: [{ stat: "chainMiningTargets", op: "set", value: 5 }, { stat: "miningDamagePerSec", op: "multiply", value: 1.05 }],
    tree: { x: 4, y: 4, branch: "mining" }
  },
  ore_blender: {
    id: "ore_blender",
    label: "Erz-Mixer",
    description: "12 % Schaden bei 7 % weniger Energieverbrauch. Smoothies separat erh\xE4ltlich.",
    category: "laser",
    cost: { credits: 2400 },
    prerequisites: ["arc_apprentice"],
    effects: [{ stat: "miningDamagePerSec", op: "multiply", value: 1.12 }, { stat: "energyCostPerSec", op: "multiply", value: 0.93 }],
    tree: { x: 5, y: 5, branch: "mining" }
  },
  laser_spaghetti: {
    id: "laser_spaghetti",
    label: "Laser-Spaghetti",
    description: "Zwei Tiles mehr Reichweite. Al dente und hochenergetisch.",
    category: "laser",
    cost: { credits: 3500 },
    prerequisites: ["ore_blender"],
    effects: [{ stat: "miningRange", op: "add", value: TILE_SIZE * 2 }],
    tree: { x: 6, y: 6, branch: "mining" }
  },
  thunder_ferret: {
    id: "thunder_ferret",
    label: "Donner-Frettchen",
    description: "Sechs Kettenziele und Magnet +30 Pixel. Bitte nicht f\xFCttern.",
    category: "laser",
    cost: { credits: 5e3 },
    prerequisites: ["laser_spaghetti"],
    effects: [{ stat: "chainMiningTargets", op: "set", value: 6 }, { stat: "pickupRadius", op: "add", value: 30 }],
    tree: { x: 7, y: 7, branch: "mining" }
  },
  tax_evasion_drill: {
    id: "tax_evasion_drill",
    label: "Steuerflucht-Bohrer",
    description: "15 % Schaden und +2 Stackgr\xF6\xDFe. Finanzamt hasst diesen Trick.",
    category: "laser",
    cost: { credits: 7e3 },
    prerequisites: ["thunder_ferret"],
    effects: [{ stat: "miningDamagePerSec", op: "multiply", value: 1.15 }, { stat: "cargoStackLimit", op: "add", value: 2 }],
    tree: { x: 8, y: 8, branch: "mining" }
  },
  plasma_fondue: {
    id: "plasma_fondue",
    label: "Plasma-Fondue",
    description: "15 % Schaden und ein Tile Reichweite. Erz bitte nicht doppelt dippen.",
    category: "laser",
    cost: { credits: 9500 },
    prerequisites: ["tax_evasion_drill"],
    effects: [{ stat: "miningDamagePerSec", op: "multiply", value: 1.15 }, { stat: "miningRange", op: "add", value: TILE_SIZE }],
    tree: { x: 9, y: 9, branch: "mining" }
  },
  recursive_pickaxe: {
    id: "recursive_pickaxe",
    label: "Rekursive Spitzhacke",
    description: "Acht Kettenziele und 10 % Schaden. Baut sich gelegentlich selbst ab.",
    category: "laser",
    cost: { credits: 12500 },
    prerequisites: ["plasma_fondue"],
    effects: [{ stat: "chainMiningTargets", op: "set", value: 8 }, { stat: "miningDamagePerSec", op: "multiply", value: 1.1 }],
    tree: { x: 10, y: 10, branch: "mining" }
  },
  caffeinated_beam: {
    id: "caffeinated_beam",
    label: "Koffein-Strahl",
    description: "20 % Schaden, 10 % weniger Verbrauch und 5 % Tempo. Zittert pr\xE4zise.",
    category: "laser",
    cost: { credits: 16500 },
    prerequisites: ["recursive_pickaxe"],
    effects: [{ stat: "miningDamagePerSec", op: "multiply", value: 1.2 }, { stat: "energyCostPerSec", op: "multiply", value: 0.9 }, { stat: "moveSpeed", op: "multiply", value: 1.05 }],
    tree: { x: 11, y: 11, branch: "mining" }
  },
  localized_apocalypse: {
    id: "localized_apocalypse",
    label: "Lokale Apokalypse",
    description: "Zehn Kettenziele, zwei Tiles Reichweite und 30 Energie. Nur lokal schlimm.",
    category: "laser",
    cost: { credits: 21500 },
    prerequisites: ["caffeinated_beam"],
    effects: [{ stat: "chainMiningTargets", op: "set", value: 10 }, { stat: "miningRange", op: "add", value: TILE_SIZE * 2 }, { stat: "maxEnergy", op: "add", value: 30 }],
    tree: { x: 12, y: 12, branch: "mining" }
  },
  planetary_unsubscribe: {
    id: "planetary_unsubscribe",
    label: "Planet deabonnieren",
    description: "35 % Schaden, zw\xF6lf Kettenziele und 20 % weniger Verbrauch. Newsletter beendet.",
    category: "laser",
    cost: { credits: 3e4 },
    prerequisites: ["localized_apocalypse"],
    effects: [{ stat: "miningDamagePerSec", op: "multiply", value: 1.35 }, { stat: "chainMiningTargets", op: "set", value: 12 }, { stat: "energyCostPerSec", op: "multiply", value: 0.8 }],
    tree: { x: 13, y: 13, branch: "mining" }
  },
  emergency_banana: {
    id: "emergency_banana",
    label: "Notfall-Banane",
    description: "20 Leben und 5 % mehr Sprung. Kaliumbasierte Raumfahrt.",
    category: "core",
    cost: { credits: 1500 },
    prerequisites: ["rubber_duck_protocol"],
    effects: [{ stat: "maxHealth", op: "add", value: 20 }, { stat: "jumpVelocity", op: "multiply", value: 1.05 }],
    tree: { x: -4, y: -4, branch: "utility" }
  },
  cargo_origami: {
    id: "cargo_origami",
    label: "Cargo-Origami",
    description: "Vier mehr pro Stack und ein Cargo-Slot. Faltet auch massive Basaltbrocken.",
    category: "cargo",
    cost: { credits: 2300 },
    prerequisites: ["emergency_banana"],
    effects: [{ stat: "cargoStackLimit", op: "add", value: 4 }, { stat: "cargoSlots", op: "add", value: 1 }],
    tree: { x: -5, y: -5, branch: "utility" }
  },
  pocket_dimension: {
    id: "pocket_dimension",
    label: "Hosentaschen-Dimension",
    description: "Magnet +60 Pixel und +3 Stackgr\xF6\xDFe. Fussel nicht mitgerechnet.",
    category: "cargo",
    cost: { credits: 3400 },
    prerequisites: ["cargo_origami"],
    effects: [{ stat: "pickupRadius", op: "add", value: 60 }, { stat: "cargoStackLimit", op: "add", value: 3 }],
    tree: { x: -6, y: -6, branch: "utility" }
  },
  unionized_nanobots: {
    id: "unionized_nanobots",
    label: "Gewerkschafts-Nanobots",
    description: "25 % Regeneration und 20 Leben. Machen gesetzliche Ladepause.",
    category: "core",
    cost: { credits: 4800 },
    prerequisites: ["pocket_dimension"],
    effects: [{ stat: "energyRegenPerSec", op: "multiply", value: 1.25 }, { stat: "maxHealth", op: "add", value: 20 }],
    tree: { x: -7, y: -7, branch: "utility" }
  },
  loot_boomerang: {
    id: "loot_boomerang",
    label: "Loot-Bumerang",
    description: "Magnet +80 Pixel und ein Tile Laserreichweite. Kommt meistens zur\xFCck.",
    category: "cargo",
    cost: { credits: 6700 },
    prerequisites: ["unionized_nanobots"],
    effects: [{ stat: "pickupRadius", op: "add", value: 80 }, { stat: "miningRange", op: "add", value: TILE_SIZE }],
    tree: { x: -8, y: -8, branch: "utility" }
  },
  insurance_fraud: {
    id: "insurance_fraud",
    label: "Meteoriten-Versicherungsbetrug",
    description: "30 Leben und 30 Energie. Schaden bitte leserlich einreichen.",
    category: "core",
    cost: { credits: 9e3 },
    prerequisites: ["loot_boomerang"],
    effects: [{ stat: "maxHealth", op: "add", value: 30 }, { stat: "maxEnergy", op: "add", value: 30 }],
    tree: { x: -9, y: -9, branch: "utility" }
  },
  portable_shipyard: {
    id: "portable_shipyard",
    label: "Tragbare Schiffswerft",
    description: "+5 Energieregeneration und ein Cargo-Slot. Passt knapp in die Tasche.",
    category: "ship",
    cost: { credits: 12e3 },
    prerequisites: ["insurance_fraud"],
    effects: [{ stat: "energyRegenPerSec", op: "add", value: 5 }, { stat: "cargoSlots", op: "add", value: 1 }],
    tree: { x: -10, y: -10, branch: "utility" }
  },
  cosmic_vacuum: {
    id: "cosmic_vacuum",
    label: "Kosmischer Staubsauger",
    description: "400 Pixel Magnet und +5 Stackgr\xF6\xDFe. Verschluckt Kleingeld.",
    category: "cargo",
    cost: { credits: 16e3 },
    prerequisites: ["portable_shipyard"],
    effects: [{ stat: "pickupRadius", op: "set", value: 400 }, { stat: "cargoStackLimit", op: "add", value: 5 }],
    tree: { x: -11, y: -11, branch: "utility" }
  },
  administrative_immortality: {
    id: "administrative_immortality",
    label: "Administrative Unsterblichkeit",
    description: "50 Leben, 50 Energie und 8 % weniger Schwerkraft. Tod nicht genehmigt.",
    category: "core",
    cost: { credits: 21e3 },
    prerequisites: ["cosmic_vacuum"],
    effects: [{ stat: "maxHealth", op: "add", value: 50 }, { stat: "maxEnergy", op: "add", value: 50 }, { stat: "gravityMultiplier", op: "multiply", value: 0.92 }],
    tree: { x: -12, y: -12, branch: "utility" }
  },
  reality_premium: {
    id: "reality_premium",
    label: "Realit\xE4t Premium",
    description: "75 Leben/Energie, 15 % Schaden, 10 % Tempo, +1 Sicht und +100 Magnet. Ohne Werbung.",
    category: "core",
    cost: { credits: 3e4 },
    prerequisites: ["administrative_immortality"],
    effects: [{ stat: "maxHealth", op: "add", value: 75 }, { stat: "maxEnergy", op: "add", value: 75 }, { stat: "miningDamagePerSec", op: "multiply", value: 1.15 }, { stat: "moveSpeed", op: "multiply", value: 1.1 }, { stat: "sightRadius", op: "add", value: 1 }, { stat: "pickupRadius", op: "add", value: 100 }],
    tree: { x: -13, y: -13, branch: "utility" }
  },
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
    effects: [{ stat: "sightRadius", op: "set", value: 3 }]
  },
  visor_mk2: {
    id: "visor_mk2",
    label: "Visier MK2",
    category: "visor",
    cost: { credits: 400 },
    prerequisites: ["visor_mk1"],
    effects: [{ stat: "sightRadius", op: "set", value: 4 }]
  },
  radar_visor: {
    id: "radar_visor",
    label: "Radar-Visier",
    category: "visor",
    cost: { credits: 900 },
    prerequisites: ["visor_mk2"],
    effects: [{ stat: "sightRadius", op: "set", value: 5 }]
  },
  quantum_visor: {
    id: "quantum_visor",
    label: "Quantum-Visier",
    category: "visor",
    cost: { credits: 2e3 },
    prerequisites: ["radar_visor"],
    effects: [{ stat: "sightRadius", op: "set", value: 6 }]
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
  speed_mk1: {
    id: "speed_mk1",
    label: "Servo-Antrieb I",
    category: "boots",
    cost: { credits: 60 },
    effects: [{ stat: "moveSpeed", op: "set", value: 489 }]
  },
  speed_mk2: {
    id: "speed_mk2",
    label: "Servo-Antrieb II",
    category: "boots",
    cost: { credits: 180 },
    prerequisites: ["speed_mk1"],
    effects: [{ stat: "moveSpeed", op: "set", value: 508 }]
  },
  speed_mk3: {
    id: "speed_mk3",
    label: "Servo-Antrieb III",
    category: "boots",
    cost: { credits: 420 },
    prerequisites: ["speed_mk2"],
    effects: [{ stat: "moveSpeed", op: "set", value: 526 }]
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
    cost: { credits: 75 },
    effects: [{ stat: "cargoSlots", op: "set", value: 3 }]
  },
  cargo_mk2: {
    id: "cargo_mk2",
    label: "Erweiterter Laderaum II",
    category: "cargo",
    cost: { credits: 225 },
    prerequisites: ["cargo_mk1"],
    effects: [{ stat: "cargoSlots", op: "set", value: 4 }]
  },
  cargo_mk3: {
    id: "cargo_mk3",
    label: "Erweiterter Laderaum III",
    category: "cargo",
    cost: { credits: 525 },
    prerequisites: ["cargo_mk2"],
    effects: [{ stat: "cargoSlots", op: "set", value: 5 }]
  },
  cargo_stack_mk1: {
    id: "cargo_stack_mk1",
    label: "Cargo-Slot-Gr\xF6\xDFe I",
    category: "cargo",
    cost: { credits: 90 },
    effects: [{ stat: "cargoStackLimit", op: "set", value: 5 }]
  },
  cargo_stack_mk2: {
    id: "cargo_stack_mk2",
    label: "Cargo-Slot-Gr\xF6\xDFe II",
    category: "cargo",
    cost: { credits: 260 },
    prerequisites: ["cargo_stack_mk1"],
    effects: [{ stat: "cargoStackLimit", op: "set", value: 8 }]
  },
  cargo_stack_mk3: {
    id: "cargo_stack_mk3",
    label: "Cargo-Slot-Gr\xF6\xDFe III",
    category: "cargo",
    cost: { credits: 600 },
    prerequisites: ["cargo_stack_mk2"],
    effects: [{ stat: "cargoStackLimit", op: "set", value: 12 }]
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
function getInventoryCount(inventory, itemId) {
  return inventory.slots.reduce((sum, slot) => sum + (slot.itemId === itemId ? slot.quantity : 0), 0);
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
function removeItem(inventory, itemId, quantity = 1) {
  let remaining = Math.max(0, Math.floor(quantity));
  let removed = 0;
  for (const slot of inventory.slots) {
    if (slot.itemId !== itemId || remaining <= 0) continue;
    const amount = Math.min(slot.quantity, remaining);
    slot.quantity -= amount;
    removed += amount;
    remaining -= amount;
    if (slot.quantity <= 0) clearSlot(slot);
  }
  return removed;
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
function clearSlot(slot) {
  delete slot.itemId;
  slot.quantity = 0;
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
    sightRadius: 2,
    fuelEfficiency: 1,
    airJumps: 0,
    gravityMultiplier: 1,
    oreScannerRadius: 0,
    chainMiningTargets: 0,
    pickupRadius: 58
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
  health = prop.number(100, { label: "Health", min: 0, step: 1, group: "Run" });
  energy = prop.number(100, { label: "Energy", min: 0, step: 1, group: "Run" });
  fuel = prop.number(100, { label: "Fuel", min: 0, step: 1, group: "Run" });
  maxHealth = prop.number(100, { label: "Max Health", min: 1, step: 1, group: "Stats" });
  maxEnergy = prop.number(100, { label: "Max Energy", min: 1, step: 1, group: "Stats" });
  energyRegenPerSec = prop.number(18, { label: "Energy Regen / sec", min: 0, step: 0.1, group: "Stats" });
  energyCostPerSec = prop.number(12, { label: "Mining Energy Cost / sec", min: 0, step: 0.1, group: "Stats" });
  miningDamagePerSec = prop.number(120, { label: "Mining Damage / sec", min: 0, step: 1, group: "Stats" });
  miningRange = prop.number(330, { label: "Mining Range", min: 0, step: 1, group: "Stats" });
  moveSpeed = prop.number(470, { label: "Move Speed", min: 0, step: 1, group: "Stats" });
  jumpVelocity = prop.number(-1040, { label: "Jump Velocity", step: 1, group: "Stats" });
  cargoSlots = prop.number(2, { label: "Cargo Slots", min: 1, step: 1, group: "Stats" });
  cargoStackLimit = prop.number(3, { label: "Cargo Stack Limit", min: 1, step: 1, group: "Stats" });
  sightRadius = prop.number(2, { label: "Sight Radius", min: 0, step: 1, group: "Stats" });
  fuelEfficiency = prop.number(1, { label: "Fuel Efficiency", min: 0, step: 0.1, group: "Stats" });
  credits = prop.number(0, { label: "Credits", min: 0, step: 1, group: "Profile" });
  blocksMined = prop.number(0, { label: "Blocks Mined", min: 0, step: 1, group: "Profile" });
  resourcesMined = prop.number(0, { label: "Resources Mined", min: 0, step: 1, group: "Profile" });
  creditsEarned = prop.number(0, { label: "Credits Earned", min: 0, step: 1, group: "Profile" });
  saveGameState;
  activeRunState;
  effectivePlayerStats;
  discoveredTileKeys = /* @__PURE__ */ new Set();
  saveTimerMs = 0;
  init() {
    this.saveGameState = loadSaveGame();
    this.effectivePlayerStats = computeEffectiveStats(this.saveGameState.profile);
  }
  getInspectorPropValue(name) {
    const run = this.activeRunState;
    switch (name) {
      case "health":
        return run?.health ?? null;
      case "energy":
        return run?.energy ?? null;
      case "fuel":
        return run?.fuel ?? null;
      case "credits":
        return this.saveGameState.profile.credits;
      case "blocksMined":
        return this.saveGameState.profile.stats.blocksMined;
      case "resourcesMined":
        return this.saveGameState.profile.stats.resourcesMined;
      case "creditsEarned":
        return this.saveGameState.profile.stats.creditsEarned;
      case "maxHealth":
      case "maxEnergy":
      case "energyRegenPerSec":
      case "energyCostPerSec":
      case "miningDamagePerSec":
      case "miningRange":
      case "moveSpeed":
      case "jumpVelocity":
      case "cargoSlots":
      case "cargoStackLimit":
      case "sightRadius":
      case "fuelEfficiency":
        return this.effectivePlayerStats[name];
      default:
        return void 0;
    }
  }
  onInspectorPropChanged(name, value) {
    if (typeof value !== "number") return;
    const run = this.activeRunState;
    switch (name) {
      case "health":
        if (run) run.health = clamp3(value, 0, this.effectivePlayerStats.maxHealth);
        return;
      case "energy":
        if (run) run.energy = clamp3(value, 0, this.effectivePlayerStats.maxEnergy);
        return;
      case "fuel":
        if (run) run.fuel = Math.max(0, value);
        return;
      case "credits":
        this.saveGameState.profile.credits = Math.max(0, Math.round(value));
        return;
      case "blocksMined":
      case "resourcesMined":
      case "creditsEarned":
        this.saveGameState.profile.stats[name] = Math.max(0, Math.round(value));
        return;
      case "maxHealth":
      case "maxEnergy":
      case "energyRegenPerSec":
      case "energyCostPerSec":
      case "miningDamagePerSec":
      case "miningRange":
      case "moveSpeed":
      case "jumpVelocity":
      case "cargoSlots":
      case "cargoStackLimit":
      case "sightRadius":
      case "fuelEfficiency":
        this.effectivePlayerStats[name] = name === "cargoSlots" || name === "cargoStackLimit" ? Math.max(1, Math.round(value)) : value;
        if (name === "cargoSlots" || name === "cargoStackLimit") this.syncCargoToStats();
        if (name === "maxHealth" && run) run.health = clamp3(run.health, 0, this.effectivePlayerStats.maxHealth);
        if (name === "maxEnergy" && run) run.energy = clamp3(run.energy, 0, this.effectivePlayerStats.maxEnergy);
    }
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
  getDiscoveredTiles() {
    return this.activeRunState?.discoveredTiles ?? [];
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
    this.discoveredTileKeys = new Set(this.activeRunState.discoveredTiles);
    this.saveTimerMs = 0;
    this.saveActiveRun();
    return this.activeRunState;
  }
  update(deltaMs) {
    if (!this.activeRunState) return;
    this.saveTimerMs += deltaMs;
    if (this.saveTimerMs < 1e3) return;
    this.saveTimerMs = 0;
    this.saveActiveRun();
  }
  hasMiningEnergy() {
    return this.run.energy > 0;
  }
  consumeMiningEnergy(deltaSeconds) {
    this.run.energy = Math.max(0, this.run.energy - this.effectivePlayerStats.energyCostPerSec * deltaSeconds);
  }
  consumeLifeSupportEnergy(deltaSeconds) {
    this.run.energy = Math.max(0, this.run.energy - LIFE_SUPPORT_ENERGY_COST_PER_SEC * deltaSeconds);
  }
  recoverEnergyAtShip(deltaSeconds) {
    this.run.energy = Math.min(this.effectivePlayerStats.maxEnergy, this.run.energy + this.effectivePlayerStats.energyRegenPerSec * deltaSeconds);
  }
  recordMinedTile(tileType) {
    if (tileType in ITEM_DEFINITIONS) this.saveGameState.profile.stats.resourcesMined += 1;
    this.saveGameState.profile.stats.blocksMined += 1;
    this.saveActiveRun();
  }
  discoverTiles(tileKeys) {
    if (!this.activeRunState || tileKeys.length === 0) return 0;
    let added = 0;
    for (const key of tileKeys) {
      if (this.discoveredTileKeys.has(key)) continue;
      this.discoveredTileKeys.add(key);
      this.activeRunState.discoveredTiles.push(key);
      added += 1;
    }
    return added;
  }
  tryCollectMinedItem(tileType) {
    if (!(tileType in ITEM_DEFINITIONS)) return false;
    this.syncCargoToStats();
    if (addItem(this.run.cargo, tileType, 1) !== 1) return false;
    this.saveActiveRun();
    return true;
  }
  syncCargoToStats() {
    if (!this.activeRunState) return;
    this.activeRunState.cargo = normalizeInventory(
      this.activeRunState.cargo,
      this.effectivePlayerStats.cargoSlots,
      this.effectivePlayerStats.cargoStackLimit
    );
  }
  getProfileCredits() {
    return this.saveGameState.profile.credits;
  }
  isUpgradePurchased(upgradeId) {
    return this.saveGameState.profile.upgrades.purchased.includes(upgradeId);
  }
  purchaseUpgrade(upgradeId) {
    const definition = UPGRADE_DEFINITIONS[upgradeId];
    if (!definition) return { ok: false, message: "Upgrade nicht gefunden" };
    if (this.isUpgradePurchased(upgradeId)) return { ok: false, message: "Bereits installiert" };
    const missingPrerequisite = definition.prerequisites?.find((id) => !this.isUpgradePurchased(id));
    if (missingPrerequisite) return { ok: false, message: "Vorherige Stufe erforderlich" };
    const credits = definition.cost.credits ?? 0;
    if (this.saveGameState.profile.credits < credits) return { ok: false, message: "Nicht genug Credits" };
    for (const [itemId, quantity] of Object.entries(definition.cost.items ?? {})) {
      if (getInventoryCount(this.saveGameState.profile.inventory, itemId) < quantity) {
        return { ok: false, message: `Es fehlen ${quantity}\xD7 ${ITEM_DEFINITIONS[itemId].label}` };
      }
    }
    this.saveGameState.profile.credits -= credits;
    for (const [itemId, quantity] of Object.entries(definition.cost.items ?? {})) {
      removeItem(this.saveGameState.profile.inventory, itemId, quantity);
    }
    this.saveGameState.profile.upgrades.purchased.push(upgradeId);
    this.effectivePlayerStats = computeEffectiveStats(this.saveGameState.profile);
    if (this.activeRunState) {
      this.activeRunState.energy = Math.min(this.activeRunState.energy, this.effectivePlayerStats.maxEnergy);
      this.syncCargoToStats();
      this.saveActiveRun();
    } else {
      saveGame(this.saveGameState);
    }
    return { ok: true, message: `${definition.label} installiert` };
  }
  hasCargo() {
    return this.run.cargo.slots.some((slot) => Boolean(slot.itemId && slot.quantity > 0));
  }
  transferNextCargoItemToShip() {
    for (let slotIndex = 0; slotIndex < this.run.cargo.slots.length; slotIndex += 1) {
      const slot = this.run.cargo.slots[slotIndex];
      if (!slot.itemId || slot.quantity <= 0) continue;
      const itemId = slot.itemId;
      const definition = ITEM_DEFINITIONS[itemId];
      if (!definition || addItem(this.saveGameState.profile.inventory, itemId, 1) !== 1) return void 0;
      slot.quantity -= 1;
      if (slot.quantity <= 0) {
        delete slot.itemId;
        slot.quantity = 0;
      }
      this.saveGameState.profile.credits += definition.value;
      this.saveGameState.profile.stats.creditsEarned += definition.value;
      this.saveActiveRun();
      return { itemId, slotIndex, credits: definition.value };
    }
    return void 0;
  }
  saveActiveRun() {
    if (!this.activeRunState) return;
    this.saveGameState.activeRun = this.activeRunState;
    saveGame(this.saveGameState);
  }
};
function clamp3(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

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
  slotItemIds = [];
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
  getCargoSlotScreenPosition(index) {
    return this.slotItems[index]?.getWorldPosition();
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
    this.slotItemIds.push(void 0);
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
    this.slotItemIds.pop();
    this.slotLabels.pop();
    if (slot) this.hudRoot.removeChild(slot);
  }
  updateHud() {
    const run = this.playerState.getActiveRun();
    const maxEnergy = Math.max(1, this.playerState.stats.maxEnergy);
    const energyPct = clamp4((run?.energy ?? maxEnergy) / maxEnergy, 0, 1);
    this.energyFill.setHorizontalFill(energyPct);
    for (let index = 0; index < this.slots.length; index += 1) {
      const cargo = run?.cargo.slots[index];
      const item = this.slotItems[index];
      const label = this.slotLabels[index];
      const hasItem = Boolean(cargo?.itemId && cargo.quantity > 0);
      item.visible = hasItem;
      item.image.setVisible(hasItem);
      if (cargo?.itemId && cargo.quantity > 0 && this.slotItemIds[index] !== cargo.itemId) {
        item.setAssetId(ITEM_ASSETS[cargo.itemId] ?? "hud-item-rock");
        if (ITEM_ASSETS[cargo.itemId]) item.image.clearTint();
        else item.image.setTint(ITEM_TINTS[cargo.itemId]);
        this.slotItemIds[index] = cargo.itemId;
      } else if (!hasItem) {
        item.image.clearTint();
        this.slotItemIds[index] = void 0;
      }
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
var ITEM_ASSETS = {
  sand: "item-sand",
  clay: "item-clay",
  gravel: "item-gravel",
  stone: "item-stone",
  basalt: "item-basalt",
  copper: "item-copper",
  iron: "item-iron",
  gold: "item-gold",
  diamond: "item-diamond"
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
function clamp4(value, min, max) {
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
    const safePct = clamp5(pct, 0, 1);
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
function clamp5(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// public/scripts/UI/skillTreeLayout.ts
var CONSTELLATION_MAP_WIDTH = 2600;
var CONSTELLATION_MAP_HEIGHT = 1800;
var CONSTELLATION_ROOT = {
  x: CONSTELLATION_MAP_WIDTH / 2,
  y: CONSTELLATION_MAP_HEIGHT / 2
};
var CONSTELLATION_BRANCH_ANGLES = {
  movement: -2.55,
  vision: -0.95,
  mining: 0.52,
  utility: 2.15
};
var TIER_SIDE_OFFSETS = [0, -68, 72, -108, 24, 116, -62, 128, -118, 58, 4, -84, 88];
function getConstellationNodePosition(branch, tier) {
  if (tier < 1 || tier > TIER_SIDE_OFFSETS.length) throw new Error(`Invalid constellation tier: ${tier}`);
  const angle = CONSTELLATION_BRANCH_ANGLES[branch];
  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  const perpendicularX = -directionY;
  const perpendicularY = directionX;
  const radius = 180 + tier * 56;
  const sideOffset = TIER_SIDE_OFFSETS[tier - 1];
  const clusterOffset = tier % 3 === 0 ? 0 : Math.sin(tier * 1.7) * 24;
  return {
    x: CONSTELLATION_ROOT.x + directionX * radius + perpendicularX * (sideOffset + clusterOffset),
    y: CONSTELLATION_ROOT.y + directionY * radius + perpendicularY * (sideOffset + clusterOffset)
  };
}
function getConstellationRegionPosition(branch) {
  const angle = CONSTELLATION_BRANCH_ANGLES[branch];
  const radius = 780;
  return {
    x: CONSTELLATION_ROOT.x + Math.cos(angle) * radius,
    y: CONSTELLATION_ROOT.y + Math.sin(angle) * radius
  };
}

// public/scripts/UI/UpgradeDialogScript.node.ts
var BRANCH_ORDER = ["movement", "vision", "mining", "utility"];
var BRANCH_META = {
  movement: { label: "MOBILIT\xC4T", color: "#4ade80" },
  vision: { label: "SCANNER", color: "#38bdf8" },
  mining: { label: "MINING", color: "#f472b6" },
  utility: { label: "UTILITY", color: "#c084fc" }
};
var MAP_WIDTH = CONSTELLATION_MAP_WIDTH;
var MAP_HEIGHT = CONSTELLATION_MAP_HEIGHT;
var ROOT_POSITION = CONSTELLATION_ROOT;
var CLOSED_INPUT_INSETS = { top: 96, right: 0, bottom: 52, left: 0 };
var INSPECTOR_INPUT_INSETS = { top: 96, right: 430, bottom: 52, left: 0 };
var ResearchScreenScript = class extends ScriptNode {
  id = "dynamic.upgrade-dialog";
  name = "Research Screen";
  playerStateNodeId = prop.nodeRef(null, { label: "Player State" });
  gameplayInputNodeId = prop.nodeRef(null, { label: "Gameplay Input" });
  screenRootNodeId = prop.nodeRef(null, { label: "Screen Root" });
  mapNodeId = prop.nodeRef(null, { label: "Skill Map" });
  creditsTextNodeId = prop.nodeRef(null, { label: "Credits Text" });
  progressTextNodeId = prop.nodeRef(null, { label: "Progress Text" });
  branchProgressTextNodeId = prop.nodeRef(null, { label: "Branch Progress" });
  inspectorRootNodeId = prop.nodeRef(null, { label: "Inspector Root" });
  detailBranchNodeId = prop.nodeRef(null, { label: "Detail Branch" });
  statusTextNodeId = prop.nodeRef(null, { label: "Status Text" });
  detailTitleNodeId = prop.nodeRef(null, { label: "Detail Title" });
  detailDescriptionNodeId = prop.nodeRef(null, { label: "Detail Description" });
  purchaseButtonNodeId = prop.nodeRef(null, { label: "Purchase Button" });
  purchaseLabelNodeId = prop.nodeRef(null, { label: "Purchase Label" });
  zoomInButtonNodeId = prop.nodeRef(null, { label: "Zoom In" });
  zoomOutButtonNodeId = prop.nodeRef(null, { label: "Zoom Out" });
  resetViewButtonNodeId = prop.nodeRef(null, { label: "Reset View" });
  inspectorCloseButtonNodeId = prop.nodeRef(null, { label: "Inspector Close" });
  closeButtonNodeId = prop.nodeRef(null, { label: "Close Screen" });
  playerState;
  gameplayInput;
  screenRoot;
  map;
  creditsText;
  progressText;
  branchProgressText;
  inspectorRoot;
  detailBranch;
  statusText;
  detailTitle;
  detailDescription;
  purchaseButton;
  purchaseLabel;
  selectedUpgradeId;
  keyHandler;
  opened = false;
  resolve() {
    this.playerState = this.resolveNode(this.playerStateNodeId, "PlayerState");
    this.gameplayInput = this.resolveNode(this.gameplayInputNodeId, "GameplayInput");
    this.screenRoot = this.requireNodeRef(this.screenRootNodeId, "Research screen");
    this.map = this.requireNodeRef(this.mapNodeId, "Skill map");
    this.creditsText = this.requireNodeRef(this.creditsTextNodeId, "Credits text");
    this.progressText = this.requireNodeRef(this.progressTextNodeId, "Progress text");
    this.branchProgressText = this.requireNodeRef(this.branchProgressTextNodeId, "Branch progress");
    this.inspectorRoot = this.requireNodeRef(this.inspectorRootNodeId, "Skill inspector");
    this.detailBranch = this.requireNodeRef(this.detailBranchNodeId, "Detail branch");
    this.statusText = this.requireNodeRef(this.statusTextNodeId, "Status text");
    this.detailTitle = this.requireNodeRef(this.detailTitleNodeId, "Detail title");
    this.detailDescription = this.requireNodeRef(this.detailDescriptionNodeId, "Detail description");
    this.purchaseButton = this.requireNodeRef(this.purchaseButtonNodeId, "Purchase button");
    this.purchaseLabel = this.requireNodeRef(this.purchaseLabelNodeId, "Purchase label");
    this.map.setSelectCallback((nodeId) => this.selectUpgrade(nodeId));
    this.purchaseButton.setClickAction?.(() => this.purchaseSelected());
    this.requireNodeRef(this.zoomInButtonNodeId, "Zoom in").setClickAction?.(() => this.map.zoomBy(1.2));
    this.requireNodeRef(this.zoomOutButtonNodeId, "Zoom out").setClickAction?.(() => this.map.zoomBy(0.82));
    this.requireNodeRef(this.resetViewButtonNodeId, "Reset view").setClickAction?.(() => this.map.resetView());
    this.requireNodeRef(this.inspectorCloseButtonNodeId, "Inspector close").setClickAction?.(() => this.clearSelection());
    this.requireNodeRef(this.closeButtonNodeId, "Close screen").setClickAction?.(() => this.close());
    this.keyHandler = (event) => {
      if (!this.isOpen()) return;
      if (event.key === "Escape") {
        if (this.selectedUpgradeId) this.clearSelection();
        else this.close();
      }
      if (event.key === "Enter") this.purchaseSelected();
      if (event.key === "+" || event.key === "=") this.map.zoomBy(1.2);
      if (event.key === "-" || event.key === "_") this.map.zoomBy(0.82);
      if (event.key === "0") this.map.resetView();
    };
    window.addEventListener("keydown", this.keyHandler);
    this.close();
  }
  destroy() {
    this.map?.setSelectCallback();
    this.purchaseButton?.setClickAction?.();
    if (this.keyHandler) window.removeEventListener("keydown", this.keyHandler);
    this.keyHandler = void 0;
    this.gameplayInput?.setMenuOpen(false);
  }
  open() {
    this.opened = true;
    this.screenRoot.applySceneProps({ active: true });
    this.setSubtreeVisible(this.screenRoot, true);
    this.setSubtreeVisible(this.inspectorRoot, false);
    this.inspectorRoot.applySceneProps({ active: false });
    this.gameplayInput?.setMenuOpen(true);
    this.selectedUpgradeId = void 0;
    this.map.setSelectedNode();
    this.map.setInputInsets(CLOSED_INPUT_INSETS);
    this.updateGraph();
    this.map.resetView();
  }
  close() {
    this.opened = false;
    if (this.screenRoot) {
      this.setSubtreeVisible(this.screenRoot, false);
      this.screenRoot.applySceneProps({ active: false });
    }
    this.gameplayInput?.setMenuOpen(false);
  }
  isOpen() {
    return this.opened;
  }
  selectUpgrade(upgradeId) {
    if (!upgradeId || !UPGRADE_DEFINITIONS[upgradeId]) return;
    this.selectedUpgradeId = upgradeId;
    this.map.setSelectedNode(upgradeId);
    this.map.setInputInsets(INSPECTOR_INPUT_INSETS);
    this.inspectorRoot.applySceneProps({ active: true });
    this.setSubtreeVisible(this.inspectorRoot, true);
    this.updateSelection();
  }
  clearSelection() {
    this.selectedUpgradeId = void 0;
    this.map.setSelectedNode();
    this.map.setInputInsets(CLOSED_INPUT_INSETS);
    this.setSubtreeVisible(this.inspectorRoot, false);
    this.inspectorRoot.applySceneProps({ active: false });
  }
  purchaseSelected() {
    const upgradeId = this.selectedUpgradeId;
    if (!upgradeId || this.getSkillState(upgradeId) !== "available") return;
    const result = this.playerState.purchaseUpgrade(upgradeId);
    this.statusText.setText(result.message.toUpperCase());
    this.updateGraph();
    this.updateSelection();
  }
  updateGraph() {
    const purchasedCount = SKILL_TREE_IDS.filter((id) => this.playerState.isUpgradePurchased(id)).length;
    this.creditsText.setText(`${this.playerState.getProfileCredits().toLocaleString("de-DE")} C`);
    this.progressText.setText(`${purchasedCount} / ${SKILL_TREE_IDS.length} AKTIV`);
    this.branchProgressText.setText(BRANCH_ORDER.map((branch) => {
      const purchased = SKILL_TREE_BRANCHES[branch].filter((id) => this.playerState.isUpgradePurchased(id)).length;
      return `${BRANCH_META[branch].label} ${purchased}/13`;
    }).join("   \xB7   "));
    const nodes = [{
      id: "prospector_core",
      label: UPGRADE_DEFINITIONS.prospector_core.label,
      branch: "core",
      color: "#facc15",
      tier: 0,
      x: ROOT_POSITION.x,
      y: ROOT_POSITION.y,
      state: this.getSkillState("prospector_core"),
      milestone: true
    }];
    const edges = [];
    const regions = [];
    for (const branch of BRANCH_ORDER) {
      const meta = BRANCH_META[branch];
      const ids = SKILL_TREE_BRANCHES[branch];
      ids.forEach((id, index) => {
        const tier = index + 1;
        const position = getConstellationNodePosition(branch, tier);
        nodes.push({
          id,
          label: UPGRADE_DEFINITIONS[id].label,
          branch,
          color: meta.color,
          tier,
          x: position.x,
          y: position.y,
          state: this.getSkillState(id),
          milestone: tier % 3 === 0 || tier === 13
        });
        const previous = index === 0 ? "prospector_core" : ids[index - 1];
        edges.push({
          from: previous,
          to: id,
          color: meta.color,
          active: this.playerState.isUpgradePurchased(previous)
        });
      });
      const regionPosition = getConstellationRegionPosition(branch);
      regions.push({
        label: meta.label,
        color: meta.color,
        x: regionPosition.x,
        y: regionPosition.y
      });
    }
    this.map.setGraph({ width: MAP_WIDTH, height: MAP_HEIGHT, rootId: "prospector_core", nodes, edges, regions });
    this.map.setSelectedNode(this.selectedUpgradeId);
  }
  updateSelection() {
    const upgradeId = this.selectedUpgradeId;
    if (!upgradeId) return;
    const definition = UPGRADE_DEFINITIONS[upgradeId];
    const state = this.getSkillState(upgradeId);
    const branch = upgradeId === "prospector_core" ? void 0 : this.getBranch(upgradeId);
    const tier = this.getTier(upgradeId);
    this.detailBranch.setText(branch ? `${BRANCH_META[branch].label}  \xB7  TIER ${tier}` : "ZENTRALER KERNSTERN");
    this.detailTitle.setText(this.wrapText(definition.label.toUpperCase(), 22).split("\n").slice(0, 2).join("\n"));
    this.detailDescription.setText(this.wrapText(definition.description ?? definition.label, 34));
    this.statusText.setText(this.getStatusText(definition, state));
    this.purchaseLabel.setText(this.getPurchaseLabel(definition, state));
    this.purchaseButton.enabled = state === "available";
  }
  getSkillState(upgradeId) {
    if (this.playerState.isUpgradePurchased(upgradeId)) return "purchased";
    const definition = UPGRADE_DEFINITIONS[upgradeId];
    if (!(definition.prerequisites ?? []).every((id) => this.playerState.isUpgradePurchased(id))) return "locked";
    return this.playerState.getProfileCredits() >= (definition.cost.credits ?? 0) ? "available" : "unaffordable";
  }
  getStatusText(definition, state) {
    if (state === "purchased") return "AKTIVIERT\nEFFEKT IST INSTALLIERT";
    if (state === "available") return "VERBINDUNG STEHT\nBEREIT ZUR AKTIVIERUNG";
    if (state === "unaffordable") {
      const missing = Math.max(0, (definition.cost.credits ?? 0) - this.playerState.getProfileCredits());
      return `NOCH ${missing.toLocaleString("de-DE")} CREDITS
BEN\xD6TIGT`;
    }
    const prerequisite = definition.prerequisites?.[0];
    return prerequisite ? `BEN\xD6TIGT
${UPGRADE_DEFINITIONS[prerequisite].label.toUpperCase()}` : "NOCH NICHT VERBUNDEN";
  }
  getPurchaseLabel(definition, state) {
    if (state === "purchased") return "AKTIVIERT";
    if (state === "locked") return "NICHT VERBUNDEN";
    if (state === "unaffordable") return `${definition.cost.credits ?? 0} C \xB7 ZU TEUER`;
    return `AKTIVIEREN \xB7 ${definition.cost.credits ?? 0} C`;
  }
  getBranch(upgradeId) {
    return BRANCH_ORDER.find((branch) => SKILL_TREE_BRANCHES[branch].includes(upgradeId));
  }
  getTier(upgradeId) {
    if (upgradeId === "prospector_core") return 0;
    for (const branch of BRANCH_ORDER) {
      const index = SKILL_TREE_BRANCHES[branch].indexOf(upgradeId);
      if (index >= 0) return index + 1;
    }
    return 0;
  }
  wrapText(text, maxLineLength) {
    const words = text.split(/\s+/);
    const lines = [];
    let line = "";
    for (const word of words) {
      if (line && `${line} ${word}`.length > maxLineLength) {
        lines.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(line);
    return lines.slice(0, 6).join("\n");
  }
  setSubtreeVisible(root, visible) {
    const visit = (node) => {
      if ("visible" in node) node.applySceneProps({ visible });
      node.getSceneObjectsInHierarchy().forEach((object) => {
        object.setVisible?.(visible);
      });
      node.children.forEach(visit);
    };
    visit(root);
  }
  resolveNode(nodeId, fallbackName) {
    const node = nodeId ? this.getNodeById(nodeId) : this.getNode(fallbackName);
    if (!node) throw new Error(`Required node '${fallbackName}' was not resolved`);
    return node;
  }
  requireNodeRef(nodeId, label) {
    if (!nodeId) throw new Error(`${label} node is not configured`);
    const node = this.getNodeById(nodeId);
    if (!node) throw new Error(`${label} node was not resolved`);
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
  createDynamicNodeModule(StatusHudScript, "UI-StatusHudScript"),
  createDynamicNodeModule(ResearchScreenScript, "UI-UpgradeDialogScript")
];
var dynamic_nodes_entry_default = { modules };
export {
  dynamic_nodes_entry_default as default,
  modules
};
//# sourceMappingURL=dynamic-nodes.276d7141e676.js.map
