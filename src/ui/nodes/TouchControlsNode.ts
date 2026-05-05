import Phaser from 'phaser';
import { GameplayInputNode } from '../../app/nodes';
import { VirtualJoystick } from '../../controls/VirtualJoystick';
import { GameNode, type NodeContext } from '../../nodes';
import { DebugPanelNode } from './DebugPanelNode';
import { DeveloperDialogNode } from './DeveloperDialogNode';
import { UI_DEPTH } from './uiLayout';

export class TouchControlsNode extends GameNode {
  private inputState!: GameplayInputNode;
  private debugPanel!: DebugPanelNode;
  private developerDialog!: DeveloperDialogNode;
  private leftJoystick!: VirtualJoystick;
  private rightJoystick!: VirtualJoystick;
  private controlsHint!: Phaser.GameObjects.Text;
  private phaserScene!: Phaser.Scene;
  override readonly dependencies = ['gameplayInput', 'ui.debugPanel', 'ui.developerDialog'] as const;

  constructor() {
    super({ name: 'ui.touchControls', order: 50 });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    this.phaserScene.input.addPointer(3);
    this.leftJoystick = new VirtualJoystick(this.phaserScene, 'left', 'MOVE');
    this.rightJoystick = new VirtualJoystick(this.phaserScene, 'right', 'LASER');
    this.controlsHint = this.phaserScene.add
      .text(0, 0, 'Mobile: linker Stick laufen/springen · rechter Stick zielen & minen', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '15px',
        color: '#e2e8f0',
        backgroundColor: 'rgba(2,6,23,0.45)',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 40)
      .setResolution(Math.max(2, window.devicePixelRatio || 1));

    this.phaserScene.input.on('pointerdown', this.handlePointerDown, this);
    this.phaserScene.input.on('pointermove', this.handlePointerMove, this);
    this.phaserScene.input.on('pointerup', this.handlePointerUp, this);
    this.phaserScene.input.on('pointerupoutside', this.handlePointerUp, this);
  }

  resolve(): void {
    this.inputState = this.requireNode<GameplayInputNode>('gameplayInput');
    this.debugPanel = this.requireNode<DebugPanelNode>('ui.debugPanel');
    this.developerDialog = this.requireNode<DeveloperDialogNode>('ui.developerDialog');
    this.inputState.setControlPointerResolver((pointer) => this.containsPointer(pointer));
  }

  update(): void {
    const inputMode = this.inputState.getInputMode();
    const width = this.phaserScene.scale.width;
    const height = this.phaserScene.scale.height;
    const compact = height <= 430 || width <= 760;
    const touchMode = inputMode === 'touch';

    this.leftJoystick.layout();
    this.rightJoystick.layout();
    if (!touchMode) {
      this.leftJoystick.setVisible(false);
      this.rightJoystick.setVisible(false);
    }

    this.inputState.setMenuOpen(this.developerDialog.isOpen());
    this.inputState.setMoveVector(touchMode ? this.leftJoystick.vector : Phaser.Math.Vector2.ZERO);
    this.inputState.setAimVector(touchMode ? this.rightJoystick.aim : Phaser.Math.Vector2.RIGHT);
    this.inputState.setAiming(this.rightJoystick.active);

    this.controlsHint
      .setPosition(width / 2, Math.max(24, height - 26))
      .setWordWrapWidth(Math.max(320, width - 48))
      .setVisible(!compact && touchMode);
  }

  containsPointer(pointer: Phaser.Input.Pointer): boolean {
    return this.leftJoystick.contains(pointer) || this.rightJoystick.contains(pointer);
  }

  destroy(): void {
    this.phaserScene?.input.off('pointerdown', this.handlePointerDown, this);
    this.phaserScene?.input.off('pointermove', this.handlePointerMove, this);
    this.phaserScene?.input.off('pointerup', this.handlePointerUp, this);
    this.phaserScene?.input.off('pointerupoutside', this.handlePointerUp, this);
    this.controlsHint?.destroy();
    this.leftJoystick?.setVisible(false);
    this.rightJoystick?.setVisible(false);
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.shouldHandlePointer(pointer)) return;
    const handled = pointer.x < this.phaserScene.scale.width / 2
      ? this.leftJoystick.handlePointerDown(pointer)
      : this.rightJoystick.handlePointerDown(pointer);
    if (handled) pointer.event.preventDefault();
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.isTouchInputEnabled()) return;
    this.leftJoystick.handlePointerMove(pointer);
    this.rightJoystick.handlePointerMove(pointer);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.isTouchInputEnabled()) return;
    this.leftJoystick.handlePointerUp(pointer);
    this.rightJoystick.handlePointerUp(pointer);
  }

  private shouldHandlePointer(pointer: Phaser.Input.Pointer): boolean {
    return this.isTouchInputEnabled() && !this.debugPanel.containsPointer(pointer);
  }

  private isTouchInputEnabled(): boolean {
    return this.inputState.getInputMode() === 'touch' && !this.inputState.isMenuOpen();
  }
}
