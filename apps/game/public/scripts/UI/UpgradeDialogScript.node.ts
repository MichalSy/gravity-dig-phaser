import * as Core from '@gravity-dig/game-core';
import {
  areUpgradePrerequisitesMet,
  SKILL_TREE_BRANCHES,
  SKILL_TREE_IDS,
  UPGRADE_DEFINITIONS,
} from '../PlayerState/catalogs/upgrades';
import type { UpgradeDefinition, UpgradeId } from '../PlayerState/types';
import {
  CONSTELLATION_MAP_HEIGHT,
  CONSTELLATION_MAP_WIDTH,
  CONSTELLATION_ROOT,
  getConstellationNodePosition,
  getSkillIconKey,
  getSkillTreeRank,
  isSkillTreeMilestone,
  type SkillTreeBranchId,
} from './skillTreeLayout';

type PlayerStateLike = {
  getProfileCredits(): number;
  isUpgradePurchased(upgradeId: UpgradeId): boolean;
  purchaseUpgrade(upgradeId: UpgradeId): { ok: boolean; message: string };
};

type GameplayInputLike = { setMenuOpen(open: boolean): void };
type SkillState = 'purchased' | 'available' | 'unaffordable' | 'locked';
type GraphNode = {
  id: string;
  label: string;
  branch: string;
  color: string;
  tier: number;
  x: number;
  y: number;
  state: SkillState;
  iconKey: string;
  milestone?: boolean;
  rank?: number;
};
type GraphEdge = { from: string; to: string; color: string; active: boolean; secondary?: boolean };
type SkillTreeMapLike = {
  setWorldRoot(root?: Core.TransformNode): void;
  setGraph(graph: { width: number; height: number; rootId: string; nodes: GraphNode[]; edges: GraphEdge[] }): void;
  setSelectCallback(callback?: (nodeId: string | undefined, position: { x: number; y: number }) => void): void;
  setViewChangeCallback(callback?: () => void): void;
  getNodeViewportPosition(nodeId: string): { x: number; y: number } | undefined;
  setInputInsets(insets?: { top?: number; right?: number; bottom?: number; left?: number }): void;
  setInputExclusion(rect?: { x: number; y: number; width: number; height: number }): void;
  resetView(): void;
};
type NodeRoot = Core.TransformNode & {
  addChild<T extends Core.GameNode>(child: T): T;
  removeChild(child: Core.GameNode): void;
};
type SkillCardRoot = Core.TransformNode & { children: readonly Core.GameNode[] };
type EdgeRoot = Core.TransformNode & { children: readonly Core.GameNode[] };
type SkillEdgeRefs = {
  root: EdgeRoot;
  backing: Core.LineNode;
  foreground: Core.LineNode;
};
type SkillIconNode = Core.ImageNode & { setAssetId(assetId: string): void };

type SkillCardRefs = {
  root: SkillCardRoot;
  selection: Core.RoundedRectangleNode;
  emphasis: Core.RoundedRectangleNode;
  face: Core.RoundedRectangleNode;
  inner: Core.RoundedRectangleNode;
  icon: SkillIconNode;
  purchased: Core.CircleNode;
  pips: Core.CircleNode[];
  label: Core.TextNode;
};

const BRANCH_ORDER: SkillTreeBranchId[] = ['movement', 'vision', 'mining', 'utility'];
type BranchId = SkillTreeBranchId;
const BRANCH_META: Record<BranchId, { color: string }> = {
  movement: { color: '#ffd369' },
  vision: { color: '#59d8ff' },
  mining: { color: '#ff8bc8' },
  utility: { color: '#9ee879' },
};
const MAP_INPUT_INSETS = { top: 110, right: 0, bottom: 0, left: 0 };
const POPOVER_WIDTH = 420;
const POPOVER_HEIGHT = 210;
const SKILL_NODE_PREFAB_ID = 'd8fd35fe-9714-50ac-a561-9a31ffb44621';
const SKILL_EDGE_PREFAB_ID = '26d43ec9-f0a9-5f80-ad9d-7c29c73a2ceb';
const NODE_SIZE = 88;
const SKILL_ICON_SOURCE_SIZE = 128;

export default class ResearchScreenScript extends Core.ScriptNode {
  id = 'dynamic.upgrade-dialog';
  name = 'Research Screen';

