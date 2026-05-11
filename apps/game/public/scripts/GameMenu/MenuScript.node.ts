import { ScriptNode, prop } from '@gravity-dig/dynamic-node';

type MenuButton = {
  action?: string;
  enabled?: boolean;
  setCallbacks?(callbacks: { onHover?: (button: MenuButton) => void; onActivate?: (button: MenuButton) => void }): void;
  setSelected?(selected: boolean): void;
  flash?(durationMs?: number): void;
};

type TextLike = {
  setText?(text: string): void;
};

function wrapIndex(value: number, length: number): number {
  return ((value % length) + length) % length;
}

export default class MenuScript extends ScriptNode {
  id = 'dynamic.menu-script';
  name = 'Menu Script';

  versionNodeId = prop.nodeRef('scene:Scene.Menu/UIRoot/Menu/Menu.Version', { label: 'Version Text Node' });
  buttonNodeIds = prop.nodeRefList(['scene:Scene.Menu/UIRoot/Menu/Menu.PlayButton', 'scene:Scene.Menu/UIRoot/Menu/Menu.OptionsButton'], { label: 'Button Nodes' });
  startAction = prop.string('start', { label: 'Start Button Action' });
  startEvent = prop.string('game:start', { label: 'Start Event' });

  private buttons: MenuButton[] = [];
  private activeIndex = 0;
  private keyHandler?: (event: KeyboardEvent) => void;

  init() {
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
    const versionNode = this.versionNodeId ? this.getNodeById<TextLike>(this.versionNodeId) : undefined;
    versionNode?.setText?.(`v${this.getAppVersion()}`);
  }

  private bindButtons() {
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
