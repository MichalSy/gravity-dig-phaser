import * as Core from '@gravity-dig/game-core';
import { SKILL_TREE_BRANCHES, UPGRADE_DEFINITIONS } from '../PlayerState/catalogs/upgrades';
import type { UpgradeId } from '../PlayerState/types';

type PlayerStateLike = {
  getProfileCredits(): number;
  isUpgradePurchased(upgradeId: UpgradeId): boolean;
  purchaseUpgrade(upgradeId: UpgradeId): { ok: boolean; message: string };
};

type GameplayInputLike = {
  setMenuOpen(open: boolean): void;
};

const BRANCH_ORDER = ['movement', 'vision', 'mining', 'utility'] as const;
const SKILLS_PER_BRANCH_PAGE = 3;
const PAGE_COUNT = 5;

export default class UpgradeDialogScript extends Core.ScriptNode {
  id = 'dynamic.upgrade-dialog';
  name = 'Upgrade Dialog';

  playerStateNodeId = Core.prop.nodeRef(null, { label: 'Player State' });
  gameplayInputNodeId = Core.prop.nodeRef(null, { label: 'Gameplay Input' });
  dialogRootNodeId = Core.prop.nodeRef(null, { label: 'Dialog Root' });
  creditsTextNodeId = Core.prop.nodeRef(null, { label: 'Credits Text' });
  statusTextNodeId = Core.prop.nodeRef(null, { label: 'Status Text' });
  ringTextNodeId = Core.prop.nodeRef(null, { label: 'Ring Text' });
  previousRingButtonNodeId = Core.prop.nodeRef(null, { label: 'Previous Ring Button' });
  nextRingButtonNodeId = Core.prop.nodeRef(null, { label: 'Next Ring Button' });
  closeButtonNodeId = Core.prop.nodeRef(null, { label: 'Close Button' });
  buyButtonNodeIds = Core.prop.nodeRefList([], { label: 'Skill Buttons' });
  buyLabelNodeIds = Core.prop.nodeRefList([], { label: 'Skill Labels' });

  private playerState!: PlayerStateLike;
  private dialogRoot!: Core.TransformNode;
  private gameplayInput?: GameplayInputLike;
  private creditsText!: Core.TextNode;
  private statusText!: Core.TextNode;
  private ringText!: Core.TextNode;
  private previousRingButton!: Core.ButtonNode;
  private nextRingButton!: Core.ButtonNode;
  private buttons: Core.ButtonNode[] = [];
  private buttonLabels: Core.TextNode[] = [];
  private visibleUpgradeIds: Array<UpgradeId | undefined> = [];
  private keyHandler?: (event: KeyboardEvent) => void;
  private opened = false;
  private page = 0;

  resolve() {
    this.playerState = this.resolveNode<PlayerStateLike>(this.playerStateNodeId, 'PlayerState');
    this.gameplayInput = this.resolveNode<GameplayInputLike>(this.gameplayInputNodeId, 'GameplayInput');
    this.dialogRoot = this.requireNodeRef<Core.TransformNode>(this.dialogRootNodeId, 'Dialog root');
    this.creditsText = this.requireNodeRef<Core.TextNode>(this.creditsTextNodeId, 'Credits text');
    this.statusText = this.requireNodeRef<Core.TextNode>(this.statusTextNodeId, 'Status text');
    this.ringText = this.requireNodeRef<Core.TextNode>(this.ringTextNodeId, 'Ring text');
    this.previousRingButton = this.requireNodeRef<Core.ButtonNode>(this.previousRingButtonNodeId, 'Previous ring button');
    this.nextRingButton = this.requireNodeRef<Core.ButtonNode>(this.nextRingButtonNodeId, 'Next ring button');
    this.buttons = this.buyButtonNodeIds.map((id, index) => this.requireNodeRef<Core.ButtonNode>(id, `Skill button ${index}`));
    this.buttonLabels = this.buyLabelNodeIds.map((id, index) => this.requireNodeRef<Core.TextNode>(id, `Skill label ${index}`));
    this.buttons.forEach((button, index) => button.setClickAction?.(() => this.purchase(this.visibleUpgradeIds[index])));
    this.previousRingButton.setClickAction?.(() => this.changePage(-1));
    this.nextRingButton.setClickAction?.(() => this.changePage(1));
    this.requireNodeRef<Core.ButtonNode>(this.closeButtonNodeId, 'Close button').setClickAction?.(() => this.close());
    this.keyHandler = (event) => {
      if (!this.isOpen()) return;
      if (event.key === 'Escape') this.close();
      if (event.key === 'ArrowLeft') this.changePage(-1);
      if (event.key === 'ArrowRight') this.changePage(1);
    };
    window.addEventListener('keydown', this.keyHandler);
    this.close();
  }