  playerStateNodeId = Core.prop.nodeRef(null, { label: 'Player State' });
  gameplayInputNodeId = Core.prop.nodeRef(null, { label: 'Gameplay Input' });
  screenRootNodeId = Core.prop.nodeRef(null, { label: 'Screen Root' });
  mapNodeId = Core.prop.nodeRef(null, { label: 'Skill Map' });
  mapWorldRootNodeId = Core.prop.nodeRef(null, { label: 'Map World Root' });
  mapEdgesRootNodeId = Core.prop.nodeRef(null, { label: 'Map Edges Root' });
  mapCardsRootNodeId = Core.prop.nodeRef(null, { label: 'Map Cards Root' });
  skillNodePrefabId = Core.prop.string(SKILL_NODE_PREFAB_ID, { label: 'Skill Node Prefab ID' });
  skillNodePrefabPath = Core.prop.string('prefabs/skill-tree-node.prefab.json', { label: 'Skill Node Prefab Path' });
  skillEdgePrefabId = Core.prop.string(SKILL_EDGE_PREFAB_ID, { label: 'Skill Edge Prefab ID' });
  skillEdgePrefabPath = Core.prop.string('prefabs/skill-tree-edge.prefab.json', { label: 'Skill Edge Prefab Path' });
  creditsTextNodeId = Core.prop.nodeRef(null, { label: 'Credits Text' });
  progressTextNodeId = Core.prop.nodeRef(null, { label: 'Progress Text' });
  popoverRootNodeId = Core.prop.nodeRef(null, { label: 'Skill Popover' });
  detailTitleNodeId = Core.prop.nodeRef(null, { label: 'Skill Title' });
  detailDescriptionNodeId = Core.prop.nodeRef(null, { label: 'Skill Description' });
  costTextNodeId = Core.prop.nodeRef(null, { label: 'Skill Cost' });
  purchaseButtonNodeId = Core.prop.nodeRef(null, { label: 'Learn Button' });
  purchaseLabelNodeId = Core.prop.nodeRef(null, { label: 'Learn Label' });
  closeButtonNodeId = Core.prop.nodeRef(null, { label: 'Close Screen' });

  private playerState!: PlayerStateLike;
  private gameplayInput?: GameplayInputLike;
  private screenRoot!: Core.TransformNode;
  private map!: SkillTreeMapLike;
  private mapWorldRoot!: Core.TransformNode;
  private mapEdgesRoot!: NodeRoot;
  private mapCardsRoot!: NodeRoot;
  private creditsText!: Core.TextNode;
  private progressText!: Core.TextNode;
  private popoverRoot!: Core.TransformNode;
  private detailTitle!: Core.TextNode;
  private detailDescription!: Core.TextNode;
  private costText!: Core.TextNode;
  private purchaseButton!: Core.ButtonNode;
  private purchaseLabel!: Core.TextNode;
  private selectedUpgradeId?: UpgradeId;
  private keyHandler?: (event: KeyboardEvent) => void;
  private opened = false;
  private readonly skillCards = new Map<string, SkillCardRefs>();
  private readonly edgeNodes: SkillEdgeRefs[] = [];

