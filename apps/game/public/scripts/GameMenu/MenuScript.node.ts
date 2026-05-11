import * as Core from '@gravity-dig/game-core';

function wrapIndex(value: number, length: number): number {
  return ((value % length) + length) % length;
}

export default class MenuScript extends Core.ScriptNode {
  id = 'dynamic.menu-script';
  name = 'Menu Script';

  versionNodeId = Core.prop.nodeRef('138dabce-8e4f-4743-94e5-df286ffbf7c8', { label: 'Version Text Node' });
  buttonNodeIds = Core.prop.nodeRefList(['9450b803-e4af-4252-a550-368797b71762', 'cd7cc808-d43e-4238-8f3e-d31e1687026f'], { label: 'Button Nodes' });
  startButtonNodeId = Core.prop.nodeRef('9450b803-e4af-4252-a550-368797b71762', { label: 'Start Button' });
  startEvent = Core.prop.string('game:start', { label: 'Start Event' });

  private buttons: Core.ButtonNode[] = [];
  private activeIndex = 0;
  private keyHandler?: (event: KeyboardEvent) => void;

  resolve() {
    this.setVersionText();
    this.bindButtons();
    this.bindKeyboard();
  }

  destroy() {
    this.buttons.forEach((button) => button.setCallbacks?.({}));
    this.buttons = [];
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = undefined;
  }

  private setVersionText() {
    const versionNode = this.versionNodeId ? this.getNodeById<Core.TextNode>(this.versionNodeId) : undefined;
    versionNode?.setText?.(`v${this.getAppVersion()}`);
  }

  private bindButtons() {
    this.buttons.forEach((button) => button.setCallbacks?.({}));
    this.buttons = this.buttonNodeIds
      .map((instanceId) => this.getNodeById<Core.ButtonNode>(instanceId))
      .filter((button): button is Core.ButtonNode => Boolean(button));
    this.buttons.forEach((button) => {
      button.setCallbacks?.({ onHover: (hovered) => this.setActiveIndex(this.buttons.indexOf(hovered)) });
      button.setClickAction?.(() => button.flash?.());
    });
    this.startButton()?.setClickAction?.(() => this.emit(this.startEvent));
    this.syncButtonSelection();
  }

  private bindKeyboard() {
    if (this.keyHandler) return;
    this.keyHandler = (event) => {
      if (event.code === 'ArrowUp' || event.code === 'KeyW') this.moveSelection(-1);
      if (event.code === 'ArrowDown' || event.code === 'KeyS') this.moveSelection(1);
      if (event.code === 'Enter' || event.code === 'Space') this.activateCurrent();
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  private moveSelection(delta: number) {
    const enabledIndexes = this.buttons.flatMap((button, index) => button.enabled === false ? [] : [index]);
    if (enabledIndexes.length === 0) return;
    const currentPosition = enabledIndexes.includes(this.activeIndex) ? enabledIndexes.indexOf(this.activeIndex) : 0;
    this.setActiveIndex(enabledIndexes[wrapIndex(currentPosition + delta, enabledIndexes.length)]);
  }

  private setActiveIndex(index: number) {
    if (!this.buttons[index] || this.buttons[index].enabled === false) return;
    this.activeIndex = index;
    this.syncButtonSelection();
  }

  private syncButtonSelection() {
    this.buttons.forEach((button, index) => button.setSelected?.(index === this.activeIndex && button.enabled !== false));
  }

  private activateCurrent() {
    const button = this.buttons[this.activeIndex];
    if (!button || button.enabled === false) return;
    if (button.instanceId === this.startButtonNodeId) {
      this.emit(this.startEvent);
      return;
    }
    button.flash?.();
  }

  private startButton() {
    return this.startButtonNodeId ? this.getNodeById<Core.ButtonNode>(this.startButtonNodeId) : undefined;
  }
}
