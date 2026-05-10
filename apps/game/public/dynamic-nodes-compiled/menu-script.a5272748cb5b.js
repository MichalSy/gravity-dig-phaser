// dynamic-node-api:dynamic-node-api
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
  assetId: (value, options = {}) => marker(value, { type: "AssetId", ...options })
};

// public/dynamic-nodes/menu-script.node.ts
function wrapIndex(value, length) {
  return (value % length + length) % length;
}
var MenuScript = class extends ScriptNode {
  id = "dynamic.menu-script";
  name = "Menu Script";
  versionNodeName = prop.string("Menu.Version", { label: "Version Text Node" });
  buttonNames = prop.string("Menu.PlayButton,Menu.OptionsButton", { label: "Button Nodes" });
  startAction = prop.string("start", { label: "Start Button Action" });
  startEvent = prop.string("game:start", { label: "Start Event" });
  buttons = [];
  activeIndex = 0;
  keyHandler;
  init() {
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
    const versionNode = this.getNodesByName(this.versionNodeName)[0];
    versionNode?.setText?.(`v${this.getAppVersion()}`);
  }
  bindButtons() {
    this.buttons = this.buttonNames.split(",").map((name) => name.trim()).filter(Boolean).flatMap((name) => this.getNodesByName(name));
    this.buttons.forEach((button) => button.setCallbacks?.({
      onHover: (hovered) => this.setActiveIndex(this.buttons.indexOf(hovered)),
      onActivate: (activated) => this.activateButton(activated)
    }));
    this.syncButtonSelection();
  }
  bindKeyboard() {
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
    if (button) this.activateButton(button);
  }
  activateButton(button) {
    if (button.enabled === false) return;
    if (button.action === this.startAction) {
      this.emit(this.startEvent);
      return;
    }
    button.flash?.();
  }
};

// node_modules/.dynamic-node-build/menu-script.entry.ts
var probe = new MenuScript();
var nodeTypeId = typeof probe.id === "string" && probe.id.length > 0 ? probe.id : "menu-script";
var displayName = typeof probe.name === "string" && probe.name.length > 0 ? probe.name : nodeTypeId;
function createBehavior() {
  return new MenuScript();
}
var menu_script_entry_default = { nodeTypeId, displayName, createBehavior };
export {
  createBehavior,
  menu_script_entry_default as default,
  displayName,
  nodeTypeId
};
//# sourceMappingURL=menu-script.a5272748cb5b.js.map
