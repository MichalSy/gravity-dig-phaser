import * as Core from '@gravity-dig/game-core';
import { SKILL_TREE_BRANCHES, SKILL_TREE_IDS, UPGRADE_DEFINITIONS } from '../PlayerState/catalogs/upgrades';
import type { UpgradeDefinition, UpgradeId } from '../PlayerState/types';
import {
  CONSTELLATION_MAP_HEIGHT,
  CONSTELLATION_MAP_WIDTH,
  CONSTELLATION_ROOT,
  getConstellationNodePosition,
  getConstellationRegionPosition,
  type SkillTreeBranchId,
} from './skillTreeLayout';

type PlayerStateLike = {
  getProfileCredits(): number;
  isUpgradePurchased(upgradeId: UpgradeId): boolean;
  purchaseUpgrade(upgradeId: UpgradeId): { ok: boolean; message: string };
};

type GameplayInputLike = { setMenuOpen(open: boolean): void };
type SkillState = 'purchased' | 'available' | 'unaffordable' | 'locked';
type GraphNode = { id: string; label: string; branch: string; color: string; tier: number; x: number; y: number; state: SkillState; milestone?: boolean };
type GraphEdge = { from: string; to: string; color: string; active: boolean };
type GraphRegion = { label: string; color: string; x: number; y: number };
type SkillTreeMapLike = {
  setGraph(graph: { width: number; height: number; rootId: string; nodes: GraphNode[]; edges: GraphEdge[]; regions: GraphRegion[] }): void;
  setSelectedNode(nodeId?: string): void;
  setSelectCallback(callback?: (nodeId: string) => void): void;
  setInputInsets(insets?: { top?: number; right?: number; bottom?: number; left?: number }): void;
  zoomBy(factor: number): void;
  resetView(): void;
};

const BRANCH_ORDER: SkillTreeBranchId[] = ['movement', 'vision', 'mining', 'utility'];
type BranchId = SkillTreeBranchId;
const BRANCH_META: Record<BranchId, { label: string; color: string }> = {
  movement: { label: 'MOBILITÄT', color: '#4ade80' },
  vision: { label: 'SCANNER', color: '#38bdf8' },
  mining: { label: 'MINING', color: '#f472b6' },
  utility: { label: 'UTILITY', color: '#c084fc' },
};
const MAP_WIDTH = CONSTELLATION_MAP_WIDTH;
const MAP_HEIGHT = CONSTELLATION_MAP_HEIGHT;
const ROOT_POSITION = CONSTELLATION_ROOT;
const CLOSED_INPUT_INSETS = { top: 96, right: 0, bottom: 52, left: 0 };
const INSPECTOR_INPUT_INSETS = { top: 96, right: 430, bottom: 52, left: 0 };

export default class ResearchScreenScript extends Core.ScriptNode {
  id = 'dynamic.upgrade-dialog';
  name = 'Research Screen';

  playerStateNodeId = Core.prop.nodeRef(null, { label: 'Player State' });
  gameplayInputNodeId = Core.prop.nodeRef(null, { label: 'Gameplay Input' });
  screenRootNodeId = Core.prop.nodeRef(null, { label: 'Screen Root' });
  mapNodeId = Core.prop.nodeRef(null, { label: 'Skill Map' });
  creditsTextNodeId = Core.prop.nodeRef(null, { label: 'Credits Text' });
  progressTextNodeId = Core.prop.nodeRef(null, { label: 'Progress Text' });
  branchProgressTextNodeId = Core.prop.nodeRef(null, { label: 'Branch Progress' });
  inspectorRootNodeId = Core.prop.nodeRef(null, { label: 'Inspector Root' });
  detailBranchNodeId = Core.prop.nodeRef(null, { label: 'Detail Branch' });
  statusTextNodeId = Core.prop.nodeRef(null, { label: 'Status Text' });
  detailTitleNodeId = Core.prop.nodeRef(null, { label: 'Detail Title' });
  detailDescriptionNodeId = Core.prop.nodeRef(null, { label: 'Detail Description' });
  purchaseButtonNodeId = Core.prop.nodeRef(null, { label: 'Purchase Button' });
  purchaseLabelNodeId = Core.prop.nodeRef(null, { label: 'Purchase Label' });
  zoomInButtonNodeId = Core.prop.nodeRef(null, { label: 'Zoom In' });
  zoomOutButtonNodeId = Core.prop.nodeRef(null, { label: 'Zoom Out' });
  resetViewButtonNodeId = Core.prop.nodeRef(null, { label: 'Reset View' });
  inspectorCloseButtonNodeId = Core.prop.nodeRef(null, { label: 'Inspector Close' });
  closeButtonNodeId = Core.prop.nodeRef(null, { label: 'Close Screen' });

