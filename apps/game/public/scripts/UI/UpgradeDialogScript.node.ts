import * as Core from '@gravity-dig/game-core';
import { SKILL_TREE_BRANCHES, SKILL_TREE_IDS, UPGRADE_DEFINITIONS } from '../PlayerState/catalogs/upgrades';
import type { UpgradeDefinition, UpgradeId } from '../PlayerState/types';

type PlayerStateLike = {
  getProfileCredits(): number;
  isUpgradePurchased(upgradeId: UpgradeId): boolean;
  purchaseUpgrade(upgradeId: UpgradeId): { ok: boolean; message: string };
};

type GameplayInputLike = {
  setMenuOpen(open: boolean): void;
};

type SkillState = 'purchased' | 'available' | 'unaffordable' | 'locked';

const BRANCH_ORDER = ['movement', 'vision', 'mining', 'utility'] as const;
const BRANCH_LABELS = { movement: 'MOBILITÄT', vision: 'SCANNER', mining: 'MINING', utility: 'UTILITY' } as const;
const BRANCH_COLORS = { movement: '#4ade80', vision: '#38bdf8', mining: '#f472b6', utility: '#c084fc' } as const;
const STATE_COLORS: Record<SkillState, string> = {
  purchased: '#4ade80',
  available: '#facc15',
  unaffordable: '#fb7185',
  locked: '#94a3b8',
};
const SKILLS_PER_BRANCH_PAGE = 3;
const PAGE_COUNT = 5;

export default class UpgradeDialogScript extends Core.ScriptNode {
  id = 'dynamic.upgrade-dialog';
  name = 'Upgrade Dialog';

  playerStateNodeId = Core.prop.nodeRef(null, { label: 'Player State' });
  gameplayInputNodeId = Core.prop.nodeRef(null, { label: 'Gameplay Input' });
  dialogRootNodeId = Core.prop.nodeRef(null, { label: 'Dialog Root' });
  creditsTextNodeId = Core.prop.nodeRef(null, { label: 'Credits Text' });
  progressTextNodeId = Core.prop.nodeRef(null, { label: 'Progress Text' });
  statusTextNodeId = Core.prop.nodeRef(null, { label: 'Status Text' });
  detailTitleNodeId = Core.prop.nodeRef(null, { label: 'Detail Title' });
  detailDescriptionNodeId = Core.prop.nodeRef(null, { label: 'Detail Description' });
  ringTextNodeId = Core.prop.nodeRef(null, { label: 'Tier Page Text' });
  previousRingButtonNodeId = Core.prop.nodeRef(null, { label: 'Previous Tier Page' });
  nextRingButtonNodeId = Core.prop.nodeRef(null, { label: 'Next Tier Page' });
  purchaseButtonNodeId = Core.prop.nodeRef(null, { label: 'Purchase Button' });
  purchaseLabelNodeId = Core.prop.nodeRef(null, { label: 'Purchase Label' });
  closeButtonNodeId = Core.prop.nodeRef(null, { label: 'Close Button' });
  buyButtonNodeIds = Core.prop.nodeRefList([], { label: 'Skill Buttons' });
  buyLabelNodeIds = Core.prop.nodeRefList([], { label: 'Skill Labels' });
  connectorNodeIds = Core.prop.nodeRefList([], { label: 'Connectors' });
  branchLabelNodeIds = Core.prop.nodeRefList([], { label: 'Branch Labels' });

  private playerState!: PlayerStateLike;
  private dialogRoot!: Core.TransformNode;
  private gameplayInput?: GameplayInputLike;
  private creditsText!: Core.TextNode;
  private progressText!: Core.TextNode;
  private statusText!: Core.TextNode;
  private detailTitle!: Core.TextNode;
  private detailDescription!: Core.TextNode;
  private ringText!: Core.TextNode;
  private previousRingButton!: Core.ButtonNode;
  private nextRingButton!: Core.ButtonNode;
  private purchaseButton!: Core.ButtonNode;
  private purchaseLabel!: Core.TextNode;
  private buttons: Core.ButtonNode[] = [];
  private buttonLabels: Core.TextNode[] = [];
  private connectors: Core.RectangleNode[] = [];
  private branchLabels: Core.TextNode[] = [];
  private visibleUpgradeIds: Array<UpgradeId | undefined> = [];
  private selectedUpgradeId?: UpgradeId;
  private keyHandler?: (event: KeyboardEvent) => void;
  private opened = false;
  private page = 0;

