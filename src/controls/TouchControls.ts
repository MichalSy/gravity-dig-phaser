import { JOYSTICK_DEADZONE } from '../config/gameConfig';
import { requestImmersiveLandscape } from '../utils/screen';

export interface HudState {
  title: string;
  planet: string;
  stats: string;
  inventory: string;
  debug: string;
  target: string;
}

class DomJoystick {
  readonly vector = { x: 0, y: 0 };
  readonly aim = { x: 1, y: 0 };

  private activePointerId?: number;
  private readonly root: HTMLDivElement;
  private readonly knob: HTMLDivElement;

  constructor(container: HTMLElement, side: 'left' | 'right', label: string) {
    this.root = document.createElement('div');
    this.root.className = `joystick joystick-${side}`;
    this.root.innerHTML = `<div class="joystick-label">${label}</div><div class="joystick-ring"><div class="joystick-knob"></div></div>`;
    container.appendChild(this.root);

    const knob = this.root.querySelector<HTMLDivElement>('.joystick-knob');
    if (!knob) throw new Error('Joystick knob missing');
    this.knob = knob;

    this.root.addEventListener('pointerdown', this.onPointerDown);
    this.root.addEventListener('pointermove', this.onPointerMove);
    this.root.addEventListener('pointerup', this.onPointerUp);
    this.root.addEventListener('pointercancel', this.onPointerUp);
  }

  get active(): boolean {
    return this.activePointerId !== undefined;
  }

  destroy(): void {
    this.root.removeEventListener('pointerdown', this.onPointerDown);
    this.root.removeEventListener('pointermove', this.onPointerMove);
    this.root.removeEventListener('pointerup', this.onPointerUp);
    this.root.removeEventListener('pointercancel', this.onPointerUp);
    this.root.remove();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    requestImmersiveLandscape();
    event.preventDefault();
    this.activePointerId = event.pointerId;
    this.root.setPointerCapture(event.pointerId);
    this.updateFromPointer(event);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    event.preventDefault();
    this.updateFromPointer(event);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    event.preventDefault();
    this.activePointerId = undefined;
    this.vector.x = 0;
    this.vector.y = 0;
    this.knob.style.transform = 'translate(-50%, -50%)';
  };

  private updateFromPointer(event: PointerEvent): void {
    const ring = this.root.querySelector<HTMLDivElement>('.joystick-ring');
    if (!ring) return;

    const rect = ring.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const radius = rect.width / 2;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const length = Math.min(radius, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    const x = Math.cos(angle) * length;
    const y = Math.sin(angle) * length;
    const nx = x / radius;
    const ny = y / radius;

    this.knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;

    if (Math.hypot(nx, ny) < JOYSTICK_DEADZONE) {
      this.vector.x = 0;
      this.vector.y = 0;
      return;
    }

    this.vector.x = nx;
    this.vector.y = ny;
    this.aim.x = nx;
    this.aim.y = ny;
    const aimLength = Math.hypot(this.aim.x, this.aim.y) || 1;
    this.aim.x /= aimLength;
    this.aim.y /= aimLength;
  }
}

export class TouchControls {
  readonly left: DomJoystick;
  readonly right: DomJoystick;

  private readonly overlay: HTMLDivElement;
  private readonly hud: HTMLDivElement;
  private readonly debug: HTMLDivElement;

  constructor() {
    document.getElementById('ui-overlay')?.remove();

    this.overlay = document.createElement('div');
    this.overlay.id = 'ui-overlay';
    this.overlay.innerHTML = `
      <div id="hud-panel"></div>
      <div id="debug-panel"></div>
      <div id="control-hint">Mobile: linker Stick laufen/springen · rechter Stick zielen & minen</div>
      <div id="touch-controls"></div>
    `;
    document.body.appendChild(this.overlay);

    const touchControls = this.overlay.querySelector<HTMLDivElement>('#touch-controls');
    const hud = this.overlay.querySelector<HTMLDivElement>('#hud-panel');
    const debug = this.overlay.querySelector<HTMLDivElement>('#debug-panel');
    const hint = this.overlay.querySelector<HTMLDivElement>('#control-hint');
    if (!touchControls || !hud || !debug || !hint) throw new Error('UI overlay failed to initialize');

    this.hud = hud;
    this.debug = debug;
    this.left = new DomJoystick(touchControls, 'left', 'MOVE');
    this.right = new DomJoystick(touchControls, 'right', 'LASER');
  }

  update(state: HudState): void {
    this.hud.innerHTML = `
      <strong>${state.title}</strong>
      <span>${state.planet}</span>
      <span>${state.stats}</span>
      <span>${state.inventory}</span>
    `;
    this.debug.innerHTML = `<span>${state.debug}</span><span>${state.target}</span>`;
  }

  destroy(): void {
    this.left.destroy();
    this.right.destroy();
    this.overlay.remove();
  }
}
