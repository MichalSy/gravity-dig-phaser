import * as Core from '@gravity-dig/game-core';
import { SKILL_TREE_BRANCHES, SKILL_TREE_IDS, UPGRADE_DEFINITIONS } from '../PlayerState/catalogs/upgrades';
import type { UpgradeDefinition, UpgradeId } from '../PlayerState/types';

type PlayerStateLike = {
  getProfileCredits(): number;
  isUpgradePurchased(upgradeId: UpgradeId): boolean;
  purchaseUpgrade(upgradeId: UpgradeId): { ok: boolean; message: string };
};

type GameplayInputLike = { setMenuOpen(open: boolean): void };
type SkillState = 'purchased' | 'available' | 'unaffordable' | 'locked';
type GraphNode = { id: string; label: string; branch: string; color: string; tier: number; x: number; y: number; state: SkillState; milestone?: boolean };
type GraphEdge = { from: string; to: string; color: string; active: boolean };
type SkillTreeMapLike = {
  setGraph(graph: { width: number; height: number; rootId: string; nodes: GraphNode[]; edges: GraphEdge[] }): void;
  setSelectedNode(nodeId?: string): void;
  setSelectCallback(callback?: (nodeId: string) => void): void;
  zoomBy(factor: number): void;
  resetView(): void;
  focusNode(nodeId: string, preferredZoom?: number): void;
};

const BRANCH_ORDER = ['movement', 'vision', 'mining', 'utility'] as const;
const BRANCH_META = {
  movement: { label: 'MOBILITÄT', color: '#4ade80', end: { x: 190, y: 115 }, control1: { x: 930, y: 650 }, control2: { x: 340, y: 460 }, phase: 0.2 },
  vision: { label: 'SCANNER', color: '#38bdf8', end: { x: 720, y: 80 }, control1: { x: 1040, y: 620 }, control2: { x: 690, y: 380 }, phase: 1.1 },
  mining: { label: 'MINING', color: '#f472b6', end: { x: 1480, y: 80 }, control1: { x: 1160, y: 620 }, control2: { x: 1510, y: 380 }, phase: 2.1 },
  utility: { label: 'UTILITY', color: '#c084fc', end: { x: 2010, y: 115 }, control1: { x: 1270, y: 650 }, control2: { x: 1860, y: 460 }, phase: 3.2 },
} as const;
const MAP_WIDTH = 2200;
const MAP_HEIGHT = 900;
const ROOT_POSITION = { x: 1100, y: 820 };

export default class UpgradeDialogScript extends Core.ScriptNode {
  id = 'dynamic.upgrade-dialog';
  name = 'Upgrade Dialog';

  playerStateNodeId = Core.prop.nodeRef(null, { label: 'Player State' });
  gameplayInputNodeId = Core.prop.nodeRef(null, { label: 'Gameplay Input' });
  dialogRootNodeId = Core.prop.nodeRef(null, { label: 'Dialog Root' });
  mapNodeId = Core.prop.nodeRef(null, { label: 'Skill Map' });
  creditsTextNodeId = Core.prop.nodeRef(null, { label: 'Credits Text' });
  progressTextNodeId = Core.prop.nodeRef(null, { label: 'Progress Text' });
  statusTextNodeId = Core.prop.nodeRef(null, { label: 'Status Text' });
  detailTitleNodeId = Core.prop.nodeRef(null, { label: 'Detail Title' });
  detailDescriptionNodeId = Core.prop.nodeRef(null, { label: 'Detail Description' });
  purchaseButtonNodeId = Core.prop.nodeRef(null, { label: 'Purchase Button' });
  purchaseLabelNodeId = Core.prop.nodeRef(null, { label: 'Purchase Label' });
  zoomInButtonNodeId = Core.prop.nodeRef(null, { label: 'Zoom In' });
  zoomOutButtonNodeId = Core.prop.nodeRef(null, { label: 'Zoom Out' });
  resetViewButtonNodeId = Core.prop.nodeRef(null, { label: 'Reset View' });
  closeButtonNodeId = Core.prop.nodeRef(null, { label: 'Close Button' });

  private playerState!: PlayerStateLike;
  private gameplayInput?: GameplayInputLike;
  private dialogRoot!: Core.TransformNode;
  private map!: SkillTreeMapLike;
  private creditsText!: Core.TextNode;
  private progressText!: Core.TextNode;
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
    this.dialogRoot = this.requireNodeRef<Core.TransformNode>(this.dialogRootNodeId, 'Dialog root');
    this.map = this.requireNodeRef<SkillTreeMapLike>(this.mapNodeId, 'Skill map');
    this.creditsText = this.requireNodeRef<Core.TextNode>(this.creditsTextNodeId, 'Credits text');
    this.progressText = this.requireNodeRef<Core.TextNode>(this.progressTextNodeId, 'Progress text');
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
    this.requireNodeRef<Core.ButtonNode>(this.closeButtonNodeId, 'Close').setClickAction?.(() => this.close());
    this.keyHandler = (event) => {
      if (!this.isOpen()) return;
      if (event.key === 'Escape') this.close();
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
    this.dialogRoot.applySceneProps({ active: true });
    this.setDialogVisible(true);
    this.gameplayInput?.setMenuOpen(true);
    this.updateGraph();
    if (!this.selectedUpgradeId) this.selectUpgrade(this.recommendedUpgrade());
    else this.updateSelection();
  }

  close() {
    this.opened = false;
    if (this.dialogRoot) {
      this.setDialogVisible(false);
      this.dialogRoot.applySceneProps({ active: false });
    }
    this.gameplayInput?.setMenuOpen(false);
  }

