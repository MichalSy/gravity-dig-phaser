import Phaser from 'phaser';
import { NODE_TYPE_IDS, TransformNode, type NodeContext, type TransformNodeOptions } from '../../nodes';

export interface SkillTreeMapHitNode {
  id: string;
  tier: number;
  x: number;
  y: number;
}

export interface SkillTreeMapGraph {
  width: number;
  height: number;
  rootId: string;
  nodes: SkillTreeMapHitNode[];
}

export interface SkillTreeMapInputInsets {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface SkillTreeMapExclusionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type PointerState = {
  local: Phaser.Math.Vector2;
  previous: Phaser.Math.Vector2;
  start: Phaser.Math.Vector2;
  startNodeId?: string;
  moved: boolean;
};

const MIN_ZOOM = 0.32;
const MAX_ZOOM = 1.8;
const DRAG_THRESHOLD = 8;
const NODE_WIDTH = 88;
const NODE_HEIGHT = 88;

/**
 * Engine-facing interaction bridge for the public skill-tree node hierarchy.
 * All visible presentation is owned by ImageNode/RectangleNode/LineNode prefab
 * instances. This node only owns gestures, hit testing, and view conversion.
 */
export class SkillTreeMapNode extends TransformNode {
  static override readonly nodeTypeId = NODE_TYPE_IDS.SkillTreeMapNode;

  private phaserScene?: Phaser.Scene;
  private worldRoot?: TransformNode;
  private graph?: SkillTreeMapGraph;
  private selectCallback?: (nodeId: string | undefined, viewportPosition: { x: number; y: number }) => void;
  private viewChangeCallback?: () => void;
  private inputInsets: Required<SkillTreeMapInputInsets> = { top: 0, right: 0, bottom: 0, left: 0 };
  private inputExclusion?: SkillTreeMapExclusionRect;
  private zoom = 0.55;
  private pan = new Phaser.Math.Vector2();
  private readonly pointerStates = new Map<number, PointerState>();
  private pinchStartDistance = 0;
  private pinchStartZoom = 1;
  private pinchAnchorContent = new Phaser.Math.Vector2();

  constructor(options: TransformNodeOptions = {}) {
    super({ name: 'UI.SkillTreeMap', className: 'SkillTreeMapNode', ...options });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    this.phaserScene.input.addPointer(3);
    this.phaserScene.input.on('pointerdown', this.handlePointerDown, this);
    this.phaserScene.input.on('pointermove', this.handlePointerMove, this);
    this.phaserScene.input.on('pointerup', this.handlePointerUp, this);
    this.phaserScene.input.on('pointerupoutside', this.handlePointerUp, this);
    this.phaserScene.input.on('wheel', this.handleWheel, this);
  }

  setWorldRoot(worldRoot?: TransformNode): void {
    this.worldRoot = worldRoot;
    this.applyViewTransform(false);
  }

  setGraph(graph: SkillTreeMapGraph): void {
    const firstGraph = !this.graph;
    this.graph = graph;
    if (firstGraph) this.resetView();
  }

  setSelectCallback(callback?: (nodeId: string | undefined, viewportPosition: { x: number; y: number }) => void): void {
    this.selectCallback = callback;
  }

  setViewChangeCallback(callback?: () => void): void {
    this.viewChangeCallback = callback;
  }

  setInputInsets(insets: SkillTreeMapInputInsets = {}): void {
    this.inputInsets = {
      top: Math.max(0, insets.top ?? 0),
      right: Math.max(0, insets.right ?? 0),
      bottom: Math.max(0, insets.bottom ?? 0),
      left: Math.max(0, insets.left ?? 0),
    };
    this.pointerStates.clear();
  }

  setInputExclusion(rect?: SkillTreeMapExclusionRect): void {
    this.inputExclusion = rect;
  }

  getNodeViewportPosition(nodeId: string): { x: number; y: number } | undefined {
    const node = this.graph?.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return undefined;
    return {
      x: node.x * this.zoom + this.pan.x,
      y: node.y * this.zoom + this.pan.y,
    };
  }

  zoomBy(factor: number): void {
    this.setZoomAt(this.zoom * factor, new Phaser.Math.Vector2(0, 0));
  }

