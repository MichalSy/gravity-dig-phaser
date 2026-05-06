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

export interface DebugRelayStatusMessage {
  type: 'relay:status';
  sessionId: string;
  games: number;
  editors: number;
}

export type DebugScenePropRecordType = 'String' | 'Number' | 'Boolean' | 'Position' | 'Size' | 'Origin' | 'Anchor' | 'AssetId';

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

export interface DebugSceneNodeDefinition {
  guid: string;
  name: string;
  typeName: string;
  exposedPropGroups: DebugScenePropGroup[];
  /** @deprecated use exposedPropGroups */
  editableProps?: Record<string, DebugScenePropDefinition>;
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
  guid?: string;
  name?: string;
  props: DebugNodePatch;
  sentAt: number;
}

export interface DebugNodePatchAckMessage {
  type: 'node:patch:ack';
  sessionId: string;
  nodeId?: string;
  guid?: string;
  name?: string;
  applied: DebugNodePatch;
  rejected: Record<string, string>;
  sentAt: number;
}

export interface DebugNodeDescriptor {
  id: string;
  guid?: string;
  parentId?: string;
  name: string;
  className: string;
  active: boolean;
  visible: boolean;
  order: number;
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
  order?: number;
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
  guid?: string;
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

export type DebugMessage =
  | DebugHelloMessage
  | DebugPingMessage
  | DebugPongMessage
  | DebugTextMessage
  | DebugRelayStatusMessage
  | DebugNodeDefinitionsMessage
  | DebugNodeTreeMessage
  | DebugNodeDeltaMessage
  | DebugNodeSelectMessage
  | DebugNodePropsMessage
  | DebugNodePatchMessage
  | DebugNodePatchAckMessage
  | DebugAssetListMessage;