  resolve() {
    this.playerState = this.resolveNode<PlayerStateLike>(this.playerStateNodeId, 'PlayerState');
    this.gameplayInput = this.resolveNode<GameplayInputLike>(this.gameplayInputNodeId, 'GameplayInput');
    this.screenRoot = this.requireNodeRef<Core.TransformNode>(this.screenRootNodeId, 'Research screen');
    this.map = this.requireNodeRef<SkillTreeMapLike>(this.mapNodeId, 'Skill map');
    this.mapWorldRoot = this.requireNodeRef<Core.TransformNode>(this.mapWorldRootNodeId, 'Map world root');
    this.mapEdgesRoot = this.requireNodeRef<NodeRoot>(this.mapEdgesRootNodeId, 'Map edges root');
    this.mapCardsRoot = this.requireNodeRef<NodeRoot>(this.mapCardsRootNodeId, 'Map cards root');
    this.creditsText = this.requireNodeRef<Core.TextNode>(this.creditsTextNodeId, 'Credits text');
    this.progressText = this.requireNodeRef<Core.TextNode>(this.progressTextNodeId, 'Progress text');
    this.popoverRoot = this.requireNodeRef<Core.TransformNode>(this.popoverRootNodeId, 'Skill popover');
    this.detailTitle = this.requireNodeRef<Core.TextNode>(this.detailTitleNodeId, 'Skill title');
    this.detailDescription = this.requireNodeRef<Core.TextNode>(this.detailDescriptionNodeId, 'Skill description');
    this.costText = this.requireNodeRef<Core.TextNode>(this.costTextNodeId, 'Skill cost');
    this.purchaseButton = this.requireNodeRef<Core.ButtonNode>(this.purchaseButtonNodeId, 'Learn button');
    this.purchaseLabel = this.requireNodeRef<Core.TextNode>(this.purchaseLabelNodeId, 'Learn label');

    this.map.setWorldRoot(this.mapWorldRoot);
    this.map.setSelectCallback((nodeId) => this.selectUpgrade(nodeId as UpgradeId | undefined));
    this.map.setViewChangeCallback(() => this.updatePopoverPosition());
    this.purchaseButton.setClickAction?.(() => this.purchaseSelected());
    this.requireNodeRef<Core.ButtonNode>(this.closeButtonNodeId, 'Close screen').setClickAction?.(() => this.close());
    this.keyHandler = (event) => {
      if (!this.isOpen()) return;
      if (event.key === 'Escape') {
        if (this.selectedUpgradeId) this.clearSelection();
        else this.close();
      }
      if (event.key === 'Enter') this.purchaseSelected();
    };
    window.addEventListener('keydown', this.keyHandler);
    this.close();
  }

  destroy() {
    this.clearGraphPresentation();
    this.map?.setWorldRoot();
    this.map?.setSelectCallback();
    this.map?.setViewChangeCallback();
    this.purchaseButton?.setClickAction?.();
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = undefined;
    this.gameplayInput?.setMenuOpen(false);
  }

  open() {
    this.opened = true;
    this.screenRoot.applySceneProps({ active: true });
    this.setSubtreeVisible(this.screenRoot, true);
    this.hidePopover();
    this.gameplayInput?.setMenuOpen(true);
    this.selectedUpgradeId = undefined;
    this.map.setInputInsets(MAP_INPUT_INSETS);
    this.map.setInputExclusion();
    this.updateGraph();
    this.map.resetView();
  }

  close() {
    this.opened = false;
    if (this.screenRoot) {
      this.setSubtreeVisible(this.screenRoot, false);
      this.screenRoot.applySceneProps({ active: false });
    }
    this.gameplayInput?.setMenuOpen(false);
  }

  isOpen() { return this.opened; }

  private selectUpgrade(upgradeId: UpgradeId | undefined) {
    if (!upgradeId) {
      this.clearSelection();
      return;
    }
    if (!UPGRADE_DEFINITIONS[upgradeId]) return;
    if (this.selectedUpgradeId === upgradeId) {
      this.clearSelection();
      return;
    }
    this.selectedUpgradeId = upgradeId;
    this.updateGraph();
    this.popoverRoot.applySceneProps({ active: true });
    this.setSubtreeVisible(this.popoverRoot, true);
    this.updatePopoverPosition();
    this.updateSelection();
  }

  private updatePopoverPosition() {
    const upgradeId = this.selectedUpgradeId;
    if (!upgradeId) return;
    const nodePosition = this.map.getNodeViewportPosition(upgradeId);
    if (!nodePosition) return;
    const popoverCenter = this.getPopoverCenter(nodePosition);
    const popoverPosition = {
      x: popoverCenter.x - POPOVER_WIDTH * 0.5,
      y: popoverCenter.y - POPOVER_HEIGHT * 0.5,
    };
    this.popoverRoot.applySceneProps({ position: popoverPosition });
    this.map.setInputExclusion({
      x: popoverCenter.x,
      y: popoverCenter.y,
      width: POPOVER_WIDTH + 16,
      height: POPOVER_HEIGHT + 16,
    });
  }

  private getPopoverCenter(nodePosition: { x: number; y: number }): { x: number; y: number } {
    const placeRight = nodePosition.x < 120;
    const x = nodePosition.x + (placeRight ? 245 : -245);
    return {
      x: Math.max(-418, Math.min(418, x)),
      y: Math.max(-135, Math.min(245, nodePosition.y)),
    };
  }

