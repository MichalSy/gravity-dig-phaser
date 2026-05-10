import Phaser from 'phaser';
import { GameNode, TextNode, type GameNodeOptions, type NodeContext, type NodeDebugProps } from '../../nodes';
import { NODE_TYPE_IDS } from '../../nodes/NodeTypeIds';
import { exposedPropGroup, propString, type ExposedPropGroup } from '../../nodes/SceneProps';
import { ButtonNode } from './ButtonNode';

export interface MenuScriptNodeOptions extends GameNodeOptions {
  versionNodeName?: string;
  startAction?: string;
}

export class MenuScriptNode extends GameNode {
  static override readonly nodeTypeId: string = NODE_TYPE_IDS.MenuScriptNode;
  static override readonly sceneType: string = 'MenuScriptNode';
  static override readonly exposedPropGroups: readonly ExposedPropGroup[] = [
    ...GameNode.exposedPropGroups,
    exposedPropGroup('Menu Script', {
      versionNodeName: propString({ label: 'Version Text Node' }),
      startAction: propString({ label: 'Start Action' }),
    }),
  ];

  versionNodeName: string;
  startAction: string;

  private phaserScene?: Phaser.Scene;
  private buttons: ButtonNode[] = [];
  private activeIndex = 0;
  private readonly onStart: () => void;

  constructor(onStart: () => void, options: MenuScriptNodeOptions = {}) {
    super({ name: 'MenuScript', className: 'MenuScriptNode', ...options });
    this.onStart = onStart;
    this.versionNodeName = options.versionNodeName ?? 'Menu.Version';
    this.startAction = options.startAction ?? 'start';
  }

  override init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    this.phaserScene.cameras.main.setBackgroundColor('#000000');
    this.phaserScene.input.keyboard?.on('keydown-UP', this.moveSelectionUp, this);
    this.phaserScene.input.keyboard?.on('keydown-W', this.moveSelectionUp, this);
    this.phaserScene.input.keyboard?.on('keydown-DOWN', this.moveSelectionDown, this);
    this.phaserScene.input.keyboard?.on('keydown-S', this.moveSelectionDown, this);
    this.phaserScene.input.keyboard?.on('keydown-ENTER', this.activateCurrent, this);
    this.phaserScene.input.keyboard?.on('keydown-SPACE', this.activateCurrent, this);
  }

  override afterResolved(): void {
    const versionNode = this.getNodesByName<TextNode>(this.versionNodeName).find((node) => node instanceof TextNode);
    versionNode?.setText(`v${__APP_VERSION__}`);

    this.buttons = this.collectSiblingButtons();
    this.buttons.forEach((button) => button.setCallbacks({
      onHover: (hovered) => this.setActiveIndex(this.buttons.indexOf(hovered)),
      onActivate: (activated) => this.activateButton(activated),
    }));
    this.syncButtonSelection();
  }

  override destroy(): void {
    this.phaserScene?.input.keyboard?.off('keydown-UP', this.moveSelectionUp, this);
    this.phaserScene?.input.keyboard?.off('keydown-W', this.moveSelectionUp, this);
    this.phaserScene?.input.keyboard?.off('keydown-DOWN', this.moveSelectionDown, this);
    this.phaserScene?.input.keyboard?.off('keydown-S', this.moveSelectionDown, this);
    this.phaserScene?.input.keyboard?.off('keydown-ENTER', this.activateCurrent, this);
    this.phaserScene?.input.keyboard?.off('keydown-SPACE', this.activateCurrent, this);
    this.buttons.forEach((button) => button.setCallbacks({}));
    this.buttons = [];
    this.phaserScene = undefined;
  }

  override getDebugProps(): NodeDebugProps {
    return {
      ...super.getDebugProps(),
      versionNodeName: this.versionNodeName,
      startAction: this.startAction,
      activeButton: this.buttons[this.activeIndex]?.debugName() ?? null,
    };
  }

  private collectSiblingButtons(): ButtonNode[] {
    const root = this.parent ?? this;
    const buttons: ButtonNode[] = [];
    const visit = (node: GameNode): void => {
      if (node instanceof ButtonNode) buttons.push(node);
      for (const child of node.children) visit(child);
    };
    for (const child of root.children) visit(child);
    return buttons;
  }

  private moveSelectionUp(): void {
    this.moveSelection(-1);
  }

  private moveSelectionDown(): void {
    this.moveSelection(1);
  }

  private activateCurrent(): void {
    const button = this.buttons[this.activeIndex];
    if (button) this.activateButton(button);
  }

  private moveSelection(delta: number): void {
    const enabledIndexes = this.buttons.flatMap((button, index) => (button.enabled ? [index] : []));
    if (enabledIndexes.length === 0) return;
    const currentPosition = enabledIndexes.includes(this.activeIndex) ? enabledIndexes.indexOf(this.activeIndex) : 0;
    const nextPosition = Phaser.Math.Wrap(currentPosition + delta, 0, enabledIndexes.length);
    this.setActiveIndex(enabledIndexes[nextPosition]);
  }

  private setActiveIndex(index: number): void {
    if (!this.buttons[index]?.enabled) return;
    this.activeIndex = index;
    this.syncButtonSelection();
  }

  private syncButtonSelection(): void {
    this.buttons.forEach((button, index) => button.setSelected(index === this.activeIndex && button.enabled));
  }

  private activateButton(button: ButtonNode): void {
    if (!button.enabled) return;
    if (button.action === this.startAction) {
      this.onStart();
      return;
    }
    button.flash();
  }
}
