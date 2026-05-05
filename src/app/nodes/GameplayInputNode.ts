import Phaser from 'phaser';
import { GameNode } from '../../nodes';
import type { InputMode } from '../../ui/HudState';

const ZERO = new Phaser.Math.Vector2(0, 0);
const RIGHT = new Phaser.Math.Vector2(1, 0);

export class GameplayInputNode extends GameNode {
  private inputMode: InputMode = 'desktop';
  private readonly moveVector = ZERO.clone();
  private readonly aimVector = RIGHT.clone();
  private aiming = false;
  private menuOpen = false;
  private controlPointerResolver: (pointer: Phaser.Input.Pointer) => boolean = () => false;

  constructor() {
    super({ name: 'gameplayInput', order: 0 });
  }

  setInputMode(inputMode: InputMode): void {
    this.inputMode = inputMode;
  }

  getInputMode(): InputMode {
    return this.inputMode;
  }

  setMoveVector(vector: Phaser.Math.Vector2): void {
    this.moveVector.copy(vector);
  }

  getMoveVector(): Phaser.Math.Vector2 {
    return this.moveVector;
  }

  setAimVector(vector: Phaser.Math.Vector2): void {
    this.aimVector.copy(vector);
  }

  getAimVector(): Phaser.Math.Vector2 {
    return this.aimVector;
  }

  setAiming(aiming: boolean): void {
    this.aiming = aiming;
  }

  isAiming(): boolean {
    return !this.menuOpen && this.inputMode === 'touch' && this.aiming;
  }

  setMenuOpen(menuOpen: boolean): void {
    this.menuOpen = menuOpen;
  }

  isMenuOpen(): boolean {
    return this.menuOpen;
  }

  setControlPointerResolver(resolver: (pointer: Phaser.Input.Pointer) => boolean): void {
    this.controlPointerResolver = resolver;
  }

  containsControlPointer(pointer: Phaser.Input.Pointer): boolean {
    return this.inputMode === 'touch' && this.controlPointerResolver(pointer);
  }
}