  private clearSelection() {
    this.selectedUpgradeId = undefined;
    this.map.setInputExclusion();
    this.updateGraph();
    this.hidePopover();
  }

  private hidePopover() {
    if (!this.popoverRoot) return;
    this.setSubtreeVisible(this.popoverRoot, false);
    this.popoverRoot.applySceneProps({ active: false });
  }

  private purchaseSelected() {
    const upgradeId = this.selectedUpgradeId;
    if (!upgradeId || this.getSkillState(upgradeId) !== 'available') return;
    this.playerState.purchaseUpgrade(upgradeId);
    this.updateGraph();
    this.updateSelection();
  }

  private updateGraph() {
    const purchasedCount = SKILL_TREE_IDS.filter((id) => this.playerState.isUpgradePurchased(id)).length;
    this.creditsText.setText(`C  ${this.playerState.getProfileCredits().toLocaleString('de-DE')}`);
    this.progressText.setText(`✦  ${purchasedCount} / ${SKILL_TREE_IDS.length}`);

    const nodes: GraphNode[] = [{
      id: 'prospector_core',
      label: UPGRADE_DEFINITIONS.prospector_core.label,
      branch: 'core',
      color: '#ffd76a',
      tier: 0,
      x: CONSTELLATION_ROOT.x,
      y: CONSTELLATION_ROOT.y,
      state: this.getSkillState('prospector_core'),
      iconKey: getSkillIconKey('prospector_core'),
    }];
    const edges: GraphEdge[] = [];

    for (const branch of BRANCH_ORDER) {
      const meta = BRANCH_META[branch];
      const ids = SKILL_TREE_BRANCHES[branch];
      ids.forEach((id, index) => {
        const tier = index + 1;
        const definition = UPGRADE_DEFINITIONS[id];
        const position = getConstellationNodePosition(branch, tier);
        nodes.push({
          id,
          label: this.getMapLabel(id, definition.label),
          branch,
          color: meta.color,
          tier,
          x: position.x,
          y: position.y,
          state: this.getSkillState(id),
          iconKey: getSkillIconKey(id),
          milestone: isSkillTreeMilestone(id),
          rank: getSkillTreeRank(id),
        });
        for (const prerequisite of definition.prerequisites ?? []) {
          if (!SKILL_TREE_IDS.includes(prerequisite)) continue;
          edges.push({
            from: prerequisite,
            to: id,
            color: meta.color,
            active: this.playerState.isUpgradePurchased(prerequisite),
            secondary: UPGRADE_DEFINITIONS[prerequisite].tree?.branch !== 'core'
              && UPGRADE_DEFINITIONS[prerequisite].tree?.branch !== branch,
          });
        }
      });
    }
    this.map.setGraph({
      width: CONSTELLATION_MAP_WIDTH,
      height: CONSTELLATION_MAP_HEIGHT,
      rootId: 'prospector_core',
      nodes,
      edges,
    });
    this.syncGraphPresentation(nodes, edges);
  }

  private syncGraphPresentation(nodes: GraphNode[], edges: GraphEdge[]) {
    const visibleEdges = edges;
    if (
      this.skillCards.size !== nodes.length
      || nodes.some((node) => !this.skillCards.has(node.id))
      || this.edgeNodes.length !== visibleEdges.length
    ) {
      this.rebuildGraphPresentation(nodes, edges);
      return;
    }
    const byId = new Map(nodes.map((node) => [node.id, node]));
    for (const node of nodes) {
      const refs = this.skillCards.get(node.id);
      if (refs) this.applyCardPresentation(node, refs);
    }
    visibleEdges.forEach((edge, index) => {
      const refs = this.edgeNodes[index];
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      if (refs && from && to) this.applyEdgePresentation(edge, refs, from, to);
    });
  }

