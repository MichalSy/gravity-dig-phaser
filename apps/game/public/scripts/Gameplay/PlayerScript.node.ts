import * as Core from '@gravity-dig/game-core';

type CollisionBody = {
  setPosition(x: number, y: number): unknown;
};

type PlayerImageNode = {
  image: unknown;
  update(deltaMs: number): unknown;
};

type ScriptMethodTarget = {
  callScriptMethod(name: string, ...args: unknown[]): unknown;
};

export default class PlayerScript extends Core.ScriptNode {
  id = 'dynamic.player';
  name = 'Player Script';

  bodyNodeId = Core.prop.nodeRef(null, { label: 'Player Body' });
  imageNodeId = Core.prop.nodeRef(null, { label: 'Player Image' });
  movementScriptNodeId = Core.prop.nodeRef(null, { label: 'Movement Script' });

  private body!: CollisionBody;
  private imageNode!: PlayerImageNode;
  private movement!: ScriptMethodTarget;

  resolve() {
    this.body = this.requireResolvedNode<CollisionBody>(this.bodyNodeId, 'PlayerBody');
    this.imageNode = this.requireResolvedNode<PlayerImageNode>(this.imageNodeId, 'PlayerImage');
    this.movement = this.requireResolvedNode<ScriptMethodTarget>(this.movementScriptNodeId, 'PlayerMovementController');
  }

  spawnAt(x: number, y: number) {
    this.body.setPosition(x, y);
    this.imageNode.update(0);
    this.movement.callScriptMethod('setPlayer', this.body);
    return this.imageNode.image;
  }

  getImage() {
    return this.imageNode.image;
  }

  private requireResolvedNode<T>(instanceId: string | null, fallbackName: string): T {
    const node = (instanceId ? this.getNodeById<T>(instanceId) : undefined) ?? this.getNode<T>(fallbackName);
    if (!node) throw new Error(`Required node '${instanceId ?? fallbackName}' was not found`);
    return node;
  }
}
