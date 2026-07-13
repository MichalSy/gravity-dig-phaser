import Phaser from 'phaser';
import type { DebugNodePatch } from '@gravity-dig/debug-protocol';
import { GameNode, type GameNodeOptions, type NodeContext, type NodeDebugProps } from './GameNode';
import { CORE_NODE_TYPE_IDS } from './NodeTypeIds';
import { exposedPropGroup, propBoolean, propNumber, propString, type ExposedPropGroup } from './SceneProps';

export interface AudioPlayOptions {
  volume?: number;
  detune?: number;
  loop?: boolean;
}

export interface AudioNodeOptions extends GameNodeOptions {
  soundKey?: string;
  loop?: boolean;
  volume?: number;
  detune?: number;
}

export class AudioNode extends GameNode {
  static override readonly nodeTypeId: string = CORE_NODE_TYPE_IDS.AudioNode;
  static override readonly sceneType = 'AudioNode';
  static override readonly exposedPropGroups: readonly ExposedPropGroup[] = [
    ...GameNode.exposedPropGroups,
    exposedPropGroup('Audio', {
      soundKey: propString({ label: 'Sound Key' }),
      loop: propBoolean({ label: 'Loop' }),
      volume: propNumber({ label: 'Volume', min: 0, max: 1, step: 0.05 }),
      detune: propNumber({ label: 'Detune', step: 1 }),
    }),
  ];

  soundKey: string;
  loop: boolean;
  volume: number;
  detune: number;
  private phaserScene?: Phaser.Scene;
  private sound?: Phaser.Sound.BaseSound;

  constructor(options: AudioNodeOptions = {}) {
    super({ ...options, className: options.className ?? 'AudioNode' });
    this.soundKey = options.soundKey ?? '';
    this.loop = options.loop ?? false;
    this.volume = options.volume ?? 1;
    this.detune = options.detune ?? 0;
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    this.recreateSound();
  }

  play(options: AudioPlayOptions = {}): boolean {
    if (!this.sound || this.sound.isPlaying) return false;
    return this.sound.play({
      loop: options.loop ?? this.loop,
      volume: options.volume ?? this.volume,
      detune: options.detune ?? this.detune,
    });
  }

  playOneShot(options: AudioPlayOptions = {}): boolean {
    if (!this.phaserScene || !this.soundKey) return false;
    return this.phaserScene.sound.play(this.soundKey, {
      loop: options.loop ?? false,
      volume: options.volume ?? this.volume,
      detune: options.detune ?? this.detune,
    });
  }

  stop(): boolean {
    if (!this.sound?.isPlaying) return false;
    return this.sound.stop();
  }

  get isPlaying(): boolean {
    return this.sound?.isPlaying ?? false;
  }

  destroy(): void {
    this.stop();
    this.sound?.destroy();
    this.sound = undefined;
    this.phaserScene = undefined;
  }

  override getDebugProps(): NodeDebugProps {
    return { ...super.getDebugProps(), soundKey: this.soundKey, loop: this.loop, volume: this.volume, detune: this.detune, isPlaying: this.isPlaying };
  }

  protected override applySceneProp(key: string, value: DebugNodePatch[string]): boolean {
    switch (key) {
      case 'soundKey':
        if (typeof value !== 'string') return false;
        this.soundKey = value;
        this.recreateSound();
        return true;
      case 'loop':
        if (typeof value !== 'boolean') return false;
        this.loop = value;
        return true;
      case 'volume':
        if (typeof value !== 'number') return false;
        this.volume = Phaser.Math.Clamp(value, 0, 1);
        return true;
      case 'detune':
        if (typeof value !== 'number') return false;
        this.detune = value;
        return true;
      default:
        return super.applySceneProp(key, value);
    }
  }

  private recreateSound(): void {
    this.stop();
    this.sound?.destroy();
    this.sound = this.phaserScene && this.soundKey
      ? this.phaserScene.sound.add(this.soundKey, { loop: this.loop, volume: this.volume, detune: this.detune })
      : undefined;
  }
}
