import type { InventorySlot } from '../player/types';

export type InputMode = 'touch' | 'desktop' | 'gamepad';

export interface HudMeterState {
  current: number;
  max: number;
}

export interface HudCargoState {
  slots: InventorySlot[];
  visibleSlots: number;
  stackLimit: number;
}

export interface HudState {
  title: string;
  planet: string;
  health: HudMeterState;
  energy: HudMeterState;
  fuel: HudMeterState;
  cargo: HudCargoState;
  debug: string;
  target: string;
  zoom: string;
  inputMode: InputMode;
}