  resolve() {
    this.playerState = this.resolveNode<PlayerStateLike>(this.playerStateNodeId, 'PlayerState');
    this.gameplayInput = this.resolveNode<GameplayInputLike>(this.gameplayInputNodeId, 'GameplayInput');
    this.dialogRoot = this.requireNodeRef<Core.TransformNode>(this.dialogRootNodeId, 'Dialog root');
    this.creditsText = this.requireNodeRef<Core.TextNode>(this.creditsTextNodeId, 'Credits text');
    this.progressText = this.requireNodeRef<Core.TextNode>(this.progressTextNodeId, 'Progress text');
    this.statusText = this.requireNodeRef<Core.TextNode>(this.statusTextNodeId, 'Status text');
    this.detailTitle = this.requireNodeRef<Core.TextNode>(this.detailTitleNodeId, 'Detail title');
    this.detailDescription = this.requireNodeRef<Core.TextNode>(this.detailDescriptionNodeId, 'Detail description');
    this.ringText = this.requireNodeRef<Core.TextNode>(this.ringTextNodeId, 'Tier page text');
    this.previousRingButton = this.requireNodeRef<Core.ButtonNode>(this.previousRingButtonNodeId, 'Previous tier button');
    this.nextRingButton = this.requireNodeRef<Core.ButtonNode>(this.nextRingButtonNodeId, 'Next tier button');
    this.purchaseButton = this.requireNodeRef<Core.ButtonNode>(this.purchaseButtonNodeId, 'Purchase button');
    this.purchaseLabel = this.requireNodeRef<Core.TextNode>(this.purchaseLabelNodeId, 'Purchase label');
    this.buttons = this.buyButtonNodeIds.map((id, index) => this.requireNodeRef<Core.ButtonNode>(id, `Skill button ${index}`));
    this.buttonLabels = this.buyLabelNodeIds.map((id, index) => this.requireNodeRef<Core.TextNode>(id, `Skill label ${index}`));
    this.connectors = this.connectorNodeIds.map((id, index) => this.requireNodeRef<Core.RectangleNode>(id, `Connector ${index}`));
    this.branchLabels = this.branchLabelNodeIds.map((id, index) => this.requireNodeRef<Core.TextNode>(id, `Branch label ${index}`));

    this.buttons.forEach((button, index) => button.setCallbacks({
      onHover: () => this.selectUpgrade(this.visibleUpgradeIds[index]),
      onActivate: () => this.selectUpgrade(this.visibleUpgradeIds[index]),
    }));
    this.previousRingButton.setClickAction?.(() => this.changePage(-1));
    this.nextRingButton.setClickAction?.(() => this.changePage(1));
    this.purchaseButton.setClickAction?.(() => this.purchaseSelected());
    this.requireNodeRef<Core.ButtonNode>(this.closeButtonNodeId, 'Close button').setClickAction?.(() => this.close());
    this.keyHandler = (event) => {
      if (!this.isOpen()) return;
      if (event.key === 'Escape') this.close();
      if (event.key === 'ArrowLeft') this.changePage(-1);
      if (event.key === 'ArrowRight') this.changePage(1);
      if (event.key === 'Enter') this.purchaseSelected();
    };
    window.addEventListener('keydown', this.keyHandler);
    this.close();
  }

  destroy() {
    this.buttons.forEach((button) => button.setCallbacks({}));
    this.previousRingButton?.setClickAction?.();
    this.nextRingButton?.setClickAction?.();
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
    this.updateView(true);
  }

  close() {
    this.opened = false;
    if (this.dialogRoot) {
      this.setDialogVisible(false);
      this.dialogRoot.applySceneProps({ active: false });
    }
    this.gameplayInput?.setMenuOpen(false);
  }

  isOpen() {
    return this.opened;
  }

  private selectUpgrade(upgradeId?: UpgradeId) {
    if (!upgradeId) return;
    this.selectedUpgradeId = upgradeId;
    this.updateSelection();
  }

  private purchaseSelected() {
    const upgradeId = this.selectedUpgradeId;
    if (!upgradeId || this.getSkillState(upgradeId) !== 'available') return;
    const result = this.playerState.purchaseUpgrade(upgradeId);
    this.statusText.setText(result.message.toUpperCase());
    this.buttons[this.visibleUpgradeIds.indexOf(upgradeId)]?.flash(260);
    this.updateView(false);
  }