  destroy() {
    this.buttons.forEach((button) => button.setClickAction?.());
    this.previousRingButton?.setClickAction?.();
    this.nextRingButton?.setClickAction?.();
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = undefined;
    this.gameplayInput?.setMenuOpen(false);
  }

  open() {
    this.opened = true;
    this.dialogRoot.applySceneProps({ active: true });
    this.setDialogVisible(true);
    this.gameplayInput?.setMenuOpen(true);
    this.statusText.setText('53 Skills in fünf Forschungsringen. Mit Pfeilen oder Ring-Buttons navigieren.');
    this.updateView();
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

  private purchase(upgradeId?: UpgradeId) {
    if (!upgradeId) {
      this.statusText.setText('Dies ist nur der Mittelpunkt des aktuellen Forschungsrings.');
      return;
    }
    const definition = UPGRADE_DEFINITIONS[upgradeId];
    const result = this.playerState.purchaseUpgrade(upgradeId);
    this.statusText.setText(`${definition.description ?? definition.label}  ·  ${result.message}`);
    this.updateView();
  }

  private changePage(delta: number) {
    const nextPage = Math.max(0, Math.min(PAGE_COUNT - 1, this.page + delta));
    if (nextPage === this.page) return;
    this.page = nextPage;
    this.statusText.setText(`Forschungsring ${this.page + 1} von ${PAGE_COUNT}. Vorgänger aus früheren Ringen bleiben erforderlich.`);
    this.updateView();
  }

  private updateView() {
    this.creditsText.setText(`${this.playerState.getProfileCredits()} CREDITS`);
    const start = Math.min(this.page * SKILLS_PER_BRANCH_PAGE, SKILL_TREE_BRANCHES.movement.length - SKILLS_PER_BRANCH_PAGE);
    this.visibleUpgradeIds = [this.page === 0 ? 'prospector_core' : undefined];
    for (const branch of BRANCH_ORDER) {
      this.visibleUpgradeIds.push(...SKILL_TREE_BRANCHES[branch].slice(start, start + SKILLS_PER_BRANCH_PAGE));
    }

    const firstTier = start + 1;
    this.ringText.setText(`RING ${this.page + 1}/${PAGE_COUNT} · TIER ${firstTier}-${firstTier + 2}`);
    this.buttonLabels[0]?.setText(this.page === 0 ? this.formatUpgrade('prospector_core') : `ORBIT ${this.page + 1}\nTIER ${firstTier}-${firstTier + 2}`);
    this.buttons[0].enabled = true;

    for (let index = 1; index < this.buttons.length; index += 1) {
      const upgradeId = this.visibleUpgradeIds[index];
      this.buttonLabels[index]?.setText(upgradeId ? this.formatUpgrade(upgradeId) : 'LEER');
      this.buttons[index].enabled = true;
    }
    this.previousRingButton.enabled = this.page > 0;
    this.nextRingButton.enabled = this.page < PAGE_COUNT - 1;
  }

  private formatUpgrade(upgradeId: UpgradeId): string {
    const definition = UPGRADE_DEFINITIONS[upgradeId];
    const purchased = this.playerState.isUpgradePurchased(upgradeId);
    const unlocked = (definition.prerequisites ?? []).every((id) => this.playerState.isUpgradePurchased(id));
    const cost = definition.cost.credits ?? 0;
    const state = purchased ? 'INSTALLIERT' : unlocked ? `${cost} C` : 'GESPERRT';
    return `${this.compactLabel(definition.label)}\n${state}`;
  }

  private compactLabel(label: string): string {
    if (label.length <= 18) return label;
    const middle = label.length / 2;
    const breakpoints = [...label].flatMap((character, index) => character === ' ' || character === '-' ? [index + 1] : []);
    const splitAt = breakpoints.sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle))[0] ?? 17;
    const first = label.slice(0, splitAt).trim();
    const second = label.slice(splitAt).trim();
    return `${first}\n${second}`;
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
