export type DebugClientRole = 'game' | 'editor';

export interface DebugHelloMessage {
  type: 'hello';
  role: DebugClientRole;
  sessionId: string;
  clientId?: string;
}

export interface DebugPingMessage {
  type: 'ping';
  sentAt: number;
}

export interface DebugPongMessage {
  type: 'pong';
  sentAt: number;
  receivedAt: number;
}

export interface DebugTextMessage {
  type: 'text';
  from: DebugClientRole;
  sessionId: string;
  text: string;
  sentAt: number;
}

export type DebugScenePropRecordType = 'String' | 'Number' | 'Boolean' | 'Position' | 'Size' | 'Origin' | 'Scale' | 'Anchor' | 'AssetId' | 'FontId' | 'Color' | 'NodeRef' | 'NodeRefList';

export interface DebugSceneNumberConstraints {
  min?: number;
  max?: number;
  step?: number;
}

export interface DebugScenePropDefinition extends DebugSceneNumberConstraints {
  type: DebugScenePropRecordType;
  label?: string;
  readOnly?: boolean;
  reason?: string;
  options?: readonly string[];
}

export interface DebugScenePropRecordDefinition {
  type: DebugScenePropRecordType;
  label: string;
  editor: 'text' | 'number' | 'checkbox' | 'xy' | 'size' | 'anchor-grid' | 'asset-picker' | 'font-picker' | 'color-picker' | 'node-ref' | 'node-ref-list';
  fields?: Record<string, DebugScenePropDefinition>;
  options?: readonly string[];
}

export interface DebugScenePropGroup {
  name: string;
  props: Record<string, DebugScenePropDefinition>;
}

export interface DebugOverlayLayerDescriptor {
  id: string;
  label: string;
  source: string;
}

export interface DebugSceneNodeDefinition {
  instanceId: string;
  name: string;
  typeName: string;
  exposedPropGroups: DebugScenePropGroup[];
  overlayLayers: DebugOverlayLayerDescriptor[];
}

export interface DebugNodeDefinitionsMessage {
  type: 'node:definitions';
  sessionId: string;
  records: Record<string, DebugScenePropRecordDefinition>;
  nodes: DebugSceneNodeDefinition[];
  sentAt: number;
}

export type DebugScenePropValue = string | number | boolean | null | string[] | { x: number; y: number } | { width: number; height: number };

export type DebugNodePatch = Record<string, DebugScenePropValue>;

export interface DebugNodePatchMessage {
  type: 'node:patch';
  sessionId: string;
  nodeId?: string;
  instanceId?: string;
  name?: string;
  props: DebugNodePatch;
  previousProps?: DebugNodePatch;
  sentAt: number;
}

export interface DebugDynamicNodeModuleReference {
  nodeTypeId: string;
  source: string;
  url?: string;
  hash: string;
}

export interface DebugDynamicNodeBundleReference {
  url: string;
  hash: string;
  nodeTypeIds: string[];
}

export interface DebugNodeCreateMessage {
  type: 'node:create';
  sessionId: string;
  requestId: string;
  parentNodeId: string;
  index?: number;
  definition: {
    nodeTypeId: string;
    instanceId?: string;
    name?: string;
    props?: Record<string, unknown>;
    children?: unknown[];
  };
  module?: DebugDynamicNodeModuleReference;
  sentAt: number;
}

export interface DebugNodeCreateAckMessage {
  type: 'node:create:ack';
  sessionId: string;
  requestId: string;
  parentNodeId: string;
  nodeId?: string;
  instanceId?: string;
  name?: string;
  applied: boolean;
  rejected?: string;
  sentAt: number;
}

export interface DebugDynamicNodeModuleRequestMessage {
  type: 'dynamic-node:module-request';
  sessionId: string;
  requestId: string;
  module: DebugDynamicNodeModuleReference;
  sentAt: number;
}

export interface DebugDynamicNodeModuleResponseMessage {
  type: 'dynamic-node:module-response';
  sessionId: string;
  requestId: string;
  module: DebugDynamicNodeModuleReference;
  code: string;
  sentAt: number;
}