  private changePage(delta: number) {
    const nextPage = Math.max(0, Math.min(PAGE_COUNT - 1, this.page + delta));
    if (nextPage === this.page) return;
    this.page = nextPage;
    this.selectedUpgradeId = undefined;
    this.updateView(true);
  }

  private updateView(selectRecommended: boolean) {
    const credits = this.playerState.getProfileCredits();
    const purchasedCount = SKILL_TREE_IDS.filter((id) => this.playerState.isUpgradePurchased(id)).length;
    this.creditsText.setText(`${credits.toLocaleString('de-DE')} CREDITS`);
    this.progressText.setText(`${purchasedCount} / ${SKILL_TREE_IDS.length} INSTALLIERT`);

    const start = Math.min(this.page * SKILLS_PER_BRANCH_PAGE, SKILL_TREE_BRANCHES.movement.length - SKILLS_PER_BRANCH_PAGE);
    this.visibleUpgradeIds = [this.page === 0 ? 'prospector_core' : undefined];
    for (const branch of BRANCH_ORDER) this.visibleUpgradeIds.push(...SKILL_TREE_BRANCHES[branch].slice(start, start + SKILLS_PER_BRANCH_PAGE));
    const firstTier = start + 1;
    this.ringText.setText(`TIER ${firstTier}–${firstTier + 2}  ·  ${this.page + 1}/${PAGE_COUNT}`);

    this.buttonLabels[0]?.setText(this.page === 0 ? this.formatNodeLabel('prospector_core', 0) : `SEKTOR ${this.page + 1}\nTIER ${firstTier}–${firstTier + 2}`);
    this.buttonLabels[0]?.applySceneProps({ color: this.page === 0 ? STATE_COLORS[this.getSkillState('prospector_core')] : '#facc15' });

    for (let index = 1; index < this.buttons.length; index += 1) {
      const upgradeId = this.visibleUpgradeIds[index];
      if (!upgradeId) continue;
      const tier = start + ((index - 1) % SKILLS_PER_BRANCH_PAGE) + 1;
      const state = this.getSkillState(upgradeId);
      this.buttonLabels[index]?.setText(this.formatNodeLabel(upgradeId, tier));
      this.buttonLabels[index]?.applySceneProps({ color: STATE_COLORS[state] });
      this.buttons[index].enabled = true;
    }

    BRANCH_ORDER.forEach((branch, branchIndex) => {
      const purchased = SKILL_TREE_BRANCHES[branch].filter((id) => this.playerState.isUpgradePurchased(id)).length;
      this.branchLabels[branchIndex]?.setText(`${BRANCH_LABELS[branch]}  ${purchased}/13`);
      this.updateBranchConnectors(branch, branchIndex, start);
    });

    this.previousRingButton.enabled = this.page > 0;
    this.nextRingButton.enabled = this.page < PAGE_COUNT - 1;
    if (selectRecommended || !this.selectedUpgradeId || !this.visibleUpgradeIds.includes(this.selectedUpgradeId)) {
      this.selectedUpgradeId = this.recommendedVisibleUpgrade();
    }
    this.updateSelection();
  }

  private updateSelection() {
    this.buttons.forEach((button, index) => button.setSelected(Boolean(this.visibleUpgradeIds[index] && this.visibleUpgradeIds[index] === this.selectedUpgradeId)));
    const upgradeId = this.selectedUpgradeId;
    if (!upgradeId) {
      this.detailTitle.setText('FORSCHUNGSKNOTEN AUSWÄHLEN');
      this.detailDescription.setText('Jeder Pfad läuft von links nach rechts. Grün ist installiert, Gelb kann gekauft werden.');
      this.statusText.setText('GRAU = GESPERRT  ·  ROT = ZU TEUER');
      this.purchaseLabel.setText('KNOTEN WÄHLEN');
      this.purchaseButton.enabled = false;
      return;
    }

    const definition = UPGRADE_DEFINITIONS[upgradeId];
    const tier = this.getTier(upgradeId);
    const state = this.getSkillState(upgradeId);
    this.detailTitle.setText(`${definition.label.toUpperCase()}  ·  ${tier === 0 ? 'KERN' : `TIER ${tier}`}`);
    this.detailTitle.applySceneProps({ color: STATE_COLORS[state] });
    this.detailDescription.setText(this.wrapText(definition.description ?? definition.label, 88));
    this.statusText.setText(this.getStatusText(definition, state));
    this.statusText.applySceneProps({ color: STATE_COLORS[state] });
    this.purchaseLabel.setText(this.getPurchaseLabel(definition, state));
    this.purchaseButton.enabled = state === 'available';
  }