  isOpen() { return this.opened; }

  private selectUpgrade(upgradeId?: UpgradeId) {
    if (!upgradeId || !UPGRADE_DEFINITIONS[upgradeId]) return;
    this.selectedUpgradeId = upgradeId;
    this.map.setSelectedNode(upgradeId);
    this.updateSelection();
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
    this.creditsText.setText(`${this.playerState.getProfileCredits().toLocaleString('de-DE')} CREDITS`);
    this.progressText.setText(`${purchasedCount} / ${SKILL_TREE_IDS.length} STERNE AKTIV`);
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

    for (const branch of BRANCH_ORDER) {
      const meta = BRANCH_META[branch];
      const ids = SKILL_TREE_BRANCHES[branch];
      ids.forEach((id, index) => {
        const tier = index + 1;
        const t = tier / ids.length;
        const point = this.bezierPoint(ROOT_POSITION, meta.control1, meta.control2, meta.end, t);
        const directionX = meta.end.x - ROOT_POSITION.x;
        const directionY = meta.end.y - ROOT_POSITION.y;
        const directionLength = Math.hypot(directionX, directionY) || 1;
        const perpendicularX = -directionY / directionLength;
        const perpendicularY = directionX / directionLength;
        const wave = Math.sin(t * Math.PI * 6 + meta.phase) * (tier % 3 === 0 ? 54 : 118) * Math.sin(Math.PI * t);
        point.x += perpendicularX * wave;
        point.y += perpendicularY * wave;
        nodes.push({
          id,
          label: UPGRADE_DEFINITIONS[id].label,
          branch,
          color: meta.color,
          tier,
          x: point.x,
          y: point.y,
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
    }
    this.map.setGraph({ width: MAP_WIDTH, height: MAP_HEIGHT, rootId: 'prospector_core', nodes, edges });
    this.map.setSelectedNode(this.selectedUpgradeId);
  }

  private updateSelection() {
    const upgradeId = this.selectedUpgradeId;
    if (!upgradeId) {
      this.detailTitle.setText('STERN AUSWÄHLEN');
      this.detailDescription.setText('Ziehen zum Navigieren · Mausrad oder Pinch zum Zoomen');
      this.statusText.setText('LEUCHTENDE LINIEN ZEIGEN DEINEN AKTIVEN FORSCHUNGSWEG');
      this.purchaseLabel.setText('STERN WÄHLEN');
      this.purchaseButton.enabled = false;
      return;
    }
    const definition = UPGRADE_DEFINITIONS[upgradeId];
    const state = this.getSkillState(upgradeId);
    this.detailTitle.setText(`${definition.label.toUpperCase()}  ·  ${this.getTier(upgradeId) === 0 ? 'KERNSTERN' : `TIER ${this.getTier(upgradeId)}`}`);
    this.detailDescription.setText(this.wrapText(definition.description ?? definition.label, 88));
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
    if (state === 'purchased') return 'AKTIVIERT · EFFEKT IST INSTALLIERT';
    if (state === 'available') return 'VERBINDUNG STEHT · BEREIT ZUR AKTIVIERUNG';
    if (state === 'unaffordable') {
      const missing = Math.max(0, (definition.cost.credits ?? 0) - this.playerState.getProfileCredits());
      return `NOCH ${missing.toLocaleString('de-DE')} CREDITS BENÖTIGT`;
    }
    const prerequisite = definition.prerequisites?.[0];
    return prerequisite ? `BENÖTIGT: ${UPGRADE_DEFINITIONS[prerequisite].label.toUpperCase()}` : 'NOCH NICHT VERBUNDEN';
  }

  private getPurchaseLabel(definition: UpgradeDefinition, state: SkillState): string {
    if (state === 'purchased') return 'AKTIVIERT';
    if (state === 'locked') return 'NICHT VERBUNDEN';
    if (state === 'unaffordable') return `${definition.cost.credits ?? 0} C · ZU TEUER`;
    return `AKTIVIEREN · ${definition.cost.credits ?? 0} C`;
  }

  private getTier(upgradeId: UpgradeId): number {
    if (upgradeId === 'prospector_core') return 0;
    for (const branch of BRANCH_ORDER) {
      const index = SKILL_TREE_BRANCHES[branch].indexOf(upgradeId);
      if (index >= 0) return index + 1;
    }
    return 0;
  }

  private recommendedUpgrade(): UpgradeId {
    return SKILL_TREE_IDS.find((id) => this.getSkillState(id) === 'available')
      ?? SKILL_TREE_IDS.find((id) => !this.playerState.isUpgradePurchased(id))
      ?? 'prospector_core';
  }

  private bezierPoint(
    p0: { x: number; y: number },
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    t: number,
  ): { x: number; y: number } {
    const inverse = 1 - t;
    return {
      x: inverse ** 3 * p0.x + 3 * inverse ** 2 * t * p1.x + 3 * inverse * t ** 2 * p2.x + t ** 3 * p3.x,
      y: inverse ** 3 * p0.y + 3 * inverse ** 2 * t * p1.y + 3 * inverse * t ** 2 * p2.y + t ** 3 * p3.y,
    };
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
    return lines.slice(0, 2).join('\n');
  }

  private setDialogVisible(visible: boolean) {
    const visit = (node: Core.GameNode) => {
      if ('visible' in node) node.applySceneProps({ visible });
      node.children.forEach(visit);
    };
    visit(this.dialogRoot);
    this.dialogRoot.getSceneObjectsInHierarchy().forEach((object) => {
      (object as { setVisible?(value: boolean): unknown }).setVisible?.(visible);
    });
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
