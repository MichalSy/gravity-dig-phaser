import * as Core from '@gravity-dig/game-core';
import { UPGRADE_DEFINITIONS } from '../PlayerState/catalogs/upgrades';
import type { EffectivePlayerStats, UpgradeId } from '../PlayerState/types';

type PlayerStateLike = {
  stats: EffectivePlayerStats;
  getProfileCredits(): number;
  isUpgradePurchased(upgradeId: UpgradeId): boolean;
  purchaseUpgrade(upgradeId: UpgradeId): { ok: boolean; message: string };
};

type GameplayInputLike = {
  setMenuOpen(open: boolean): void;
};

type UpgradeRow = {
  label: string;
  ids: UpgradeId[];
  stat: 'moveSpeed' | 'cargoSlots' | 'cargoStackLimit';
  suffix: string;
};

const ROWS: UpgradeRow[] = [
  { label: 'BEWEGUNGSTEMPO', ids: ['speed_mk1', 'speed_mk2', 'speed_mk3'], stat: 'moveSpeed', suffix: ' px/s' },
  { label: 'CARGO-SLOTS', ids: ['cargo_mk1', 'cargo_mk2', 'cargo_mk3'], stat: 'cargoSlots', suffix: '' },
  { label: 'STACKGRÖSSE', ids: ['cargo_stack_mk1', 'cargo_stack_mk2', 'cargo_stack_mk3'], stat: 'cargoStackLimit', suffix: '' },
];

export default class UpgradeDialogScript extends Core.ScriptNode {
  id = 'dynamic.upgrade-dialog';
  name = 'Upgrade Dialog';

  playerStateNodeId = Core.prop.nodeRef(null, { label: 'Player State' });
  gameplayInputNodeId = Core.prop.nodeRef(null, { label: 'Gameplay Input' });
  dialogRootNodeId = Core.prop.nodeRef(null, { label: 'Dialog Root' });
  creditsTextNodeId = Core.prop.nodeRef(null, { label: 'Credits Text' });
  statusTextNodeId = Core.prop.nodeRef(null, { label: 'Status Text' });
  closeButtonNodeId = Core.prop.nodeRef(null, { label: 'Close Button' });
  valueTextNodeIds = Core.prop.nodeRefList([], { label: 'Value Texts' });
  buyButtonNodeIds = Core.prop.nodeRefList([], { label: 'Buy Buttons' });
  buyLabelNodeIds = Core.prop.nodeRefList([], { label: 'Buy Labels' });

  private playerState!: PlayerStateLike;
  private dialogRoot!: Core.TransformNode;
  private gameplayInput?: GameplayInputLike;
  private creditsText!: Core.TextNode;
  private statusText!: Core.TextNode;
  private values: Core.TextNode[] = [];
  private buttons: Core.ButtonNode[] = [];
  private buttonLabels: Core.TextNode[] = [];
  private keyHandler?: (event: KeyboardEvent) => void;
  private opened = false;

  resolve() {
    this.playerState = this.resolveNode<PlayerStateLike>(this.playerStateNodeId, 'PlayerState');
    this.gameplayInput = this.resolveNode<GameplayInputLike>(this.gameplayInputNodeId, 'GameplayInput');
    this.dialogRoot = this.requireNodeRef<Core.TransformNode>(this.dialogRootNodeId, 'Dialog root');
    this.creditsText = this.requireNodeRef<Core.TextNode>(this.creditsTextNodeId, 'Credits text');
    this.statusText = this.requireNodeRef<Core.TextNode>(this.statusTextNodeId, 'Status text');
    this.values = this.valueTextNodeIds.map((id, index) => this.requireNodeRef<Core.TextNode>(id, `Value text ${index}`));
    this.buttons = this.buyButtonNodeIds.map((id, index) => this.requireNodeRef<Core.ButtonNode>(id, `Buy button ${index}`));
    this.buttonLabels = this.buyLabelNodeIds.map((id, index) => this.requireNodeRef<Core.TextNode>(id, `Buy label ${index}`));
    this.buttons.forEach((button, index) => button.setClickAction?.(() => this.purchase(index)));
    this.requireNodeRef<Core.ButtonNode>(this.closeButtonNodeId, 'Close button').setClickAction?.(() => this.close());
    this.keyHandler = (event) => {
      if (event.key === 'Escape' && this.isOpen()) this.close();
    };
    window.addEventListener('keydown', this.keyHandler);
    this.close();
  }

  destroy() {
    this.buttons.forEach((button) => button.setClickAction?.());
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = undefined;
    this.gameplayInput?.setMenuOpen(false);
  }

  open() {
    this.opened = true;
    this.dialogRoot.applySceneProps({ active: true });
    this.setDialogVisible(true);
    this.gameplayInput?.setMenuOpen(true);
    this.statusText.setText('Wähle ein Upgrade');
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

  private purchase(rowIndex: number) {
    const row = ROWS[rowIndex];
    const nextId = row?.ids.find((id) => !this.playerState.isUpgradePurchased(id));
    if (!nextId) return;
    const result = this.playerState.purchaseUpgrade(nextId);
    this.statusText.setText(result.message);
    this.updateView();
  }

  private updateView() {
    this.creditsText.setText(`${this.playerState.getProfileCredits()} CREDITS`);
    ROWS.forEach((row, index) => {
      const current = Math.round(this.playerState.stats[row.stat]);
      const nextId = row.ids.find((id) => !this.playerState.isUpgradePurchased(id));
      const next = nextId ? UPGRADE_DEFINITIONS[nextId] : undefined;
      const nextValue = next?.effects.find((effect) => effect.stat === row.stat)?.value;
      this.values[index]?.setText(next
        ? `${row.label}\n${current}${row.suffix}  →  ${Math.round(nextValue ?? current)}${row.suffix}`
        : `${row.label}\n${current}${row.suffix}  ·  MAX`);
      const cost = next?.cost.credits ?? 0;
      const affordable = Boolean(next && this.playerState.getProfileCredits() >= cost);
      if (this.buttons[index]) this.buttons[index].enabled = affordable;
      this.buttonLabels[index]?.setText(next ? `${cost} C` : 'MAX');
    });
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