  private updateBranchConnectors(branch: keyof typeof SKILL_TREE_BRANCHES, branchIndex: number, start: number) {
    const branchIds = SKILL_TREE_BRANCHES[branch];
    const visible = branchIds.slice(start, start + SKILLS_PER_BRANCH_PAGE);
    const predecessor = start === 0 ? 'prospector_core' : branchIds[start - 1];
    const sources = [predecessor, visible[0], visible[1]];
    sources.forEach((sourceId, connectorIndex) => {
      const active = Boolean(sourceId && this.playerState.isUpgradePurchased(sourceId));
      this.connectors[branchIndex * 3 + connectorIndex]?.applySceneProps({
        fillColor: active ? BRANCH_COLORS[branch] : '#334155',
        fillAlpha: active ? 0.95 : 0.6,
      });
    });
  }

  private formatNodeLabel(upgradeId: UpgradeId, tier: number): string {
    const definition = UPGRADE_DEFINITIONS[upgradeId];
    const state = this.getSkillState(upgradeId);
    const stateLabel = state === 'purchased' ? 'OK' : state === 'locked' ? 'LOCK' : `${definition.cost.credits ?? 0} C`;
    return `${tier === 0 ? 'KERN' : `T${tier}`} · ${stateLabel}\n${this.compactLabel(definition.label)}`;
  }

  private getSkillState(upgradeId: UpgradeId): SkillState {
    if (this.playerState.isUpgradePurchased(upgradeId)) return 'purchased';
    const definition = UPGRADE_DEFINITIONS[upgradeId];
    const unlocked = (definition.prerequisites ?? []).every((id) => this.playerState.isUpgradePurchased(id));
    if (!unlocked) return 'locked';
    return this.playerState.getProfileCredits() >= (definition.cost.credits ?? 0) ? 'available' : 'unaffordable';
  }

  private getStatusText(definition: UpgradeDefinition, state: SkillState): string {
    if (state === 'purchased') return 'INSTALLIERT · EFFEKT IST AKTIV';
    if (state === 'available') return 'VORAUSSETZUNG ERFÜLLT · BEREIT ZUM KAUF';
    if (state === 'unaffordable') {
      const missing = Math.max(0, (definition.cost.credits ?? 0) - this.playerState.getProfileCredits());
      return `NOCH ${missing.toLocaleString('de-DE')} CREDITS BENÖTIGT`;
    }
    const prerequisite = definition.prerequisites?.[0];
    return prerequisite ? `BENÖTIGT: ${UPGRADE_DEFINITIONS[prerequisite].label.toUpperCase()}` : 'NOCH NICHT VERFÜGBAR';
  }

  private getPurchaseLabel(definition: UpgradeDefinition, state: SkillState): string {
    if (state === 'purchased') return 'INSTALLIERT';
    if (state === 'locked') return 'GESPERRT';
    if (state === 'unaffordable') return `${definition.cost.credits ?? 0} C · ZU TEUER`;
    return `KAUFEN · ${definition.cost.credits ?? 0} C`;
  }

  private getTier(upgradeId: UpgradeId): number {
    if (upgradeId === 'prospector_core') return 0;
    for (const branch of BRANCH_ORDER) {
      const index = SKILL_TREE_BRANCHES[branch].indexOf(upgradeId);
      if (index >= 0) return index + 1;
    }
    return 0;
  }

  private recommendedVisibleUpgrade(): UpgradeId | undefined {
    return this.visibleUpgradeIds.find((id) => id && this.getSkillState(id) === 'available')
      ?? this.visibleUpgradeIds.find((id) => id && !this.playerState.isUpgradePurchased(id))
      ?? this.visibleUpgradeIds.find((id): id is UpgradeId => Boolean(id));
  }

  private compactLabel(label: string): string {
    if (label.length <= 20) return label.toUpperCase();
    const middle = label.length / 2;
    const breakpoints = [...label].flatMap((character, index) => character === ' ' || character === '-' ? [index + 1] : []);
    const splitAt = breakpoints.sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle))[0] ?? 18;
    return `${label.slice(0, splitAt).trim()}\n${label.slice(splitAt).trim()}`.toUpperCase();
  }

  private wrapText(text: string, maxLineLength: number): string {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      if (line && `${line} ${word}`.length > maxLineLength) {
        lines.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
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
