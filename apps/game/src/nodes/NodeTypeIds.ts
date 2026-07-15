import { CORE_NODE_TYPE_IDS } from '@gravity-dig/game-core';

export const NODE_TYPE_IDS = {
  ...CORE_NODE_TYPE_IDS,
  InputDeviceNode: 'c981faaa-6359-537c-ad47-d1605cde3381',
  DebugBridgeNode: 'a37ed60d-ad17-5124-a8b4-d7b0dc4c8b08',
  LevelNode: '2ed70856-b481-58e1-a75c-db6e48d2fcdd',
  GameWorldNode: 'dc19f5fb-ea06-5aab-bd74-2178d2882bf1',
  LootLayerNode: 'f60ec709-ef57-5eb1-866b-c82240481880',
  VisibilityFieldNode: '4ec43079-472d-575f-9d1b-51cc01712f15',
  InputModeDetectorNode: '993ead47-0d83-553f-a782-6bc1d2506851',
  GameRootNode: '297cb39e-5ac2-51ea-a2c4-6f16fa58de77',
  UIRootNode: 'd4b58fdf-c38b-535a-8d9b-f57d36634db0',
  TouchControlsNode: 'a690aad8-ce49-5365-9c2d-0d636d5dcb77',
} as const;

export type NodeTypeName = keyof typeof NODE_TYPE_IDS;
