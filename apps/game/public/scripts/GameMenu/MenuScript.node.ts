import { ScriptNode, prop } from '@gravity-dig/dynamic-node';
import type { TextNode } from '@gravity-dig/game-core';

type MenuButton = {
  action?: string;
  enabled?: boolean;
  setCallbacks?(callbacks: { onHover?: (button: MenuButton) => void; onActivate?: (button: MenuButton) => void }): void;
  setSelected?(selected: boolean): void;
  flash?(durationMs?: number): void;
};

function wrapIndex(value: number, length: number): number {
  return ((value % length) + length) % length;
}

export default class MenuScript extends ScriptNode {
  id = 'dynamic.menu-script';
  name = 'Menu Script';

  versionNodeId = prop.nodeRef('138dabce-8e4f-4743-94e5-df286ffbf7c8', { label: 'Version Text Node' });
  buttonNodeIds = prop.nodeRefList(['9450b803-e4af-4252-a550-368797b71762', 'cd7cc808-d43e-4238-8f3e-d31e1687026f'], { label: 'Button Nodes' });
  startAction = prop.string('start', { label: 'Start Button Action' });
  startEvent = prop.string('game:start', { label: 'Start Event' });

  private buttons: MenuButton[] = [];
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
    const versionNode = this.versionNodeId ? this.getNodeById<TextNode>(this.versionNodeId) : undefined;
    versionNode?.setText?.(`v${this.getAppVersion()}`);
  }

  private bindButtons() {
    this.buttons.forEach((button) => button.setCallbacks?.({}));
    this.buttons = this.buttonNodeIds
      .map((instanceId) => this.getNodeById<MenuButton>(instanceId))
      .filter((button): button is MenuButton => Boolean(button));
    this.buttons.forEach((button) => button.setCallbacks?.({
      onHover: (hovered) => this.setActiveIndex(this.buttons.indexOf(hovered)),
      onActivate: (activated) => this.activateButton(activated),
    }));
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
    if (button) this.activateButton(button);
  }

  private activateButton(button: MenuButton) {
    if (button.enabled === false) return;
    if (button.action === this.startAction) {
      this.emit(this.startEvent);
      return;
    }
    button.flash?.();
  }
}
