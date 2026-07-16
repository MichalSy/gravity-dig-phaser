import Phaser from 'phaser';
import { NODE_TYPE_IDS, TransformNode, type NodeContext, type TransformNodeOptions } from '../../nodes';

export type SkillTreeMapState = 'purchased' | 'available' | 'unaffordable' | 'locked';

export interface SkillTreeMapGraphNode {
  id: string;
  label: string;
  branch: string;
  color: string;
  tier: number;
  x: number;
  y: number;
  state: SkillTreeMapState;
  milestone?: boolean;
}

export interface SkillTreeMapGraphEdge {
  from: string;
  to: string;
  color: string;
  active: boolean;
}

export interface SkillTreeMapGraphRegion {
  label: string;
  color: string;
  x: number;
  y: number;
}

export interface SkillTreeMapGraph {
  width: number;
  height: number;
  rootId: string;
  nodes: SkillTreeMapGraphNode[];
  edges: SkillTreeMapGraphEdge[];
  regions?: SkillTreeMapGraphRegion[];
}

export interface SkillTreeMapInputInsets {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

type PointerState = {
  local: Phaser.Math.Vector2;
  previous: Phaser.Math.Vector2;
  start: Phaser.Math.Vector2;
  startNodeId?: string;
  moved: boolean;
};

const MIN_ZOOM = 0.28;
const MAX_ZOOM = 1.8;
const DRAG_THRESHOLD = 8;

export class SkillTreeMapNode extends TransformNode {
  static override readonly nodeTypeId = NODE_TYPE_IDS.SkillTreeMapNode;

  private phaserScene?: Phaser.Scene;
  private viewportContainer?: Phaser.GameObjects.Container;
  private worldContainer?: Phaser.GameObjects.Container;
  private backgroundGraphics?: Phaser.GameObjects.Graphics;
  private edgeGraphics?: Phaser.GameObjects.Graphics;
  private nodeGraphics?: Phaser.GameObjects.Graphics;
  private labelsContainer?: Phaser.GameObjects.Container;
  private graph?: SkillTreeMapGraph;
  private selectedNodeId?: string;
  private selectCallback?: (nodeId: string) => void;
  private inputInsets: Required<SkillTreeMapInputInsets> = { top: 0, right: 0, bottom: 0, left: 0 };
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
    this.backgroundGraphics = this.phaserScene.add.graphics();
    this.edgeGraphics = this.phaserScene.add.graphics();
    this.nodeGraphics = this.phaserScene.add.graphics();
    this.labelsContainer = this.phaserScene.add.container(0, 0);
    this.worldContainer = this.phaserScene.add.container(0, 0, [
      this.backgroundGraphics,
      this.edgeGraphics,
      this.nodeGraphics,
      this.labelsContainer,
    ]);
    this.viewportContainer = this.phaserScene.add.container(0, 0, [this.worldContainer]).setScrollFactor(0);
    this.applyViewportTransform();
    this.phaserScene.input.on('pointerdown', this.handlePointerDown, this);
    this.phaserScene.input.on('pointermove', this.handlePointerMove, this);
    this.phaserScene.input.on('pointerup', this.handlePointerUp, this);
    this.phaserScene.input.on('pointerupoutside', this.handlePointerUp, this);
    this.phaserScene.input.on('wheel', this.handleWheel, this);
  }

  override coreUpdate(): void {
    if (!this.viewportContainer) return;
    this.applyViewportTransform();
    this.applyViewTransform();
  }

  override getSceneObjectsInHierarchy(): Phaser.GameObjects.GameObject[] {
    return this.viewportContainer ? [this.viewportContainer] : [];
  }

  setGraph(graph: SkillTreeMapGraph): void {
    const firstGraph = !this.graph;
    this.graph = graph;
    if (firstGraph) this.resetView();
    this.redraw();
  }

  setSelectedNode(nodeId?: string): void {
    this.selectedNodeId = nodeId;
    this.redrawNodes();
  }

