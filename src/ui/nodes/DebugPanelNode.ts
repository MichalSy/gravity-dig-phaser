import Phaser from 'phaser';
import { GAME_EVENTS, emitGameEvent } from '../../game/gameEvents';
import { GameNode, type NodeContext } from '../../nodes';
import { DeveloperDialogNode } from './DeveloperDialogNode';
import { TEXT, UI_DEPTH } from './uiLayout';

export class DebugPanelNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private debugPanel!: Phaser.GameObjects.Container;
  private collisionButton!: Phaser.GameObjects.Text;
  private developerButton!: Phaser.GameObjects.Text;
  private collisionDebugEnabled = false;
  override readonly dependencies = ['ui.developerDialog'] as const;

  constructor() {
    super({ name: 'ui.debugPanel', order: 40 });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    const resolution = Math.max(2, window.devicePixelRatio || 1);
    const bg = this.phaserScene.add
      .rectangle(0, 0, 156, 86, 0x020617, 0.72)
      .setStrokeStyle(1, 0x38bdf8, 0.65)
      .setOrigin(1, 0)
      .setScrollFactor(0);

    const title = this.phaserScene.add.text(-144, 7, 'DEBUG', TEXT.small).setScrollFactor(0).setResolution(resolution);

    this.collisionButton = this.phaserScene.add
      .text(-144, 24, 'Collision: OFF', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '13px',
        fontStyle: '700',
        color: '#f8fafc',
        backgroundColor: 'rgba(15,23,42,0.88)',
        padding: { x: 8, y: 4 },
      })
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
      .setResolution(resolution);

    this.collisionButton.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.preventDefault();
      pointer.event.stopPropagation();
      this.toggleCollisionDebug();
    });

    this.developerButton = this.phaserScene.add
      .text(-144, 56, 'Developer', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '13px',
        fontStyle: '700',
        color: '#082f49',
        backgroundColor: 'rgba(103,232,249,0.92)',
        padding: { x: 8, y: 4 },
      })
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
      .setResolution(resolution);

    this.developerButton.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.preventDefault();
      pointer.event.stopPropagation();
      this.requireNode<DeveloperDialogNode>('ui.developerDialog').toggle();
    });

    this.debugPanel = this.phaserScene.add.container(0, 0, [bg, title, this.collisionButton, this.developerButton]).setDepth(UI_DEPTH + 40).setScrollFactor(0);
  }

  update(): void {
    this.debugPanel?.setPosition(this.phaserScene.scale.width - 12, 12);
  }

  containsPointer(pointer: Phaser.Input.Pointer): boolean {
    return pointer.x >= this.debugPanel.x - 156 && pointer.x <= this.debugPanel.x && pointer.y >= this.debugPanel.y && pointer.y <= this.debugPanel.y + 86;
  }

  destroy(): void {
    this.debugPanel?.destroy(true);
  }

  private toggleCollisionDebug(): void {
    this.collisionDebugEnabled = !this.collisionDebugEnabled;
    this.collisionButton.setText(`Collision: ${this.collisionDebugEnabled ? 'ON' : 'OFF'}`);
    this.collisionButton.setColor(this.collisionDebugEnabled ? '#86efac' : '#f8fafc');
    emitGameEvent(this.phaserScene, GAME_EVENTS.debugCollision, this.collisionDebugEnabled);
  }
}
