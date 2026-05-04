import Phaser from 'phaser';
import { NodeRuntime } from '../nodes';
import { GameplayUiScene } from '../ui/GameplayUiScene';
import type { HudState, InputMode } from '../ui/HudState';

export class UIScene extends Phaser.Scene {
  private hudRuntime?: NodeRuntime;
  private gameplayUiScene?: GameplayUiScene;
  private inputMode: InputMode = 'desktop';

  constructor() {
    super('ui');
  }

  create(): void {
    this.hudRuntime = new NodeRuntime({ phaserScene: this });
    this.gameplayUiScene = this.hudRuntime.addScene(new GameplayUiScene());
    this.hudRuntime.init();
    this.hudRuntime.resolve();

    this.game.events.on('hud:update', this.updateHud, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('hud:update', this.updateHud, this);
      this.hudRuntime?.destroy();
    });
    this.updateInputMode();
  }

  update(_time: number, deltaMs: number): void {
    this.updateInputMode();
    this.hudRuntime?.update(deltaMs);
    this.hudRuntime?.render();
  }

  getInputMode(): InputMode {
    return this.inputMode;
  }

  getMoveVector(): Phaser.Math.Vector2 {
    return this.gameplayUiScene?.getMoveVector() ?? Phaser.Math.Vector2.ZERO;
  }

  getAimVector(): Phaser.Math.Vector2 {
    return this.gameplayUiScene?.getAimVector() ?? Phaser.Math.Vector2.RIGHT;
  }

  isAiming(): boolean {
    return this.gameplayUiScene?.isAiming() ?? false;
  }

  isMenuOpen(): boolean {
    return this.gameplayUiScene?.isMenuOpen() ?? false;
  }

  containsControlPointer(pointer: Phaser.Input.Pointer): boolean {
    return this.gameplayUiScene?.containsControlPointer(pointer) ?? false;
  }

  private updateHud(state: HudState): void {
    this.gameplayUiScene?.setHudState(state);
  }

  private updateInputMode(): void {
    const gamepad = navigator.getGamepads?.().find((pad) => Boolean(pad));
    if (gamepad) {
      this.inputMode = 'gamepad';
    } else if (this.isTouchDevice()) {
      this.inputMode = 'touch';
    } else {
      this.inputMode = 'desktop';
    }

    this.gameplayUiScene?.setInputMode(this.inputMode);
  }

  private isTouchDevice(): boolean {
    const smallTouchViewport = navigator.maxTouchPoints > 0 && Math.min(window.innerWidth, window.innerHeight) < 768;
    return window.matchMedia('(pointer: coarse)').matches || smallTouchViewport;
  }
}
