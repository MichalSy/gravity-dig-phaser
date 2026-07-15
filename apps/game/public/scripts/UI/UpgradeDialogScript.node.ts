import * as Core from '@gravity-dig/game-core';
import { SKILL_TREE_IDS, UPGRADE_DEFINITIONS } from '../PlayerState/catalogs/upgrades';
import type { UpgradeId } from '../PlayerState/types';

type PlayerStateLike = {
  getProfileCredits(): number;
  isUpgradePurchased(upgradeId: UpgradeId): boolean;
  purchaseUpgrade(upgradeId: UpgradeId): { ok: boolean; message: string };
};

type GameplayInputLike = {
  setMenuOpen(open: boolean): void;
};

export default class UpgradeDialogScript extends Core.ScriptNode {
  id = 'dynamic.upgrade-dialog';
  name = 'Upgrade Dialog';

  playerStateNodeId = Core.prop.nodeRef(null, { label: 'Player State' });
  gameplayInputNodeId = Core.prop.nodeRef(null, { label: 'Gameplay Input' });
  dialogRootNodeId = Core.prop.nodeRef(null, { label: 'Dialog Root' });
  creditsTextNodeId = Core.prop.nodeRef(null, { label: 'Credits Text' });
  statusTextNodeId = Core.prop.nodeRef(null, { label: 'Status Text' });
  closeButtonNodeId = Core.prop.nodeRef(null, { label: 'Close Button' });
  buyButtonNodeIds = Core.prop.nodeRefList([], { label: 'Skill Buttons' });
  buyLabelNodeIds = Core.prop.nodeRefList([], { label: 'Skill Labels' });

  private playerState!: PlayerStateLike;
  private dialogRoot!: Core.TransformNode;
  private gameplayInput?: GameplayInputLike;
  private creditsText!: Core.TextNode;
  private statusText!: Core.TextNode;
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
    this.buttons = this.buyButtonNodeIds.map((id, index) => this.requireNodeRef<Core.ButtonNode>(id, `Skill button ${index}`));
    this.buttonLabels = this.buyLabelNodeIds.map((id, index) => this.requireNodeRef<Core.TextNode>(id, `Skill label ${index}`));
    this.buttons.forEach((button, index) => button.setClickAction?.(() => this.purchase(SKILL_TREE_IDS[index])));
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
    this.statusText.setText('Vom Kern aus in vier Richtungen forschen. Jeder Knoten braucht seinen Vorgänger.');
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
    if (!upgradeId) return;
    const definition = UPGRADE_DEFINITIONS[upgradeId];
    const result = this.playerState.purchaseUpgrade(upgradeId);
    this.statusText.setText(`${definition.description ?? definition.label}  ·  ${result.message}`);
    this.updateView();
  }

  private updateView() {
    this.creditsText.setText(`${this.playerState.getProfileCredits()} CREDITS`);
    SKILL_TREE_IDS.forEach((upgradeId, index) => {
      const definition = UPGRADE_DEFINITIONS[upgradeId];
      const purchased = this.playerState.isUpgradePurchased(upgradeId);
      const unlocked = (definition.prerequisites ?? []).every((id) => this.playerState.isUpgradePurchased(id));
      const cost = definition.cost.credits ?? 0;
      const state = purchased ? 'INSTALLIERT' : unlocked ? `${cost} C` : 'GESPERRT';
      this.buttonLabels[index]?.setText(`${definition.label}\n${state}`);
      if (this.buttons[index]) this.buttons[index].enabled = true;
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
