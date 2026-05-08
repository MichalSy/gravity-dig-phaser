// dynamic-node-api:dynamic-node-api
var ScriptNode = class {
  log(message, ...values) {
    this.__dynamicNodeContext?.log(message, ...values);
  }
  getNode(name) {
    return this.__dynamicNodeContext?.getNode(name);
  }
  requireNode(name) {
    const node = this.__dynamicNodeContext?.requireNode(name);
    if (!node) throw new Error("Dynamic node context is not initialized");
    return node;
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

// dynamic-nodes/src/example-pulse.node.ts
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

// node_modules/.dynamic-node-build/example-pulse.entry.ts
var probe = new ExamplePulseNode();
var nodeTypeId = typeof probe.id === "string" && probe.id.length > 0 ? probe.id : "example-pulse";
var displayName = typeof probe.name === "string" && probe.name.length > 0 ? probe.name : nodeTypeId;
function createBehavior() {
  return new ExamplePulseNode();
}
var example_pulse_entry_default = { nodeTypeId, displayName, createBehavior };
export {
  createBehavior,
  example_pulse_entry_default as default,
  displayName,
  nodeTypeId
};
//# sourceMappingURL=example-pulse.b604e0f24e6a.js.map
