import Phaser from 'phaser';
import { MENU_BACKGROUND, MENU_ITEMS, MENU_LAYOUT, type MenuItem } from './menuConfig';
import { computeMenuLayout } from './menuLayout';

interface MenuButton {
  item: MenuItem;
  image: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
}

export interface MenuViewCallbacks {
  onHover(index: number): void;
  onActivate(item: MenuItem): void;
}

export class MenuView {
  private readonly scene: Phaser.Scene;
  private readonly callbacks: MenuViewCallbacks;
  private background?: Phaser.GameObjects.Image;
  private selector?: Phaser.GameObjects.Triangle;
  private versionLabel?: Phaser.GameObjects.Text;
  private buttons: MenuButton[] = [];

  constructor(scene: Phaser.Scene, callbacks: MenuViewCallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
  }

  mount(): void {
    this.scene.cameras.main.setBackgroundColor('#000000');
    this.background = this.scene.add.image(0, 0, 'title-screen').setOrigin(0.5).setScrollFactor(0);
    this.selector = this.scene.add
      .triangle(0, 0, 0, 0, MENU_LAYOUT.selectorWidth, MENU_LAYOUT.selectorHeight / 2, 0, MENU_LAYOUT.selectorHeight, 0xf2c94c)
      .setOrigin(0.5)
      .setScrollFactor(0)
            .setStrokeStyle(4, 0x4d260f);
    this.versionLabel = this.scene.add
      .text(0, 0, `v${__APP_VERSION__}`, {
        fontFamily: 'Silkscreen',
        fontSize: `${MENU_LAYOUT.versionFontSize}px`,
        fontStyle: '700',
        color: '#fff4c7',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(1, 1)
      .setScrollFactor(0)
            .setAlpha(0.82)
      .setResolution(2);

    this.buttons = MENU_ITEMS.map((item, index) => this.createButton(item, index));
  }

  layout(activeIndex: number): void {
    if (!this.background?.active || !this.selector || !this.versionLabel) return;

    const buttonTexture = this.scene.textures.get('menu-button-inactive').getSourceImage();
    const layout = computeMenuLayout({
      screenWidth: this.scene.scale.width,
      screenHeight: this.scene.scale.height,
      backgroundWidth: this.background.width || MENU_BACKGROUND.width,
      buttonTextureWidth: buttonTexture.width,
      buttonTextureHeight: buttonTexture.height,
      itemCount: this.buttons.length,
      activeIndex,
    });

    this.background.setPosition(layout.background.x, layout.background.y).setScale(layout.background.scale);

    this.buttons.forEach((button, index) => {
      const buttonLayout = layout.buttons[index];
      const alpha = button.item.enabled ? 1 : 0.45;

      button.image
        .clearTint()
        .setTexture(index === activeIndex && button.item.enabled ? 'menu-button-active' : 'menu-button-inactive')
        .setPosition(buttonLayout.x, buttonLayout.y)
        .setScale(buttonLayout.scaleX, buttonLayout.scaleY)
        .setAlpha(alpha);
      button.label
        .setPosition(buttonLayout.x, buttonLayout.y - layout.sceneScale)
        .setFontSize(buttonLayout.fontSize)
        .setAlpha(alpha);
    });

    this.versionLabel.setPosition(layout.version.x, layout.version.y).setFontSize(layout.version.fontSize);
    this.selector.setPosition(layout.selector.x, layout.selector.y).setScale(layout.selector.scale);
  }

  flashActiveButton(activeIndex: number): void {
    const button = this.buttons[activeIndex];
    if (!button) return;
    button.image.setTint(0xfff1a8);
    this.scene.time.delayedCall(300, () => button.image.clearTint());
  }

  destroy(): void {
    this.background?.destroy();
    this.selector?.destroy();
    this.versionLabel?.destroy();
    this.background = undefined;
    this.selector = undefined;
    this.versionLabel = undefined;
    for (const button of this.buttons) {
      button.image.destroy();
      button.label.destroy();
    }
    this.buttons = [];
  }

  private createButton(item: MenuItem, index: number): MenuButton {
    const image = this.scene.add.image(0, 0, 'menu-button-inactive').setOrigin(0.5).setScrollFactor(0);
    const label = this.scene.add
      .text(0, 0, item.label, {
        fontFamily: 'Silkscreen',
        fontSize: `${MENU_LAYOUT.labelFontSize}px`,
        fontStyle: '700',
        color: '#fff4c7',
        stroke: '#4d260f',
        strokeThickness: 5,
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
            .setResolution(2);

    if (item.enabled) {
      image.setInteractive({ useHandCursor: true });
      image.on('pointerover', () => this.callbacks.onHover(index));
      image.on('pointerdown', () => this.callbacks.onActivate(item));
      label.setInteractive({ useHandCursor: true });
      label.on('pointerover', () => this.callbacks.onHover(index));
      label.on('pointerdown', () => this.callbacks.onActivate(item));
    }

    return { item, image, label };
  }
}
