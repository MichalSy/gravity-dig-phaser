import * as Core from '@gravity-dig/game-core';

export default class LoadingScript extends Core.ScriptNode {
  id = 'dynamic.loading-script';
  name = 'Loading Script';

  progressNodeId = Core.prop.nodeRef('d68a8bc0-3995-48d8-8d70-a75477d881d7', { label: 'Progress Text Node' });
  minimumDurationMs = Core.prop.number(900, { min: 0, max: 5000, step: 100, label: 'Minimum Duration ms' });
  loadEvent = Core.prop.string('game:load', { label: 'Load Event' });
  mountEvent = Core.prop.string('game:mount', { label: 'Mount Event' });

  private elapsedMs = 0;
  private loaded = false;
  private mounted = false;

  resolve() {
    this.setProgress(0);
    if (this.getRuntimeMode() === 'play') this.emit(this.loadEvent);
  }

  update(deltaMs: number) {
    if (this.mounted || this.getRuntimeMode() !== 'play') return;
    this.elapsedMs += deltaMs;
    if (!this.loaded || this.elapsedMs < this.minimumDurationMs) return;
    this.mounted = true;
    this.emit(this.mountEvent);
  }

  setProgress(progress: number) {
    const value = Math.max(0, Math.min(1, progress));
    this.progressNode()?.setText?.(`${Math.round(value * 100)}%`);
  }

  complete() {
    this.setProgress(1);
    this.loaded = true;
  }

  private progressNode() {
    return this.progressNodeId ? this.getNodeById<Core.TextNode>(this.progressNodeId) : undefined;
  }
}