  resetView(): void {
    const graph = this.graph;
    if (!graph) return;
    const fitX = Math.max(0.01, (this.size.width - 90) / graph.width);
    const fitY = Math.max(0.01, (this.size.height - 105) / graph.height);
    this.zoom = Phaser.Math.Clamp(Math.max(Math.min(fitX, fitY), 0.58), MIN_ZOOM, MAX_ZOOM);
    const root = graph.nodes.find((node) => node.id === graph.rootId);
    this.pan.set(-(root?.x ?? graph.width * 0.5) * this.zoom, -(root?.y ?? graph.height * 0.5) * this.zoom + 95);
    this.applyViewTransform();
  }

  focusNode(nodeId: string, preferredZoom = 1): void {
    const node = this.graph?.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return;
    this.zoom = Phaser.Math.Clamp(preferredZoom, MIN_ZOOM, MAX_ZOOM);
    this.pan.set(-node.x * this.zoom, -node.y * this.zoom);
    this.applyViewTransform();
  }

  destroy(): void {
    this.phaserScene?.input.off('pointerdown', this.handlePointerDown, this);
    this.phaserScene?.input.off('pointermove', this.handlePointerMove, this);
    this.phaserScene?.input.off('pointerup', this.handlePointerUp, this);
    this.phaserScene?.input.off('pointerupoutside', this.handlePointerUp, this);
    this.phaserScene?.input.off('wheel', this.handleWheel, this);
    this.pointerStates.clear();
    this.selectCallback = undefined;
    this.viewChangeCallback = undefined;
    this.worldRoot = undefined;
    this.phaserScene = undefined;
  }

  protected override onEffectiveActiveChanged(active: boolean): void {
    if (!active) this.pointerStates.clear();
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.isEffectivelyActive()) return;
    const local = this.pointerLocal(pointer);
    if (!this.containsLocal(local)) return;
    const content = this.contentAt(local);
    this.pointerStates.set(pointer.id, {
      local: local.clone(),
      previous: local.clone(),
      start: local.clone(),
      startNodeId: this.hitNode(content)?.id,
      moved: false,
    });
    if (this.pointerStates.size === 2) this.beginPinch();
    pointer.event?.preventDefault();
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    const state = this.pointerStates.get(pointer.id);
    if (!state) return;
    const local = this.pointerLocal(pointer);
    state.previous.copy(state.local);
    state.local.copy(local);
    if (Phaser.Math.Distance.Between(state.start.x, state.start.y, local.x, local.y) > DRAG_THRESHOLD) state.moved = true;

    if (this.pointerStates.size >= 2) {
      this.updatePinch();
    } else {
      this.pan.x += local.x - state.previous.x;
      this.pan.y += local.y - state.previous.y;
      this.constrainPan();
      this.applyViewTransform();
    }
    pointer.event?.preventDefault();
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    const state = this.pointerStates.get(pointer.id);
    if (!state) return;
    const local = this.pointerLocal(pointer);
    const selected = !state.moved ? this.hitNode(this.contentAt(local)) : undefined;
    this.pointerStates.delete(pointer.id);
    if (this.pointerStates.size < 2) {
      this.pinchStartDistance = 0;
      for (const remaining of this.pointerStates.values()) {
        remaining.previous.copy(remaining.local);
        remaining.start.copy(remaining.local);
        remaining.moved = true;
      }
    }
    if (selected && selected.id === state.startNodeId) {
      const position = this.getNodeViewportPosition(selected.id);
      if (position) this.selectCallback?.(selected.id, position);
    } else if (!state.moved && !selected && !state.startNodeId) {
      this.selectCallback?.(undefined, { x: local.x, y: local.y });
    }
    pointer.event?.preventDefault();
  }

  private handleWheel(pointer: Phaser.Input.Pointer, _objects: unknown[], _deltaX: number, deltaY: number): void {
    if (!this.isEffectivelyActive()) return;
    const local = this.pointerLocal(pointer);
    if (!this.containsLocal(local)) return;
    this.setZoomAt(this.zoom * (deltaY > 0 ? 0.88 : 1.14), local);
    pointer.event?.preventDefault();
  }

  private beginPinch(): void {
    const states = [...this.pointerStates.values()].slice(0, 2);
    states.forEach((state) => { state.moved = true; });
    const points = states.map((state) => state.local);
    this.pinchStartDistance = Phaser.Math.Distance.Between(points[0].x, points[0].y, points[1].x, points[1].y);
    this.pinchStartZoom = this.zoom;
    const midpoint = new Phaser.Math.Vector2((points[0].x + points[1].x) * 0.5, (points[0].y + points[1].y) * 0.5);
    this.pinchAnchorContent.copy(this.contentAt(midpoint));
  }

