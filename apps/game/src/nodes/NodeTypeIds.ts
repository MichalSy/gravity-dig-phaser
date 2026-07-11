import { CORE_NODE_TYPE_IDS } from '@gravity-dig/game-core';

export const NODE_TYPE_IDS = {
  ...CORE_NODE_TYPE_IDS,
  GameplayInputNode: 'c981faaa-6359-537c-ad47-d1605cde3381',
  LevelGeneratorManagerNode: 'f4b370e7-bd23-556e-bf1e-3f959ae224da',
  PlayerStateManagerNode: 'fe16c9f8-414b-51dd-bd4f-9cb56ff9eb03',
  DebugBridgeNode: 'a37ed60d-ad17-5124-a8b4-d7b0dc4c8b08',
  LevelNode: '2ed70856-b481-58e1-a75c-db6e48d2fcdd',
  GameWorldNode: 'dc19f5fb-ea06-5aab-bd74-2178d2882bf1',
  PlayerNode: '5eed5534-1ab9-52de-a092-be4f7dab9549',
  PlayerMovementControllerNode: '2b93fbc2-3345-57ce-a9e9-dbe5a107fd7a',
  PlayerAnimatorNode: 'dbfe2289-a994-52dd-88f8-1b680fc914f6',
  MiningLaserNode: 'af263543-8259-4627-8876-247a1ae87d9a',
  InputModeDetectorNode: '993ead47-0d83-553f-a782-6bc1d2506851',
  GameRootNode: '297cb39e-5ac2-51ea-a2c4-6f16fa58de77',
  UIRootNode: 'd4b58fdf-c38b-535a-8d9b-f57d36634db0',
  TouchControlsNode: 'a690aad8-ce49-5365-9c2d-0d636d5dcb77',
} as const;

export type NodeTypeName = keyof typeof NODE_TYPE_IDS;
