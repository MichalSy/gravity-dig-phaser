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
  iconKey: string;
  milestone?: boolean;
  rank?: number;
}

export interface SkillTreeMapGraphEdge {
  from: string;
  to: string;
  color: string;
  active: boolean;
  secondary?: boolean;
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
const SMALL_WIDTH = 88;
const SMALL_HEIGHT = 88;
const ROOT_WIDTH = 88;
const ROOT_HEIGHT = 88;

export class SkillTreeMapNode extends TransformNode {
  static override readonly nodeTypeId = NODE_TYPE_IDS.SkillTreeMapNode;

  private phaserScene?: Phaser.Scene;
  private viewportContainer?: Phaser.GameObjects.Container;
  private worldContainer?: Phaser.GameObjects.Container;
  private backgroundImage?: Phaser.GameObjects.Image;
  private edgeGraphics?: Phaser.GameObjects.Graphics;
  private nodeGraphics?: Phaser.GameObjects.Graphics;
  private iconsContainer?: Phaser.GameObjects.Container;
  private labelsContainer?: Phaser.GameObjects.Container;
  private graph?: SkillTreeMapGraph;
  private selectedNodeId?: string;
  private selectCallback?: (nodeId: string, viewportPosition: { x: number; y: number }) => void;
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
    this.backgroundImage = this.phaserScene.add
      .image(0, 0, 'research-anime-background')
      .setScrollFactor(0)
      .setAlpha(1);
    this.edgeGraphics = this.phaserScene.add.graphics();
    this.nodeGraphics = this.phaserScene.add.graphics();
    this.iconsContainer = this.phaserScene.add.container(0, 0);
    this.labelsContainer = this.phaserScene.add.container(0, 0);
    this.worldContainer = this.phaserScene.add.container(0, 0, [
      this.edgeGraphics,
      this.nodeGraphics,
      this.iconsContainer,
      this.labelsContainer,
    ]);
    this.viewportContainer = this.phaserScene.add
      .container(0, 0, [this.backgroundImage, this.worldContainer])
      .setScrollFactor(0);
    this.applyViewportTransform();
    this.layoutBackground();
    this.phaserScene.input.on('pointerdown', this.handlePointerDown, this);
    this.phaserScene.input.on('pointermove', this.handlePointerMove, this);
    this.phaserScene.input.on('pointerup', this.handlePointerUp, this);
    this.phaserScene.input.on('pointerupoutside', this.handlePointerUp, this);
    this.phaserScene.input.on('wheel', this.handleWheel, this);
  }

  override coreUpdate(): void {
    if (!this.viewportContainer) return;
    this.applyViewportTransform();
    this.layoutBackground();
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
    this.redraw();
  }

  setSelectCallback(callback?: (nodeId: string, viewportPosition: { x: number; y: number }) => void): void {
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

  setInputExclusion(rect?: SkillTreeMapExclusionRect): void {
    this.inputExclusion = rect;
    this.pointerStates.clear();
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
    this.zoom = Phaser.Math.Clamp(Math.max(Math.min(fitX, fitY), 0.72), MIN_ZOOM, MAX_ZOOM);
    const root = graph.nodes.find((node) => node.id === graph.rootId);
    this.pan.set(-(root?.x ?? graph.width * 0.5) * this.zoom, -(root?.y ?? graph.height * 0.5) * this.zoom + 26);
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
    this.backgroundImage = undefined;
    this.edgeGraphics = undefined;
    this.nodeGraphics = undefined;
    this.iconsContainer = undefined;
    this.labelsContainer = undefined;
    this.phaserScene = undefined;
  }

  protected override onEffectiveActiveChanged(active: boolean): void {
    this.viewportContainer?.setVisible(active && this.visible);
    if (!active) this.pointerStates.clear();
  }

  private layoutBackground(): void {
    this.backgroundImage?.setDisplaySize(this.size.width, this.size.height);
  }

  private redraw(): void {
    this.redrawEdges();
    this.redrawNodes();
  }

  private getNodeDimensions(node: SkillTreeMapGraphNode): { width: number; height: number } {
    if (node.tier === 0) return { width: ROOT_WIDTH, height: ROOT_HEIGHT };
    return { width: SMALL_WIDTH, height: SMALL_HEIGHT };
  }

  private edgeAnchor(
    from: SkillTreeMapGraphNode,
    toward: SkillTreeMapGraphNode,
  ): { x: number; y: number } {
    const dimensions = this.getNodeDimensions(from);
    const dx = toward.x - from.x;
    const dy = toward.y - from.y;
    const divisor = Math.max(
      Math.abs(dx) / Math.max(1, dimensions.width * 0.5),
      Math.abs(dy) / Math.max(1, dimensions.height * 0.5),
      1,
    );
    return { x: from.x + dx / divisor, y: from.y + dy / divisor };
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
      const highlightedBridge = edge.secondary
        && (edge.from === this.selectedNodeId || edge.to === this.selectedNodeId);
      if (edge.secondary && !highlightedBridge) continue;
      const start = this.edgeAnchor(from, to);
      const end = this.edgeAnchor(to, from);
      const color = Phaser.Display.Color.HexStringToColor(edge.color).color;
      const drawConnector = () => {
        if (!edge.secondary || start.x === end.x || start.y === end.y) {
          graphics.lineBetween(start.x, start.y, end.x, end.y);
          return;
        }
        const middleX = (start.x + end.x) * 0.5;
        graphics.lineBetween(start.x, start.y, middleX, start.y);
        graphics.lineBetween(middleX, start.y, middleX, end.y);
        graphics.lineBetween(middleX, end.y, end.x, end.y);
      };
      graphics.lineStyle(edge.secondary ? 8 : 12, 0x050b16, edge.secondary ? 0.82 : 0.72);
      drawConnector();
      graphics.lineStyle(
        edge.secondary ? 3 : 6,
        edge.active ? color : 0xd7ded8,
        edge.secondary ? 0.9 : edge.active ? 0.9 : 0.48,
      );
      drawConnector();
    }
  }