export interface DebugDynamicNodeModuleErrorMessage {
  type: 'dynamic-node:module-error';
  sessionId: string;
  requestId: string;
  module: DebugDynamicNodeModuleReference;
  error: string;
  sentAt: number;
}

export interface DebugDynamicNodeBundleUpdatedMessage {
  type: 'dynamic-node:bundle-updated';
  sessionId: string;
  requestId: string;
  bundle: DebugDynamicNodeBundleReference;
  code: string;
  sentAt: number;
}

export interface DebugDynamicNodeBundleUpdateAckMessage {
  type: 'dynamic-node:bundle-update:ack';
  sessionId: string;
  requestId: string;
  bundle: DebugDynamicNodeBundleReference;
  applied: boolean;
  modules: number;
  reloaded: number;
  rejected?: string;
  sentAt: number;
}

export interface DebugNodeDeleteMessage {
  type: 'node:delete';
  sessionId: string;
  requestId: string;
  nodeId: string;
  instanceId?: string;
  sentAt: number;
}

export interface DebugNodeDeleteAckMessage {
  type: 'node:delete:ack';
  sessionId: string;
  requestId: string;
  nodeId: string;
  instanceId?: string;
  name?: string;
  applied: boolean;
  rejected?: string;
  sentAt: number;
}

export type DebugNodeMovePlacement = 'before' | 'after' | 'child';

export interface DebugNodeMoveMessage {
  type: 'node:move';
  sessionId: string;
  requestId: string;
  nodeId: string;
  targetNodeId: string;
  placement: DebugNodeMovePlacement;
  sentAt: number;
}

export interface DebugNodeMoveAckMessage {
  type: 'node:move:ack';
  sessionId: string;
  requestId: string;
  nodeId: string;
  targetNodeId: string;
  placement: DebugNodeMovePlacement;
  applied: boolean;
  rejected?: string;
  sentAt: number;
}

export interface DebugNodePatchAckMessage {
  type: 'node:patch:ack';
  sessionId: string;
  nodeId?: string;
  instanceId?: string;
  name?: string;
  applied: DebugNodePatch;
  rejected: Record<string, string>;
  sentAt: number;
}

export interface DebugNodeDescriptor {
  id: string;
  instanceId?: string;
  parentId?: string;
  nodeTypeId?: string;
  name: string;
  className: string;
  active: boolean;
  effectiveActive?: boolean;
  visible: boolean;
  editorLocked?: boolean;
  defaultCollapsed?: boolean;
  ownedRole?: string;
  creationOrigin?: 'scene' | 'runtime-code' | 'runtime-script';
  runtimeRoot?: boolean;
  managerPath?: string;
  prefabPath?: string;
  prefabId?: string;
  prefabNodePath?: string[];
  prefabNodeId?: string;
  prefabOverrideProps?: string[];
  createdByInstanceId?: string;
  index: number;
  children: DebugNodeDescriptor[];
}

export interface DebugNodeTreeMessage {
  type: 'node:tree';
  sessionId: string;
  roots: DebugNodeDescriptor[];
  sentAt: number;
}

export type DebugNodeDeltaKind = 'added' | 'removed' | 'moved' | 'updated';

export interface DebugNodeDelta {
  kind: DebugNodeDeltaKind;
  id: string;
  parentId?: string;
  index?: number;
  node?: DebugNodeDescriptor;
  previousParentId?: string;
  previousIndex?: number;
  active?: boolean;
  visible?: boolean;
}

export interface DebugNodeDeltaMessage {
  type: 'node:delta';
  sessionId: string;
  deltas: DebugNodeDelta[];
  sentAt: number;
}

export interface DebugNodeSelectMessage {
  type: 'node:select';
  sessionId: string;
  nodeId?: string;
  sentAt: number;
}

export interface DebugOverlaySettingsMessage {
  type: 'debug:overlay-settings';
  sessionId: string;
  nodeId?: string;
  enabledLayerIds?: string[];
  sentAt: number;
}

export interface DebugNodePoint {
  x: number;
  y: number;
}

export interface DebugNodeTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  originX: number;
  originY: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export interface DebugNodeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  scrollFactor?: number;
  corners?: [DebugNodePoint, DebugNodePoint, DebugNodePoint, DebugNodePoint];
}

