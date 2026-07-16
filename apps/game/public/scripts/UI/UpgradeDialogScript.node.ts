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
type GraphEdge = { from: string; to: string; color: string; active: boolean };
type SkillTreeMapLike = {
  setGraph(graph: { width: number; height: number; rootId: string; nodes: GraphNode[]; edges: GraphEdge[] }): void;
  setSelectedNode(nodeId?: string): void;
  setSelectCallback(callback?: (nodeId: string, position: { x: number; y: number }) => void): void;
  setInputInsets(insets?: { top?: number; right?: number; bottom?: number; left?: number }): void;
  setInputExclusion(rect?: { x: number; y: number; width: number; height: number }): void;
  zoomBy(factor: number): void;
  resetView(): void;
};

const BRANCH_ORDER: SkillTreeBranchId[] = ['movement', 'vision', 'mining', 'utility'];
type BranchId = SkillTreeBranchId;
const BRANCH_META: Record<BranchId, { color: string }> = {
  movement: { color: '#65e6a3' },
  vision: { color: '#59d8ff' },
  mining: { color: '#ff8bc8' },
  utility: { color: '#bd8cff' },
};
const MAP_INPUT_INSETS = { top: 84, right: 0, bottom: 0, left: 0 };
const POPOVER_WIDTH = 350;
const POPOVER_HEIGHT = 214;

export default class ResearchScreenScript extends Core.ScriptNode {
  id = 'dynamic.upgrade-dialog';
  name = 'Research Screen';

  playerStateNodeId = Core.prop.nodeRef(null, { label: 'Player State' });
  gameplayInputNodeId = Core.prop.nodeRef(null, { label: 'Gameplay Input' });
  screenRootNodeId = Core.prop.nodeRef(null, { label: 'Screen Root' });
  mapNodeId = Core.prop.nodeRef(null, { label: 'Skill Map' });
  creditsTextNodeId = Core.prop.nodeRef(null, { label: 'Credits Text' });
  progressTextNodeId = Core.prop.nodeRef(null, { label: 'Progress Text' });
  popoverRootNodeId = Core.prop.nodeRef(null, { label: 'Skill Popover' });
  detailTitleNodeId = Core.prop.nodeRef(null, { label: 'Skill Title' });
  detailDescriptionNodeId = Core.prop.nodeRef(null, { label: 'Skill Description' });
  costTextNodeId = Core.prop.nodeRef(null, { label: 'Skill Cost' });
  purchaseButtonNodeId = Core.prop.nodeRef(null, { label: 'Learn Button' });
  purchaseLabelNodeId = Core.prop.nodeRef(null, { label: 'Learn Label' });
  zoomInButtonNodeId = Core.prop.nodeRef(null, { label: 'Zoom In' });
  zoomOutButtonNodeId = Core.prop.nodeRef(null, { label: 'Zoom Out' });
  resetViewButtonNodeId = Core.prop.nodeRef(null, { label: 'Reset View' });
  popoverCloseButtonNodeId = Core.prop.nodeRef(null, { label: 'Popover Close' });
  closeButtonNodeId = Core.prop.nodeRef(null, { label: 'Close Screen' });

  private playerState!: PlayerStateLike;
  private gameplayInput?: GameplayInputLike;
  private screenRoot!: Core.TransformNode;
  private map!: SkillTreeMapLike;
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

