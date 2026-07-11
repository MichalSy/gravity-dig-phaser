import * as Core from '@gravity-dig/game-core';

type PlayerStateLike = {
  stats: { maxHealth: number };
  getActiveRun(): { health: number; fuel: number } | undefined;
};

type HudImageNode = Core.ImageNode & {
  visible: boolean;
  image: {
    setCrop(x: number, y: number, width: number, height: number): unknown;
    setVisible(visible: boolean): unknown;
  };
};

const HP_FRAME = { width: 655, height: 95 };
const FUEL_FRAME = { width: 632, height: 81 };
const MAX_FUEL = 100;

export default class StatusHudScript extends Core.ScriptNode {
  id = 'dynamic.status-hud';
  name = 'Status HUD Script';

  hpFillNodeId = Core.prop.nodeRef(null, { label: 'HP Fill' });
  fuelFillNodeId = Core.prop.nodeRef(null, { label: 'Fuel Fill' });
  playerStateNodeId = Core.prop.nodeRef(null, { label: 'Player State' });

  private hpFill!: HudImageNode;
  private fuelFill!: HudImageNode;
  private playerState!: PlayerStateLike;

  resolve() {
    this.hpFill = this.requireResolvedNode<HudImageNode>(this.hpFillNodeId, 'UI.HpFill');
    this.fuelFill = this.requireResolvedNode<HudImageNode>(this.fuelFillNodeId, 'UI.FuelFill');
    this.playerState = this.requireResolvedNode<PlayerStateLike>(this.playerStateNodeId, 'PlayerState');
    this.updateHud();
  }

  update() {
    this.updateHud();
  }

  editorUpdate() {
    this.updateHud();
  }

  private updateHud() {
    const run = this.playerState.getActiveRun();
    const maxHealth = Math.max(1, this.playerState.stats.maxHealth);
    this.updateBarFill(this.hpFill, HP_FRAME, (run?.health ?? maxHealth) / maxHealth);
    this.updateBarFill(this.fuelFill, FUEL_FRAME, (run?.fuel ?? MAX_FUEL) / MAX_FUEL);
  }

  private updateBarFill(node: HudImageNode, frame: { width: number; height: number }, pct: number) {
    const safePct = clamp(pct, 0, 1);
    const visible = safePct > 0;
    node.visible = visible;
    node.image.setCrop(0, 0, Math.max(1, Math.round(frame.width * safePct)), frame.height);
    node.image.setVisible(visible);
  }

  private requireResolvedNode<T>(instanceId: string | null, fallbackName: string): T {
    const node = (instanceId ? this.getNodeById<T>(instanceId) : undefined) ?? this.getNode<T>(fallbackName);
    if (!node) throw new Error(`Required node '${instanceId ?? fallbackName}' was not found`);
    return node;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