  private rebuildGraphPresentation(nodes: GraphNode[], edges: GraphEdge[]) {
    this.clearGraphPresentation();
    const byId = new Map(nodes.map((node) => [node.id, node]));

    for (const [index, edge] of edges.entries()) {
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      if (!from || !to) continue;
      const edgeRoot = this.instantiatePrefab<EdgeRoot>(this.skillEdgePrefabId, {
        name: `SkillEdge.${index}.${edge.from}.${edge.to}`,
      });
      this.mapEdgesRoot.addChild(edgeRoot);
      const backing = this.requireChildByName<Core.LineNode>(edgeRoot, 'Backing');
      const foreground = this.requireChildByName<Core.LineNode>(edgeRoot, 'Foreground');
      const refs = { root: edgeRoot, backing, foreground };
      this.applyEdgePresentation(edge, refs, from, to);
      this.edgeNodes.push(refs);
    }

    for (const node of nodes) {
      const root = this.instantiatePrefab<SkillCardRoot>(this.skillNodePrefabId, {
        name: `SkillCard.${node.id}`,
        props: { position: { x: node.x, y: node.y } },
      });
      this.mapCardsRoot.addChild(root);
      const refs: SkillCardRefs = {
        root,
        selection: this.requireChildByName(root, 'Selection'),
        emphasis: this.requireChildByName(root, 'Emphasis'),
        face: this.requireChildByName(root, 'Card'),
        inner: this.requireChildByName(root, 'InnerBorder'),
        icon: this.requireChildByName(root, 'Icon'),
        purchased: this.requireChildByName(root, 'PurchasedIndicator'),
        pips: [1, 2, 3].map((rank) => this.requireChildByName(root, `RankPip${rank}`)),
        label: this.requireChildByName(root, 'Label'),
      };
      this.skillCards.set(node.id, refs);
      this.applyCardPresentation(node, refs);
    }
  }

  private clearGraphPresentation() {
    for (const card of this.skillCards.values()) this.mapCardsRoot?.removeChild(card.root);
    for (const edge of this.edgeNodes) this.mapEdgesRoot?.removeChild(edge.root);
    this.skillCards.clear();
    this.edgeNodes.length = 0;
  }

  private applyEdgePresentation(edge: GraphEdge, refs: SkillEdgeRefs, from: GraphNode, to: GraphNode) {
    const start = this.edgeAnchor(from, to);
    const end = this.edgeAnchor(to, from);
    const visible = !edge.secondary || edge.from === this.selectedUpgradeId || edge.to === this.selectedUpgradeId;
    refs.backing.applySceneProps({
      start,
      end,
      color: '#050b16',
      lineWidth: edge.secondary ? 8 : 12,
      alpha: edge.secondary ? 0.82 : 0.72,
      visible,
    });
    refs.foreground.applySceneProps({
      start,
      end,
      color: edge.active ? edge.color : '#d7ded8',
      lineWidth: edge.secondary ? 3 : 6,
      alpha: edge.secondary ? 0.9 : edge.active ? 0.9 : 0.48,
      visible,
    });
  }

  private applyCardPresentation(node: GraphNode, refs: SkillCardRefs) {
    const stateColor = node.state === 'purchased'
      ? '#8cf5c8'
      : node.state === 'available'
        ? '#ffdf6b'
        : node.state === 'unaffordable'
          ? '#ff8e9f'
          : node.color;
    const selected = node.id === this.selectedUpgradeId;
    const iconSize = node.tier === 0 ? 76 : node.milestone ? 66 : 62;
    refs.root.applySceneProps({ position: { x: node.x, y: node.y }, size: { width: NODE_SIZE, height: NODE_SIZE } });
    refs.selection.applySceneProps({ visible: selected });
    refs.emphasis.applySceneProps({ visible: !selected && node.state === 'available' });
    refs.face.applySceneProps({
      fillColor: node.milestone ? '#28486c' : node.tier === 0 ? '#345171' : '#183555',
      fillAlpha: node.state === 'locked' ? 0.84 : 0.96,
      strokeColor: stateColor,
      strokeAlpha: 0.96,
      strokeWidth: node.milestone ? 7 : 4,
    });
    refs.inner.applySceneProps({
      strokeColor: node.color,
      strokeAlpha: node.state === 'locked' ? 0.34 : 0.88,
      strokeWidth: 2,
    });
    refs.icon.setAssetId(node.iconKey);
    const iconScale = iconSize / SKILL_ICON_SOURCE_SIZE;
    refs.icon.applySceneProps({
      size: { width: iconSize, height: iconSize },
      scale: { x: iconScale, y: iconScale },
      alpha: node.state === 'locked' ? 0.76 : node.state === 'purchased' ? 1 : 0.92,
      tint: node.state === 'locked' ? '#b5cad8' : '#ffffff',
      visible: true,
    });
    refs.purchased.applySceneProps({ visible: node.state === 'purchased' });
    refs.pips.forEach((pip, index) => pip.applySceneProps({ visible: index < Math.min(3, node.rank ?? 0) }));
    refs.label.setText(node.label);
    refs.label.applySceneProps({ visible: false, color: stateColor });
  }


