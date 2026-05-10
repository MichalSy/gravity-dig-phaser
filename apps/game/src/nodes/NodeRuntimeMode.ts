export const NodeRuntimeMode = {
  Editor: 'editor',
  Play: 'play',
} as const;

export type NodeRuntimeMode = (typeof NodeRuntimeMode)[keyof typeof NodeRuntimeMode];