  private updatePinch(): void {
    const points = [...this.pointerStates.values()].slice(0, 2).map((state) => state.local);
    if (points.length < 2 || this.pinchStartDistance <= 0) return;
    const distance = Phaser.Math.Distance.Between(points[0].x, points[0].y, points[1].x, points[1].y);
    const midpoint = new Phaser.Math.Vector2((points[0].x + points[1].x) * 0.5, (points[0].y + points[1].y) * 0.5);
    this.zoom = Phaser.Math.Clamp(this.pinchStartZoom * distance / this.pinchStartDistance, MIN_ZOOM, MAX_ZOOM);
    this.pan.set(midpoint.x - this.pinchAnchorContent.x * this.zoom, midpoint.y - this.pinchAnchorContent.y * this.zoom);
    this.constrainPan();
    this.applyViewTransform();
  }

  private setZoomAt(nextZoom: number, localAnchor: Phaser.Math.Vector2): void {
    const content = this.contentAt(localAnchor);
    this.zoom = Phaser.Math.Clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    this.pan.set(localAnchor.x - content.x * this.zoom, localAnchor.y - content.y * this.zoom);
    this.constrainPan();
    this.applyViewTransform();
  }

  private applyViewTransform(notify = true): void {
    this.worldRoot?.applySceneProps({
      position: { x: this.pan.x, y: this.pan.y },
      scale: { x: this.zoom, y: this.zoom },
    });
    if (notify) this.viewChangeCallback?.();
  }

  private constrainPan(): void {
    const graph = this.graph;
    if (!graph) return;
    const halfWidth = this.size.width * 0.5;
    const halfHeight = this.size.height * 0.5;
    const margin = 130;
    const scaledWidth = graph.width * this.zoom;
    const scaledHeight = graph.height * this.zoom;
    const minX = halfWidth - scaledWidth - margin;
    const maxX = -halfWidth + margin;
    const minY = halfHeight - scaledHeight - margin;
    const maxY = -halfHeight + margin;
    this.pan.x = scaledWidth <= this.size.width ? -scaledWidth * 0.5 : Phaser.Math.Clamp(this.pan.x, minX, maxX);
    this.pan.y = scaledHeight <= this.size.height ? -scaledHeight * 0.5 : Phaser.Math.Clamp(this.pan.y, minY, maxY);
  }

  private pointerLocal(pointer: Phaser.Input.Pointer): Phaser.Math.Vector2 {
    const transform = this.getPhaserTransform();
    const output = new Phaser.Math.Vector2(pointer.x - transform.x, pointer.y - transform.y);
    output.rotate(-transform.rotation);
    output.x /= transform.scaleX || 1;
    output.y /= transform.scaleY || 1;
    return output;
  }

  private containsLocal(point: Phaser.Math.Vector2): boolean {
    const left = -this.size.width * 0.5 + this.inputInsets.left;
    const right = this.size.width * 0.5 - this.inputInsets.right;
    const top = -this.size.height * 0.5 + this.inputInsets.top;
    const bottom = this.size.height * 0.5 - this.inputInsets.bottom;
    if (point.x < left || point.x > right || point.y < top || point.y > bottom) return false;
    const exclusion = this.inputExclusion;
    if (!exclusion) return true;
    return point.x < exclusion.x - exclusion.width * 0.5
      || point.x > exclusion.x + exclusion.width * 0.5
      || point.y < exclusion.y - exclusion.height * 0.5
      || point.y > exclusion.y + exclusion.height * 0.5;
  }

  private contentAt(local: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2((local.x - this.pan.x) / this.zoom, (local.y - this.pan.y) / this.zoom);
  }

  private hitNode(point: Phaser.Math.Vector2): SkillTreeMapHitNode | undefined {
    const nodes = this.graph?.nodes ?? [];
    let best: SkillTreeMapHitNode | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const node of nodes) {
      const halfWidth = Math.max(NODE_WIDTH * 0.5, 39 / this.zoom);
      const halfHeight = Math.max(NODE_HEIGHT * 0.5, 36 / this.zoom);
      const dx = Math.abs(point.x - node.x);
      const dy = Math.abs(point.y - node.y);
      const distance = Math.hypot(dx, dy);
      if (dx <= halfWidth && dy <= halfHeight && distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    }
    return best;
  }
}