export interface DebugNodePropsMessage {
  type: 'node:props';
  sessionId: string;
  nodeId: string;
  instanceId?: string;
  bounds?: DebugNodeBounds;
  localTransform?: DebugNodeTransform;
  worldTransform?: DebugNodeTransform;
  worldBounds?: DebugNodeBounds;
  props: Record<string, string | number | boolean | null | string[]>;
  sentAt: number;
}

export interface DebugAssetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DebugImageAssetDescriptor {
  id: string;
  kind: 'image' | 'frame';
  textureKey: string;
  url?: string;
  width: number;
  height: number;
  frameKey?: string;
  sourceImageId?: string;
  sourceUrl?: string;
  rect?: DebugAssetRect;
}

export interface DebugImageAnimationDescriptor {
  id: string;
  kind: 'animation';
  frameIds: string[];
  fps: number;
  loop: boolean;
}

export interface DebugFontAssetDescriptor {
  id: string;
  family: string;
  label?: string;
  path?: string;
  weight?: string;
  style?: string;
}

export interface DebugAssetListMessage {
  type: 'asset:list';
  sessionId: string;
  images: DebugImageAssetDescriptor[];
  animations: DebugImageAnimationDescriptor[];
  fonts: DebugFontAssetDescriptor[];
  sentAt: number;
}

export interface EditorChangeTarget {
  /** Stable authoring path by node names, e.g. ['UI.Gameplay', 'UI.BottomHud', 'UI.ActionFrame']. */
  nodePath: string[];
  /** Public manager source for persistent singleton roots. */
  managerPath?: string;
  /** Prefab source and instance metadata used to persist sparse instance overrides. */
  prefabPath?: string;
  prefabId?: string;
  prefabNodePath?: string[];
  prefabNodeId?: string;
  prefabInstancePath?: string[];
}

export interface EditorSetPropsChange {
  id: string;
  kind: 'setProps';
  sessionId: string;
  target: EditorChangeTarget;
  props: DebugNodePatch;
  previousProps?: DebugNodePatch;
  /** Nested field inside the single changed prop, e.g. ['x'] for scale.x. */
  fieldPath?: string[];
  createdAt: number;
}

export interface EditorMoveNodeChange {
  id: string;
  kind: 'moveNode';
  sessionId: string;
  target: EditorChangeTarget;
  destination: EditorChangeTarget & { placement: DebugNodeMovePlacement };
  createdAt: number;
}

export interface EditorAddNodeChange {
  id: string;
  kind: 'addNode';
  sessionId: string;
  target: EditorChangeTarget;
  index?: number;
  node: {
    nodeTypeId: string;
    instanceId?: string;
    name?: string;
    props?: Record<string, unknown>;
    children?: unknown[];
  };
  createdAt: number;
}

export interface EditorDeleteNodeChange {
  id: string;
  kind: 'deleteNode';
  sessionId: string;
  target: EditorChangeTarget;
  createdAt: number;
}

export type EditorChange = EditorSetPropsChange | EditorMoveNodeChange | EditorAddNodeChange | EditorDeleteNodeChange;

export interface EditorChangeSet {
  sessionId: string;
  baseRevision?: string;
  changes: EditorChange[];
  updatedAt?: number;
}

export type DebugMessage =
  | DebugHelloMessage
  | DebugPingMessage
  | DebugPongMessage
  | DebugTextMessage
  | DebugNodeDefinitionsMessage
  | DebugNodeTreeMessage
  | DebugNodeDeltaMessage
  | DebugNodeSelectMessage
  | DebugOverlaySettingsMessage
  | DebugNodePropsMessage
  | DebugNodePatchMessage
  | DebugNodePatchAckMessage
  | DebugNodeCreateMessage
  | DebugNodeCreateAckMessage
  | DebugDynamicNodeModuleRequestMessage
  | DebugDynamicNodeModuleResponseMessage
  | DebugDynamicNodeModuleErrorMessage
  | DebugDynamicNodeBundleUpdatedMessage
  | DebugDynamicNodeBundleUpdateAckMessage
  | DebugNodeDeleteMessage
  | DebugNodeDeleteAckMessage
  | DebugNodeMoveMessage
  | DebugNodeMoveAckMessage
  | DebugAssetListMessage;
