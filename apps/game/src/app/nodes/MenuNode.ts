import Phaser from 'phaser';
import { MENU_ITEMS, MENU_BACKGROUND, type MenuItem } from '../menu/menuConfig';
import { computeMenuLayout } from '../menu/menuLayout';
import { NODE_TYPE_IDS, GameNode, ImageNode, TextNode, type GameNodeOptions, type NodeContext } from '../../nodes';
import { ButtonNode } from './ButtonNode';

export class MenuNode extends GameNode {
  static override readonly nodeTypeId: string = NODE_TYPE_IDS.MenuNode;

  private phaserScene!: Phaser.Scene;
  private activeIndex = 0;
  private backgroundNode?: ImageNode;
  private versionNode?: TextNode;
  private buttons: ButtonNode[] = [];

  private readonly onStart: () => void;

  constructor(onStart: () => void, options: GameNodeOptions = {}) {
    super({ name: 'Menu', className: 'MenuNode', ...options });
    this.onStart = onStart;
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    this.phaserScene.cameras.main.setBackgroundColor('#000000');
    this.phaserScene.input.keyboard?.on('keydown-UP', this.moveSelectionUp, this);
    this.phaserScene.input.keyboard?.on('keydown-W', this.moveSelectionUp, this);
    this.phaserScene.input.keyboard?.on('keydown-DOWN', this.moveSelectionDown, this);
    this.phaserScene.input.keyboard?.on('keydown-S', this.moveSelectionDown, this);
    this.phaserScene.input.keyboard?.on('keydown-ENTER', this.activateCurrent, this);
    this.phaserScene.input.keyboard?.on('keydown-SPACE', this.activateCurrent, this);
    this.phaserScene.scale.on('resize', this.layout, this);
  }

  override afterResolved(): void {
    this.bindSceneNodes();
    this.layout();
  }

  override coreUpdate(): void {
    this.layout();
  }

  destroy(): void {
    this.phaserScene.input.keyboard?.off('keydown-UP', this.moveSelectionUp, this);
    this.phaserScene.input.keyboard?.off('keydown-W', this.moveSelectionUp, this);
    this.phaserScene.input.keyboard?.off('keydown-DOWN', this.moveSelectionDown, this);
    this.phaserScene.input.keyboard?.off('keydown-S', this.moveSelectionDown, this);
    this.phaserScene.input.keyboard?.off('keydown-ENTER', this.activateCurrent, this);
    this.phaserScene.input.keyboard?.off('keydown-SPACE', this.activateCurrent, this);
    this.phaserScene.scale.off('resize', this.layout, this);
    this.buttons.forEach((button) => button.setCallbacks({}));
    this.buttons = [];
    this.backgroundNode = undefined;
    this.versionNode = undefined;
  }

  close(): void {
    if (!this.active) return;
    this.active = false;
    this.refreshSubtreeActiveState();
  }

  private bindSceneNodes(): void {
    this.backgroundNode = this.findDescendant<ImageNode>((node) => node instanceof ImageNode && node.name === 'Menu.Background');
    this.versionNode = this.findDescendant<TextNode>((node) => node instanceof TextNode && node.name === 'Menu.Version');
    this.buttons = this.findDescendants<ButtonNode>((node) => node instanceof ButtonNode)
      .sort((a, b) => this.buttonIndex(a) - this.buttonIndex(b));
    this.buttons.forEach((button) => button.setCallbacks({
      onHover: (hovered) => this.setActiveIndex(this.buttons.indexOf(hovered)),
      onActivate: (activated) => this.activateButton(activated),
    }));
    this.syncButtonSelection();
  }

  private layout(): void {
    if (!this.phaserScene || this.buttons.length === 0) return;

    const button = this.buttons[0];
    const buttonSize = button.size.width > 0 && button.size.height > 0 ? button.size : { width: 1600, height: 360 };
    const backgroundWidth = this.backgroundNode?.size.width || MENU_BACKGROUND.width;
    const layout = computeMenuLayout({
      screenWidth: this.phaserScene.scale.width,
      screenHeight: this.phaserScene.scale.height,
      backgroundWidth,
      buttonTextureWidth: buttonSize.width,
      buttonTextureHeight: buttonSize.height,
      itemCount: this.buttons.length,
      activeIndex: this.activeIndex,
    });

    if (this.backgroundNode) {
      this.backgroundNode.position = { x: layout.background.x, y: layout.background.y };
      this.backgroundNode.scale = layout.background.scale;
      this.backgroundNode.scaleX = layout.background.scale;
      this.backgroundNode.scaleY = layout.background.scale;
    }

    this.buttons.forEach((buttonNode, index) => {
      const buttonLayout = layout.buttons[index];
      buttonNode.position = { x: buttonLayout.x, y: buttonLayout.y };
      buttonNode.scale = 1;
      buttonNode.scaleX = buttonLayout.scaleX;
      buttonNode.scaleY = buttonLayout.scaleY;
      buttonNode.setSelected(index === this.activeIndex && buttonNode.enabled);
    });

    if (this.versionNode) {
      this.versionNode.position = { x: layout.version.x, y: layout.version.y };
      this.versionNode.setText(`v${__APP_VERSION__}`);
      this.versionNode.setStyle({
        fontFamily: 'Silkscreen',
        fontSize: `${layout.version.fontSize}px`,
        fontStyle: '700',
        color: '#fff4c7',
        stroke: '#000000',
        strokeThickness: 4,
      });
    }
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
    const item = MENU_ITEMS.find((candidate) => candidate.action === button.action) ?? ({ action: button.action, label: button.label, enabled: button.enabled } as MenuItem);
    if (item.action === 'start') {
      this.onStart();
      return;
    }
    button.flash();
  }

  private buttonIndex(button: ButtonNode): number {
    const index = MENU_ITEMS.findIndex((item) => item.action === button.action);
    return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
  }

  private findDescendant<T extends GameNode>(predicate: (node: GameNode) => boolean): T | undefined {
    return this.findDescendants<T>(predicate)[0];
  }

  private findDescendants<T extends GameNode>(predicate: (node: GameNode) => boolean): T[] {
    const matches: T[] = [];
    const visit = (node: GameNode): void => {
      if (predicate(node)) matches.push(node as T);
      for (const child of node.children) visit(child);
    };
    for (const child of this.children) visit(child);
    return matches;
  }
}
