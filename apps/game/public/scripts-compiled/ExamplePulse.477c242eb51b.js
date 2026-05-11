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

// node_modules/.script-build/ExamplePulse.entry.ts
var probe = new ExamplePulseNode();
var nodeTypeId = typeof probe.id === "string" && probe.id.length > 0 ? probe.id : "ExamplePulse";
var displayName = typeof probe.name === "string" && probe.name.length > 0 ? probe.name : nodeTypeId;
function createBehavior() {
  return new ExamplePulseNode();
}
var ExamplePulse_entry_default = { nodeTypeId, displayName, createBehavior };
export {
  createBehavior,
  ExamplePulse_entry_default as default,
  displayName,
  nodeTypeId
};
//# sourceMappingURL=ExamplePulse.477c242eb51b.js.map
