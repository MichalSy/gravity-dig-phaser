import Phaser from 'phaser';
import { MENU_ITEMS, type MenuItem } from '../menu/menuConfig';
import { MenuView } from '../menu/MenuView';
import { GameNode, type NodeContext } from '../../nodes';

export class MenuNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private view?: MenuView;
  private activeIndex = 0;

  private readonly onStart: () => void;

  constructor(onStart: () => void) {
    super({ name: 'Menu', order: 0, className: 'MenuNode' });
    this.onStart = onStart;
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    this.view = new MenuView(this.phaserScene, {
      onHover: (index) => this.setActiveIndex(index),
      onActivate: (item) => this.activate(item),
    });
    this.view.mount();

    this.phaserScene.input.keyboard?.on('keydown-UP', this.moveSelectionUp, this);
    this.phaserScene.input.keyboard?.on('keydown-W', this.moveSelectionUp, this);
    this.phaserScene.input.keyboard?.on('keydown-DOWN', this.moveSelectionDown, this);
    this.phaserScene.input.keyboard?.on('keydown-S', this.moveSelectionDown, this);
    this.phaserScene.input.keyboard?.on('keydown-ENTER', this.activateCurrent, this);
    this.phaserScene.input.keyboard?.on('keydown-SPACE', this.activateCurrent, this);
    this.phaserScene.scale.on('resize', this.layout, this);
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
    this.view?.destroy();
    this.view = undefined;
  }

  close(): void {
    if (!this.active) return;

    this.active = false;
    this.destroy();
  }

  private layout(): void {
    this.view?.layout(this.activeIndex);
  }

  private moveSelectionUp(): void {
    this.moveSelection(-1);
  }

  private moveSelectionDown(): void {
    this.moveSelection(1);
  }

  private activateCurrent(): void {
    const item = MENU_ITEMS[this.activeIndex];
    if (item) this.activate(item);
  }

  private moveSelection(delta: number): void {
    const enabledIndexes = MENU_ITEMS.flatMap((item, index) => (item.enabled ? [index] : []));
    const enabledPosition = enabledIndexes.indexOf(this.activeIndex);
    const nextPosition = Phaser.Math.Wrap(enabledPosition + delta, 0, enabledIndexes.length);
    this.setActiveIndex(enabledIndexes[nextPosition]);
  }

  private setActiveIndex(index: number): void {
    if (!MENU_ITEMS[index]?.enabled) return;

    this.activeIndex = index;
    this.layout();
  }

  private activate(item: MenuItem): void {
    if (!item.enabled) return;

    if (item.action === 'start') {
      this.onStart();
      return;
    }

    this.view?.flashActiveButton(this.activeIndex);
  }
}
