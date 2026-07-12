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
var MiningScript = class extends ScriptNode {
  id = "dynamic.mining-tool";
  name = "Mining Tool Script";
  levelNodeId = prop.nodeRef(null, { label: "Level Node" });
  worldNodeId = prop.nodeRef(null, { label: "World Node" });
  movementScriptNodeId = prop.nodeRef(null, { label: "Movement Script Node" });
  playerStateNodeId = prop.nodeRef(null, { label: "Player State Node" });
  inputNodeId = prop.nodeRef(null, { label: "Gameplay Input Node" });
  laserNodeId = prop.nodeRef(null, { label: "Mining Laser Node" });
  laserOriginOffsetY = prop.number(PLAYER_HEIGHT * 0.18, { label: "Laser Origin Offset Y", step: 0.1 });
  levelNode;
  world;
  movementController;
  playerState;
  gameplayInput;
  laser;
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
    this.laser = this.requireResolvedNode(this.laserNodeId, "MiningLaser");
  }
  update(deltaMs) {
    this.updateMining(deltaMs / 1e3);
  }
  destroy() {
    this.stopFiring();
  }
  resetForLevel() {
    this.laser.resetForLevel();
    this.stopFiring();
  }
  stopFiring() {
    this.target = void 0;
    this.miningPressed = false;
    this.playerState?.setMiningActive(false);
    this.laser?.clear();
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
    this.laser.clear();
    if (!target) return;
    this.laser.showTargetAndBeam(target, origin, firing);
    if (!firing || !this.playerState.hasMiningEnergy()) return;
    this.laser.setLaserSound(true);
    this.playerState.consumeMiningEnergy(deltaSeconds);
    target.health -= this.playerState.stats.miningDamagePerSec * deltaSeconds;
    this.laser.updateCrackOverlay(target);
    if (target.health <= 0) this.mineTile(target);
  }
  getUpdatedAimWorld(aimWorld) {
    if (aimWorld) this.currentAimWorld.copy(aimWorld);
    return this.currentAimWorld;
  }
  mineTile(cell) {
    const minedType = cell.type;
    this.levelNode.clearTile(cell);
    this.laser.removeCrackOverlay(cell);
    this.playerState.recordMinedTile(minedType);
    this.laser.playBlockBreakSound(minedType);
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
  slotOriginX = prop.number(362.93, { label: "Slot Origin X", step: 1e-3 });
  slotOriginY = prop.number(21.767, { label: "Slot Origin Y", step: 1e-3 });
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
    const energyPct = clamp((run?.energy ?? maxEnergy) / maxEnergy, 0, 1);
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
function clamp(value, min, max) {
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
    const safePct = clamp2(pct, 0, 1);
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
function clamp2(value, min, max) {
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
  createDynamicNodeModule(PlayerMovementScript, "Gameplay-PlayerMovementScript"),
  createDynamicNodeModule(ShipScript, "Gameplay-ShipScript"),
  createDynamicNodeModule(LoadingScript, "Loading-LoadingScript"),
  createDynamicNodeModule(BottomHudScript, "UI-BottomHudScript"),
  createDynamicNodeModule(StatusHudScript, "UI-StatusHudScript")
];
var dynamic_nodes_entry_default = { modules };
export {
  dynamic_nodes_entry_default as default,
  modules
};
//# sourceMappingURL=dynamic-nodes.5ec720589518.js.map