  resolve() {
    this.playerState = this.resolveNode<PlayerStateLike>(this.playerStateNodeId, 'PlayerState');
    this.gameplayInput = this.resolveNode<GameplayInputLike>(this.gameplayInputNodeId, 'GameplayInput');
    this.screenRoot = this.requireNodeRef<Core.TransformNode>(this.screenRootNodeId, 'Research screen');
    this.map = this.requireNodeRef<SkillTreeMapLike>(this.mapNodeId, 'Skill map');
    this.creditsText = this.requireNodeRef<Core.TextNode>(this.creditsTextNodeId, 'Credits text');
    this.progressText = this.requireNodeRef<Core.TextNode>(this.progressTextNodeId, 'Progress text');
    this.popoverRoot = this.requireNodeRef<Core.TransformNode>(this.popoverRootNodeId, 'Skill popover');
    this.detailTitle = this.requireNodeRef<Core.TextNode>(this.detailTitleNodeId, 'Skill title');
    this.detailDescription = this.requireNodeRef<Core.TextNode>(this.detailDescriptionNodeId, 'Skill description');
    this.costText = this.requireNodeRef<Core.TextNode>(this.costTextNodeId, 'Skill cost');
    this.purchaseButton = this.requireNodeRef<Core.ButtonNode>(this.purchaseButtonNodeId, 'Learn button');
    this.purchaseLabel = this.requireNodeRef<Core.TextNode>(this.purchaseLabelNodeId, 'Learn label');

    this.map.setSelectCallback((nodeId, position) => this.selectUpgrade(nodeId as UpgradeId, position));
    this.purchaseButton.setClickAction?.(() => this.purchaseSelected());
    this.requireNodeRef<Core.ButtonNode>(this.zoomInButtonNodeId, 'Zoom in').setClickAction?.(() => {
      this.clearSelection();
      this.map.zoomBy(1.2);
    });
    this.requireNodeRef<Core.ButtonNode>(this.zoomOutButtonNodeId, 'Zoom out').setClickAction?.(() => {
      this.clearSelection();
      this.map.zoomBy(0.82);
    });
    this.requireNodeRef<Core.ButtonNode>(this.resetViewButtonNodeId, 'Reset view').setClickAction?.(() => {
      this.clearSelection();
      this.map.resetView();
    });
    this.requireNodeRef<Core.ButtonNode>(this.popoverCloseButtonNodeId, 'Popover close').setClickAction?.(() => this.clearSelection());
    this.requireNodeRef<Core.ButtonNode>(this.closeButtonNodeId, 'Close screen').setClickAction?.(() => this.close());
    this.keyHandler = (event) => {
      if (!this.isOpen()) return;
      if (event.key === 'Escape') {
        if (this.selectedUpgradeId) this.clearSelection();
        else this.close();
      }
      if (event.key === 'Enter') this.purchaseSelected();
      if (event.key === '+' || event.key === '=') this.map.zoomBy(1.2);
      if (event.key === '-' || event.key === '_') this.map.zoomBy(0.82);
      if (event.key === '0') {
        this.clearSelection();
        this.map.resetView();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
    this.close();
  }

  destroy() {
    this.map?.setSelectCallback();
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
    this.map.setSelectedNode();
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

  private selectUpgrade(upgradeId: UpgradeId | undefined, nodePosition: { x: number; y: number }) {
    if (!upgradeId || !UPGRADE_DEFINITIONS[upgradeId]) return;
    this.selectedUpgradeId = upgradeId;
    this.map.setSelectedNode(upgradeId);
    const popoverCenter = this.getPopoverCenter(nodePosition);
    const popoverPosition = {
      x: popoverCenter.x - POPOVER_WIDTH * 0.5,
      y: popoverCenter.y - POPOVER_HEIGHT * 0.5,
    };
    this.popoverRoot.applySceneProps({ active: true, position: popoverPosition });
    this.setSubtreeVisible(this.popoverRoot, true);
    this.map.setInputExclusion({
      x: popoverCenter.x,
      y: popoverCenter.y,
      width: POPOVER_WIDTH + 16,
      height: POPOVER_HEIGHT + 16,
    });
    this.updateSelection();
  }

  private getPopoverCenter(nodePosition: { x: number; y: number }): { x: number; y: number } {
    const placeRight = nodePosition.x < 120;
    const x = nodePosition.x + (placeRight ? 205 : -205);
    return {
      x: Math.max(-455, Math.min(455, x)),
      y: Math.max(-155, Math.min(238, nodePosition.y)),
    };
  }

  private clearSelection() {
    this.selectedUpgradeId = undefined;
    this.map.setSelectedNode();
    this.map.setInputExclusion();
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
    this.creditsText.setText(`${this.playerState.getProfileCredits().toLocaleString('de-DE')} C`);
    this.progressText.setText(`${purchasedCount} / ${SKILL_TREE_IDS.length}`);

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
    this.map.setSelectedNode(this.selectedUpgradeId);
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
    this.detailDescription.setText(this.wrapText(definition.description ?? definition.label, 38));
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
}
