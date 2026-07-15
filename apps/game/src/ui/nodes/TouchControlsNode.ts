import Phaser from 'phaser';
import { VirtualJoystick } from '../../controls/VirtualJoystick';
import { NODE_TYPE_IDS, GameNode, type GameNodeOptions, type NodeContext } from '../../nodes';

interface GameplayInputLike {
  setControlPointerResolver(resolver: (pointer: Phaser.Input.Pointer) => boolean): void;
  getInputMode(): 'desktop' | 'touch' | 'gamepad';
  isMenuOpen(): boolean;
  setMoveVector(vector: Phaser.Math.Vector2): void;
  setAimVector(vector: Phaser.Math.Vector2): void;
  setAiming(aiming: boolean): void;
}

interface ShipInteractionLike {
  interact(): void;
  isPlayerAtDock(): boolean;
}

export class TouchControlsNode extends GameNode {
  static override readonly nodeTypeId: string = NODE_TYPE_IDS.TouchControlsNode;

  private inputState!: GameplayInputLike;
  private shipInteraction!: ShipInteractionLike;
  private leftJoystick!: VirtualJoystick;
  private rightJoystick!: VirtualJoystick;
  private upgradeButton!: Phaser.GameObjects.Container;
  private phaserScene!: Phaser.Scene;
  override readonly dependencies = ['GameplayInput'] as const;

  constructor(options: GameNodeOptions = {}) {
    super({ name: 'UI.TouchControls', className: 'TouchControlsNode', ...options });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    this.phaserScene.input.addPointer(3);
    this.leftJoystick = new VirtualJoystick(this.phaserScene, 'left', 'MOVE');
    this.rightJoystick = new VirtualJoystick(this.phaserScene, 'right', 'LASER');

    const background = this.phaserScene.add
      .rectangle(0, 0, 184, 58, 0x0b1220, 0.94)
      .setStrokeStyle(3, 0x38bdf8, 1);
    const label = this.phaserScene.add
      .text(0, 0, 'UPGRADES', {
        fontFamily: 'Silkscreen, monospace',
        fontSize: '19px',
        color: '#e0f2fe',
      })
      .setOrigin(0.5)
      .setResolution(Math.max(2, window.devicePixelRatio || 1));
    this.upgradeButton = this.phaserScene.add
      .container(0, 0, [background, label])
      .setSize(184, 58)
      .setScrollFactor(0)
      .setDepth(200)
      .setVisible(false);

    this.phaserScene.input.on('pointerdown', this.handlePointerDown, this);
    this.phaserScene.input.on('pointermove', this.handlePointerMove, this);
    this.phaserScene.input.on('pointerup', this.handlePointerUp, this);
    this.phaserScene.input.on('pointerupoutside', this.handlePointerUp, this);
  }

  resolve(): void {
    this.inputState = this.requireNode('GameplayInput') as unknown as GameplayInputLike;
  }

  afterResolved(): void {
    this.shipInteraction = this.requireNode('ShipBehavior') as unknown as ShipInteractionLike;
    this.inputState.setControlPointerResolver((pointer) => this.containsPointer(pointer));
  }

  update(): void {
    const inputMode = this.inputState.getInputMode();
    const width = this.phaserScene.scale.width;
    const touchMode = inputMode === 'touch';

    this.leftJoystick.layout();
    this.rightJoystick.layout();
    if (!touchMode) {
      this.leftJoystick.setVisible(false);
      this.rightJoystick.setVisible(false);
    }

    this.inputState.setMoveVector(touchMode ? this.leftJoystick.vector : Phaser.Math.Vector2.ZERO);
    this.inputState.setAimVector(touchMode ? this.rightJoystick.aim : Phaser.Math.Vector2.RIGHT);
    this.inputState.setAiming(this.rightJoystick.active);

    this.upgradeButton
      .setPosition(width - 140, 58)
      .setVisible(touchMode && !this.inputState.isMenuOpen() && this.shipInteraction.isPlayerAtDock());
  }

  override getSceneObjectsInHierarchy(): Phaser.GameObjects.GameObject[] {
    return [
      ...this.leftJoystick.getSceneObjects(),
      ...this.rightJoystick.getSceneObjects(),
      this.upgradeButton,
    ];
  }

  containsPointer(pointer: Phaser.Input.Pointer): boolean {
    return this.containsUpgradeButton(pointer) || this.leftJoystick.contains(pointer) || this.rightJoystick.contains(pointer);
  }

  destroy(): void {
    this.phaserScene?.input.off('pointerdown', this.handlePointerDown, this);
    this.phaserScene?.input.off('pointermove', this.handlePointerMove, this);
    this.phaserScene?.input.off('pointerup', this.handlePointerUp, this);
    this.phaserScene?.input.off('pointerupoutside', this.handlePointerUp, this);
    this.upgradeButton?.destroy(true);
    this.leftJoystick?.setVisible(false);
    this.rightJoystick?.setVisible(false);
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.isTouchInputEnabled()) return;
    if (this.containsUpgradeButton(pointer)) {
      this.shipInteraction.interact();
      pointer.event.preventDefault();
      return;
    }

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

  private isTouchInputEnabled(): boolean {
    return this.inputState.getInputMode() === 'touch' && !this.inputState.isMenuOpen();
  }

  private containsUpgradeButton(pointer: Phaser.Input.Pointer): boolean {
    return this.upgradeButton.visible && this.upgradeButton.getBounds().contains(pointer.x, pointer.y);
  }
}
