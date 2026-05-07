import type { DebugNodeDelta, DebugNodeDescriptor } from '@gravity-dig/debug-protocol';
import type { GameNode, NodeRuntime } from '../nodes';

interface FlatNodeSnapshot {
  id: string;
  instanceId?: string;
  parentId?: string;
  name: string;
  className: string;
  active: boolean;
  effectiveActive: boolean;
  visible: boolean;
  index: number;
  descriptor: DebugNodeDescriptor;
}

export interface DebugNodeTreeSnapshot {
  roots: DebugNodeDescriptor[];
  flatNodes: Map<string, FlatNodeSnapshot>;
}

export function captureDebugNodeTree(
  runtime: NodeRuntime,
  getNodeId: (node: GameNode) => string,
  ignoredNode?: GameNode,
): DebugNodeTreeSnapshot {
  const flatNodes = new Map<string, FlatNodeSnapshot>();
  const roots = [...runtime.persistentNodes, ...runtime.roots]
    .filter((node) => node !== ignoredNode)
    .map((node, index) => serializeNode(node, undefined, index, flatNodes, getNodeId));

  return { roots, flatNodes };
}

export function diffDebugNodeTrees(previous: DebugNodeTreeSnapshot, next: DebugNodeTreeSnapshot): DebugNodeDelta[] {
  const deltas: DebugNodeDelta[] = [];

  for (const [id, previousNode] of previous.flatNodes) {
    if (!next.flatNodes.has(id)) deltas.push({ kind: 'removed', id, parentId: previousNode.parentId, index: previousNode.index });
  }

  for (const [id, nextNode] of next.flatNodes) {
    const previousNode = previous.flatNodes.get(id);
    if (!previousNode) {
      deltas.push({ kind: 'added', id, parentId: nextNode.parentId, index: nextNode.index, node: nextNode.descriptor });
      continue;
    }

    if (previousNode.parentId !== nextNode.parentId || previousNode.index !== nextNode.index) {
      deltas.push({
        kind: 'moved',
        id,
        parentId: nextNode.parentId,
        index: nextNode.index,
        previousParentId: previousNode.parentId,
        previousIndex: previousNode.index,
      });
    }

    if (previousNode.active !== nextNode.active || previousNode.effectiveActive !== nextNode.effectiveActive || previousNode.visible !== nextNode.visible) {
      deltas.push({
        kind: 'updated',
        id,
        parentId: nextNode.parentId,
        index: nextNode.index,
        active: nextNode.active,
        visible: nextNode.visible,
        node: nextNode.descriptor,
      });
    }
  }

  return deltas;
}

function serializeNode(
  node: GameNode,
  parentId: string | undefined,
  index: number,
  flatNodes: Map<string, FlatNodeSnapshot>,
  getNodeId: (node: GameNode) => string,
): DebugNodeDescriptor {
  const id = getNodeId(node);
  const descriptor: DebugNodeDescriptor = {
    id,
    instanceId: node.instanceId,
    parentId,
    name: node.debugName(),
    className: node.debugClassName(),
    active: node.active,
    effectiveActive: node.isEffectivelyActive(),
    visible: node.isDebugVisible(),
    index,
    children: node.children.map((child, childIndex) => serializeNode(child, id, childIndex, flatNodes, getNodeId)),
  };

  flatNodes.set(id, {
    id,
    instanceId: descriptor.instanceId,
    parentId,
    name: descriptor.name,
    className: descriptor.className,
    active: descriptor.active,
    effectiveActive: descriptor.effectiveActive ?? descriptor.active,
    visible: descriptor.visible,
    index: descriptor.index,
    descriptor,
  });

  return descriptor;
}