  private redrawNodes(): void {
    const graphics = this.nodeGraphics;
    const graph = this.graph;
    const icons = this.iconsContainer;
    const labels = this.labelsContainer;
    const scene = this.phaserScene;
    if (!graphics || !graph || !icons || !labels || !scene) return;
    graphics.clear();
    icons.removeAll(true);
    labels.removeAll(true);

    for (const node of graph.nodes) {
      const selected = node.id === this.selectedNodeId;
      const categoryColor = Phaser.Display.Color.HexStringToColor(node.color).color;
      const stateColor = node.state === 'purchased'
        ? 0x8cf5c8
        : node.state === 'available'
          ? 0xffdf6b
          : node.state === 'unaffordable'
            ? 0xff8e9f
            : categoryColor;
      const { width, height } = this.getNodeDimensions(node);
      const x = node.x - width * 0.5;
      const y = node.y - height * 0.5;
      const radius = 12;
      const fillColor = node.milestone ? 0x28486c : node.tier === 0 ? 0x345171 : 0x183555;
      const fillAlpha = node.state === 'locked' ? 0.84 : 0.96;

      if (selected) {
        graphics.fillStyle(0xffffff, 0.15).fillRoundedRect(x - 10, y - 10, width + 20, height + 20, radius + 8);
        graphics.lineStyle(6, 0xffffff, 0.96).strokeRoundedRect(x - 7, y - 7, width + 14, height + 14, radius + 6);
      } else if (node.state === 'available') {
        graphics.lineStyle(5, 0xffef9c, 0.8).strokeRoundedRect(x - 6, y - 6, width + 12, height + 12, radius + 5);
      }

      graphics.fillStyle(0x07172c, 0.92).fillRoundedRect(x - 4, y - 4, width + 8, height + 8, radius + 4);
      graphics.fillStyle(fillColor, fillAlpha).fillRoundedRect(x, y, width, height, radius);
      graphics.lineStyle(node.milestone ? 7 : 4, stateColor, 0.96).strokeRoundedRect(x, y, width, height, radius);
      graphics.lineStyle(2, categoryColor, node.state === 'locked' ? 0.34 : 0.88)
        .strokeRoundedRect(x + 6, y + 6, width - 12, height - 12, Math.max(6, radius - 5));

      const iconSize = node.tier === 0 ? 76 : node.milestone ? 66 : 62;
      const icon = scene.add.image(node.x, node.y, node.iconKey).setDisplaySize(iconSize, iconSize);
      if (node.state === 'locked') icon.setTint(0xb5cad8).setAlpha(0.76);
      else if (node.state === 'purchased') icon.setAlpha(1);
      else icon.setAlpha(0.92);
      icons.add(icon);

      if (node.rank) {
        const pipCount = Math.min(3, node.rank);
        for (let pip = 0; pip < pipCount; pip += 1) {
          graphics.fillStyle(0xffe47c, 0.98).fillCircle(
            node.x + width * 0.5 - 13 - pip * 12,
            node.y - height * 0.5 + 12,
            4,
          );
        }
      }

      if (node.state === 'purchased') {
        graphics.fillStyle(0xffffff, 0.96).fillCircle(node.x - width * 0.5 + 13, node.y - height * 0.5 + 13, 5);
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
    const output = new Phaser.Math.Vector2();
    this.viewportContainer?.getWorldTransformMatrix().applyInverse(pointer.x, pointer.y, output);
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

  private hitNode(point: Phaser.Math.Vector2): SkillTreeMapGraphNode | undefined {
    const nodes = this.graph?.nodes ?? [];
    let best: SkillTreeMapGraphNode | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const node of nodes) {
      const dimensions = this.getNodeDimensions(node);
      const halfWidth = Math.max(dimensions.width * 0.5, 39 / this.zoom);
      const halfHeight = Math.max(dimensions.height * 0.5, 36 / this.zoom);
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