  private edgeAnchor(from: GraphNode, toward: GraphNode): { x: number; y: number } {
    const dx = toward.x - from.x;
    const dy = toward.y - from.y;
    const divisor = Math.max(
      Math.abs(dx) / (NODE_SIZE * 0.5),
      Math.abs(dy) / (NODE_SIZE * 0.5),
      1,
    );
    return { x: from.x + dx / divisor, y: from.y + dy / divisor };
  }

  private getMapLabel(upgradeId: UpgradeId, fallback: string): string {
    const labels: Partial<Record<UpgradeId, string>> = {
      micro_jetpack: 'MIKRO-\nJETPACK',
      xray_potato: 'KRISTALL-\nRADAR',
      storm_subscription: 'QUANTEN-\nBOHRER',
      pocket_wormhole: 'STERNEN-\nFRACHTER',
      reality_premium: 'GRAVITATIONS-\nKERN',
    };
    return labels[upgradeId] ?? fallback;
  }

  private updateSelection() {
    const upgradeId = this.selectedUpgradeId;
    if (!upgradeId) return;
    const definition = UPGRADE_DEFINITIONS[upgradeId];
    const state = this.getSkillState(upgradeId);
    this.detailTitle.setText(this.wrapText(definition.label.toUpperCase(), 25).split('\n').slice(0, 2).join('\n'));
    this.detailDescription.setText(this.wrapText(definition.description ?? definition.label, 30));
    this.costText.setText(`${(definition.cost.credits ?? 0).toLocaleString('de-DE')} C`);
    this.purchaseLabel.setText(this.getPurchaseLabel(definition, state));
    this.purchaseButton.enabled = state === 'available';
  }

  private getSkillState(upgradeId: UpgradeId): SkillState {
    if (this.playerState.isUpgradePurchased(upgradeId)) return 'purchased';
    const definition = UPGRADE_DEFINITIONS[upgradeId];
    if (!areUpgradePrerequisitesMet(definition, (id) => this.playerState.isUpgradePurchased(id))) return 'locked';
    return this.playerState.getProfileCredits() >= (definition.cost.credits ?? 0) ? 'available' : 'unaffordable';
  }

  private getPurchaseLabel(definition: UpgradeDefinition, state: SkillState): string {
    if (state === 'purchased') return 'GELERNT';
    if (state === 'locked') return 'GESPERRT';
    if (state === 'unaffordable') return 'ZU TEUER';
    return `LERNEN · ${(definition.cost.credits ?? 0).toLocaleString('de-DE')} C`;
  }

  private wrapText(text: string, maxLineLength: number): string {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      if (line && `${line} ${word}`.length > maxLineLength) { lines.push(line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(line);
    return lines.slice(0, 5).join('\n');
  }

  private setSubtreeVisible(root: Core.GameNode, visible: boolean) {
    const visit = (node: Core.GameNode) => {
      if ('visible' in node) node.applySceneProps({ visible });
      node.getSceneObjectsInHierarchy().forEach((object) => {
        (object as { setVisible?(value: boolean): unknown }).setVisible?.(visible);
      });
      node.children.forEach(visit);
    };
    visit(root);
  }

  private resolveNode<T>(nodeId: string | null | undefined, fallbackName: string): T {
    const node = nodeId ? this.getNodeById<T>(nodeId) : this.getNode<T>(fallbackName);
    if (!node) throw new Error(`Required node '${fallbackName}' was not resolved`);
    return node;
  }

  private requireNodeRef<T>(nodeId: string | null | undefined, label: string): T {
    if (!nodeId) throw new Error(`${label} node is not configured`);
    const node = this.getNodeById<T>(nodeId);
    if (!node) throw new Error(`${label} node was not resolved`);
    return node;
  }

  private requireChildByName<T>(root: { children: readonly Core.GameNode[]; debugName(): string }, name: string): T {
    const child = root.children.find((node) => node.debugName() === name);
    if (!child) throw new Error(`${root.debugName()} is missing child '${name}'`);
    return child as T;
  }
}
