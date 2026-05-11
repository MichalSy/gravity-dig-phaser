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

export type DebugScenePropRecordType = 'String' | 'Number' | 'Boolean' | 'Position' | 'Size' | 'Origin' | 'Scale' | 'Anchor' | 'AssetId';

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
  editor: 'text' | 'number' | 'checkbox' | 'xy' | 'size' | 'anchor-grid' | 'asset-picker';
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

export type DebugScenePropValue = string | number | boolean | null | { x: number; y: number } | { width: number; height: number };

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

export interface DebugNodeCreateMessage {
  type: 'node:create';
  sessionId: string;
  requestId: string;
  parentNodeId: string;
  index?: number;
  definition: {
    nodeTypeId: string;
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

export interface DebugDynamicNodeUpdatedMessage {
  type: 'dynamic-node:updated';
  sessionId: string;
  requestId: string;
  module: DebugDynamicNodeModuleReference;
  sentAt: number;
}

export interface DebugDynamicNodeUpdateAckMessage {
  type: 'dynamic-node:update:ack';
  sessionId: string;
  requestId: string;
  module: DebugDynamicNodeModuleReference;
  applied: boolean;
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
  props: Record<string, string | number | boolean | null>;
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

export interface DebugAssetListMessage {
  type: 'asset:list';
  sessionId: string;
  images: DebugImageAssetDescriptor[];
  animations: DebugImageAnimationDescriptor[];
  sentAt: number;
}

export interface EditorChangeTarget {
  /** Stable authoring path by node names, e.g. ['UI.Gameplay', 'UI.BottomHud', 'UI.ActionFrame']. */
  nodePath: string[];
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
    name?: string;
    props?: Record<string, unknown>;
    children?: unknown[];
  };
  createdAt: number;
}

export type EditorChange = EditorSetPropsChange | EditorMoveNodeChange | EditorAddNodeChange;

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
  | DebugDynamicNodeUpdatedMessage
  | DebugDynamicNodeUpdateAckMessage
  | DebugNodeDeleteMessage
  | DebugNodeDeleteAckMessage
  | DebugNodeMoveMessage
  | DebugNodeMoveAckMessage
  | DebugAssetListMessage;