  private playerState!: PlayerStateLike;
  private gameplayInput?: GameplayInputLike;
  private screenRoot!: Core.TransformNode;
  private map!: SkillTreeMapLike;
  private creditsText!: Core.TextNode;
  private progressText!: Core.TextNode;
  private branchProgressText!: Core.TextNode;
  private inspectorRoot!: Core.TransformNode;
  private detailBranch!: Core.TextNode;
  private statusText!: Core.TextNode;
  private detailTitle!: Core.TextNode;
  private detailDescription!: Core.TextNode;
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
    this.branchProgressText = this.requireNodeRef<Core.TextNode>(this.branchProgressTextNodeId, 'Branch progress');
    this.inspectorRoot = this.requireNodeRef<Core.TransformNode>(this.inspectorRootNodeId, 'Skill inspector');
    this.detailBranch = this.requireNodeRef<Core.TextNode>(this.detailBranchNodeId, 'Detail branch');
    this.statusText = this.requireNodeRef<Core.TextNode>(this.statusTextNodeId, 'Status text');
    this.detailTitle = this.requireNodeRef<Core.TextNode>(this.detailTitleNodeId, 'Detail title');
    this.detailDescription = this.requireNodeRef<Core.TextNode>(this.detailDescriptionNodeId, 'Detail description');
    this.purchaseButton = this.requireNodeRef<Core.ButtonNode>(this.purchaseButtonNodeId, 'Purchase button');
    this.purchaseLabel = this.requireNodeRef<Core.TextNode>(this.purchaseLabelNodeId, 'Purchase label');

    this.map.setSelectCallback((nodeId) => this.selectUpgrade(nodeId as UpgradeId));
    this.purchaseButton.setClickAction?.(() => this.purchaseSelected());
    this.requireNodeRef<Core.ButtonNode>(this.zoomInButtonNodeId, 'Zoom in').setClickAction?.(() => this.map.zoomBy(1.2));
    this.requireNodeRef<Core.ButtonNode>(this.zoomOutButtonNodeId, 'Zoom out').setClickAction?.(() => this.map.zoomBy(0.82));
    this.requireNodeRef<Core.ButtonNode>(this.resetViewButtonNodeId, 'Reset view').setClickAction?.(() => this.map.resetView());
    this.requireNodeRef<Core.ButtonNode>(this.inspectorCloseButtonNodeId, 'Inspector close').setClickAction?.(() => this.clearSelection());
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
      if (event.key === '0') this.map.resetView();
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
    this.setSubtreeVisible(this.inspectorRoot, false);
    this.inspectorRoot.applySceneProps({ active: false });
    this.gameplayInput?.setMenuOpen(true);
    this.selectedUpgradeId = undefined;
    this.map.setSelectedNode();
    this.map.setInputInsets(CLOSED_INPUT_INSETS);
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

  private selectUpgrade(upgradeId?: UpgradeId) {
    if (!upgradeId || !UPGRADE_DEFINITIONS[upgradeId]) return;
    this.selectedUpgradeId = upgradeId;
    this.map.setSelectedNode(upgradeId);
    this.map.setInputInsets(INSPECTOR_INPUT_INSETS);
    this.inspectorRoot.applySceneProps({ active: true });
    this.setSubtreeVisible(this.inspectorRoot, true);
    this.updateSelection();
  }

  private clearSelection() {
    this.selectedUpgradeId = undefined;
    this.map.setSelectedNode();
    this.map.setInputInsets(CLOSED_INPUT_INSETS);
    this.setSubtreeVisible(this.inspectorRoot, false);
    this.inspectorRoot.applySceneProps({ active: false });
  }

  private purchaseSelected() {
    const upgradeId = this.selectedUpgradeId;
    if (!upgradeId || this.getSkillState(upgradeId) !== 'available') return;
    const result = this.playerState.purchaseUpgrade(upgradeId);
    this.statusText.setText(result.message.toUpperCase());
    this.updateGraph();
    this.updateSelection();
  }

