export const CORE_NODE_TYPE_IDS = {
  GameNode: 'f15abda6-f2fb-5dbb-82a6-77bba7759c1d',
  TransformNode: 'b78a74e0-452a-5e20-85f4-579f7c0b1364',
  NodeRoot: '2abb380b-5541-5ff0-817c-51ca40302dc3',
  SceneNode: 'b98beda2-6b49-5cc8-85b1-28b3b19eaae4',
  ImageNode: '73e926f5-c280-5131-b820-a89f898e2d48',
  TextNode: '2db287f7-b55c-5c58-be87-c057e8c5d302',
  AnimatedImageNode: '5a0cd663-64c3-5f02-a579-9915605564be',
  CollisionRectNode: 'f3f82d6c-c31e-56bc-afd6-b5892604eaf5',
  ButtonNode: 'addc5b95-e208-503a-9474-4408cee67995',
} as const;

export type CoreNodeTypeName = keyof typeof CORE_NODE_TYPE_IDS;