  setSelectCallback(callback?: (nodeId: string) => void): void {
    this.selectCallback = callback;
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

  zoomBy(factor: number): void {
    this.setZoomAt(this.zoom * factor, new Phaser.Math.Vector2(0, 0));
  }

  resetView(): void {
    const graph = this.graph;
    if (!graph) return;
    const fitX = Math.max(0.01, (this.size.width - 80) / graph.width);
    const fitY = Math.max(0.01, (this.size.height - 60) / graph.height);
    this.zoom = Phaser.Math.Clamp(Math.min(fitX, fitY), MIN_ZOOM, 0.72);
    this.pan.set(-graph.width * this.zoom * 0.5, -graph.height * this.zoom * 0.5);
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
    this.viewportContainer?.destroy(true);
    this.viewportContainer = undefined;
    this.worldContainer = undefined;
    this.backgroundGraphics = undefined;
    this.edgeGraphics = undefined;
    this.nodeGraphics = undefined;
    this.labelsContainer = undefined;
    this.phaserScene = undefined;
  }

  protected override onEffectiveActiveChanged(active: boolean): void {
    this.viewportContainer?.setVisible(active && this.visible);
    if (!active) this.pointerStates.clear();
  }

  private redraw(): void {
    this.redrawBackground();
    this.redrawEdges();
    this.redrawNodes();
  }

  private redrawBackground(): void {
    const graphics = this.backgroundGraphics;
    const labels = this.labelsContainer;
    const graph = this.graph;
    if (!graphics || !labels || !graph) return;
    graphics.clear();
    labels.removeAll(true);

    graphics.fillStyle(0x020617, 1).fillRect(0, 0, graph.width, graph.height);
    const nebulae = (graph.regions ?? []).map((region) => ({
      x: region.x,
      y: region.y,
      color: Phaser.Display.Color.HexStringToColor(region.color).color,
    }));
    for (const nebula of nebulae) {
      for (let radius = 250; radius > 40; radius -= 35) {
        graphics.fillStyle(nebula.color, 0.008 + (250 - radius) / 35000).fillCircle(nebula.x, nebula.y, radius);
      }
    }
    for (let index = 0; index < 260; index += 1) {
      const x = (index * 811 + 97) % graph.width;
      const y = (index * 467 + 43) % graph.height;
      const radius = index % 17 === 0 ? 2.2 : index % 5 === 0 ? 1.4 : 0.8;
      const alpha = index % 9 === 0 ? 0.8 : 0.34;
      graphics.fillStyle(index % 13 === 0 ? 0x93c5fd : 0xffffff, alpha).fillCircle(x, y, radius);
    }

    for (const region of graph.regions ?? []) {
      labels.add(this.phaserScene!.add.text(region.x, region.y, region.label, {
        fontFamily: 'Silkscreen, monospace',
        fontSize: '26px',
        color: region.color,
        stroke: '#020617',
        strokeThickness: 8,
      }).setOrigin(0.5).setAlpha(0.78).setResolution(2));
    }
  }

  private redrawEdges(): void {
    const graphics = this.edgeGraphics;
    const graph = this.graph;
    if (!graphics || !graph) return;
    graphics.clear();
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    for (const edge of graph.edges) {
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      if (!from || !to) continue;
      const color = Phaser.Display.Color.HexStringToColor(edge.color).color;
      graphics.lineStyle(edge.active ? 5 : 3, edge.active ? color : 0x334155, edge.active ? 0.92 : 0.52);
      const midpointX = (from.x + to.x) * 0.5;
      const midpointY = (from.y + to.y) * 0.5;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const bend = ((edge.from.length + edge.to.length) % 2 === 0 ? 1 : -1) * Math.min(34, length * 0.18);
      const controlX = midpointX - dy / length * bend;
      const controlY = midpointY + dx / length * bend;
      let previousX = from.x;
      let previousY = from.y;
      for (let step = 1; step <= 8; step += 1) {
        const t = step / 8;
        const inverse = 1 - t;
        const x = inverse * inverse * from.x + 2 * inverse * t * controlX + t * t * to.x;
        const y = inverse * inverse * from.y + 2 * inverse * t * controlY + t * t * to.y;
        graphics.lineBetween(previousX, previousY, x, y);
        previousX = x;
        previousY = y;
      }
      if (edge.active) graphics.fillStyle(color, 0.15).fillCircle(midpointX, midpointY, 8);
    }
  }

  private redrawNodes(): void {
    const graphics = this.nodeGraphics;
    const graph = this.graph;
    if (!graphics || !graph) return;
    graphics.clear();
    for (const node of graph.nodes) {
      const selected = node.id === this.selectedNodeId;
      const color = Phaser.Display.Color.HexStringToColor(node.color).color;
      const radius = node.tier === 0 ? 34 : node.milestone ? 25 : 17;
      const stateColor = node.state === 'purchased'
        ? color
        : node.state === 'available'
          ? 0xfacc15
          : node.state === 'unaffordable'
            ? 0xfb7185
            : 0x475569;
      const fillAlpha = node.state === 'locked' ? 0.34 : node.state === 'purchased' ? 0.88 : 0.56;
      graphics.fillStyle(0x020617, 0.9).fillCircle(node.x, node.y, radius + 9);
      graphics.lineStyle(selected ? 6 : 3, selected ? 0xffffff : stateColor, selected ? 1 : 0.9).strokeCircle(node.x, node.y, radius + (selected ? 7 : 4));
      graphics.fillStyle(stateColor, fillAlpha).fillCircle(node.x, node.y, radius);
      graphics.lineStyle(2, node.state === 'locked' ? 0x64748b : 0xe0f2fe, 0.9).strokeCircle(node.x, node.y, Math.max(5, radius - 7));
      if (node.state === 'purchased') {
        graphics.fillStyle(0xffffff, 0.9).fillCircle(node.x, node.y, 4);
      } else if (node.state === 'available') {
        graphics.lineStyle(3, 0xfde047, 0.95).strokeCircle(node.x, node.y, radius + 12);
      }
      if (node.milestone) {
        for (let ray = 0; ray < 8; ray += 1) {
          const angle = ray * Math.PI / 4;
          graphics.lineStyle(2, stateColor, 0.52).lineBetween(
            node.x + Math.cos(angle) * (radius + 10),
            node.y + Math.sin(angle) * (radius + 10),
            node.x + Math.cos(angle) * (radius + 18),
            node.y + Math.sin(angle) * (radius + 18),
          );
        }
      }
    }
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
    if (this.pointerStates.size < 2) this.pinchStartDistance = 0;
    if (selected && selected.id === state.startNodeId) this.selectCallback?.(selected.id);
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
    const points = [...this.pointerStates.values()].slice(0, 2).map((state) => state.local);
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

  private applyViewportTransform(): void {
    const container = this.viewportContainer;
    if (!container) return;
    const transform = this.getPhaserTransform();
    container
      .setPosition(transform.x, transform.y)
      .setRotation(transform.rotation)
      .setScale(transform.scaleX, transform.scaleY)
      .setVisible(transform.visible)
      .setScrollFactor(transform.scrollFactor);
  }

  private applyViewTransform(): void {
    this.worldContainer?.setPosition(this.pan.x, this.pan.y).setScale(this.zoom);
  }

  private constrainPan(): void {
    const graph = this.graph;
    if (!graph) return;
    const halfWidth = this.size.width * 0.5;
    const halfHeight = this.size.height * 0.5;
    const margin = 100;
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
    const output = new Phaser.Math.Vector2();
    this.viewportContainer?.getWorldTransformMatrix().applyInverse(pointer.x, pointer.y, output);
    return output;
  }

  private containsLocal(point: Phaser.Math.Vector2): boolean {
    const left = -this.size.width * 0.5 + this.inputInsets.left;
    const right = this.size.width * 0.5 - this.inputInsets.right;
    const top = -this.size.height * 0.5 + this.inputInsets.top;
    const bottom = this.size.height * 0.5 - this.inputInsets.bottom;
    return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
  }

  private contentAt(local: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2((local.x - this.pan.x) / this.zoom, (local.y - this.pan.y) / this.zoom);
  }

  private hitNode(point: Phaser.Math.Vector2): SkillTreeMapGraphNode | undefined {
    const nodes = this.graph?.nodes ?? [];
    let best: SkillTreeMapGraphNode | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const node of nodes) {
      const baseRadius = node.tier === 0 ? 42 : node.milestone ? 34 : 27;
      const radius = Math.max(baseRadius, 40 / this.zoom);
      const distance = Phaser.Math.Distance.Between(point.x, point.y, node.x, node.y);
      if (distance <= radius && distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    }
    return best;
  }
}