  private updateGraph() {
    const purchasedCount = SKILL_TREE_IDS.filter((id) => this.playerState.isUpgradePurchased(id)).length;
    this.creditsText.setText(`${this.playerState.getProfileCredits().toLocaleString('de-DE')} C`);
    this.progressText.setText(`${purchasedCount} / ${SKILL_TREE_IDS.length} AKTIV`);
    this.branchProgressText.setText(BRANCH_ORDER.map((branch) => {
      const purchased = SKILL_TREE_BRANCHES[branch].filter((id) => this.playerState.isUpgradePurchased(id)).length;
      return `${BRANCH_META[branch].label} ${purchased}/13`;
    }).join('   ·   '));

    const nodes: GraphNode[] = [{
      id: 'prospector_core',
      label: UPGRADE_DEFINITIONS.prospector_core.label,
      branch: 'core',
      color: '#facc15',
      tier: 0,
      x: ROOT_POSITION.x,
      y: ROOT_POSITION.y,
      state: this.getSkillState('prospector_core'),
      milestone: true,
    }];
    const edges: GraphEdge[] = [];
    const regions: GraphRegion[] = [];

    for (const branch of BRANCH_ORDER) {
      const meta = BRANCH_META[branch];
      const ids = SKILL_TREE_BRANCHES[branch];
      ids.forEach((id, index) => {
        const tier = index + 1;
        const position = getConstellationNodePosition(branch, tier);
        nodes.push({
          id,
          label: UPGRADE_DEFINITIONS[id].label,
          branch,
          color: meta.color,
          tier,
          x: position.x,
          y: position.y,
          state: this.getSkillState(id),
          milestone: tier % 3 === 0 || tier === 13,
        });
        const previous = index === 0 ? 'prospector_core' : ids[index - 1];
        edges.push({
          from: previous,
          to: id,
          color: meta.color,
          active: this.playerState.isUpgradePurchased(previous),
        });
      });
      const regionPosition = getConstellationRegionPosition(branch);
      regions.push({
        label: meta.label,
        color: meta.color,
        x: regionPosition.x,
        y: regionPosition.y,
      });
    }
    this.map.setGraph({ width: MAP_WIDTH, height: MAP_HEIGHT, rootId: 'prospector_core', nodes, edges, regions });
    this.map.setSelectedNode(this.selectedUpgradeId);
  }

  private updateSelection() {
    const upgradeId = this.selectedUpgradeId;
    if (!upgradeId) return;
    const definition = UPGRADE_DEFINITIONS[upgradeId];
    const state = this.getSkillState(upgradeId);
    const branch = upgradeId === 'prospector_core' ? undefined : this.getBranch(upgradeId);
    const tier = this.getTier(upgradeId);
    this.detailBranch.setText(branch ? `${BRANCH_META[branch].label}  ·  TIER ${tier}` : 'ZENTRALER KERNSTERN');
    this.detailTitle.setText(this.wrapText(definition.label.toUpperCase(), 22).split('\n').slice(0, 2).join('\n'));
    this.detailDescription.setText(this.wrapText(definition.description ?? definition.label, 34));
    this.statusText.setText(this.getStatusText(definition, state));
    this.purchaseLabel.setText(this.getPurchaseLabel(definition, state));
    this.purchaseButton.enabled = state === 'available';
  }

  private getSkillState(upgradeId: UpgradeId): SkillState {
    if (this.playerState.isUpgradePurchased(upgradeId)) return 'purchased';
    const definition = UPGRADE_DEFINITIONS[upgradeId];
    if (!(definition.prerequisites ?? []).every((id) => this.playerState.isUpgradePurchased(id))) return 'locked';
    return this.playerState.getProfileCredits() >= (definition.cost.credits ?? 0) ? 'available' : 'unaffordable';
  }

  private getStatusText(definition: UpgradeDefinition, state: SkillState): string {
    if (state === 'purchased') return 'AKTIVIERT\nEFFEKT IST INSTALLIERT';
    if (state === 'available') return 'VERBINDUNG STEHT\nBEREIT ZUR AKTIVIERUNG';
    if (state === 'unaffordable') {
      const missing = Math.max(0, (definition.cost.credits ?? 0) - this.playerState.getProfileCredits());
      return `NOCH ${missing.toLocaleString('de-DE')} CREDITS\nBENÖTIGT`;
    }
    const prerequisite = definition.prerequisites?.[0];
    return prerequisite ? `BENÖTIGT\n${UPGRADE_DEFINITIONS[prerequisite].label.toUpperCase()}` : 'NOCH NICHT VERBUNDEN';
  }

  private getPurchaseLabel(definition: UpgradeDefinition, state: SkillState): string {
    if (state === 'purchased') return 'AKTIVIERT';
    if (state === 'locked') return 'NICHT VERBUNDEN';
    if (state === 'unaffordable') return `${definition.cost.credits ?? 0} C · ZU TEUER`;
    return `AKTIVIEREN · ${definition.cost.credits ?? 0} C`;
  }

  private getBranch(upgradeId: UpgradeId): BranchId | undefined {
    return BRANCH_ORDER.find((branch) => SKILL_TREE_BRANCHES[branch].includes(upgradeId));
  }

  private getTier(upgradeId: UpgradeId): number {
    if (upgradeId === 'prospector_core') return 0;
    for (const branch of BRANCH_ORDER) {
      const index = SKILL_TREE_BRANCHES[branch].indexOf(upgradeId);
      if (index >= 0) return index + 1;
    }
    return 0;
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
    return lines.slice(0, 6).join('\n');
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
