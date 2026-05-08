import { ScriptNode, prop } from '@gravity-dig/dynamic-node';

export default class ExamplePulseNode extends ScriptNode {
  id = 'dynamic.example-pulse';
  name = 'Example Pulse Script';

  intervalMs = prop.number(1000, { min: 100, max: 5000, step: 100, label: 'Interval ms' });
  enabled = prop.boolean(true, { label: 'Enabled' });

  private elapsedMs = 0;

  update(deltaMs: number) {
    if (!this.enabled) return;

    this.elapsedMs += deltaMs;
    if (this.elapsedMs < this.intervalMs) return;

    this.elapsedMs = 0;
    this.log('pulse', { intervalMs: this.intervalMs });
  }
}
