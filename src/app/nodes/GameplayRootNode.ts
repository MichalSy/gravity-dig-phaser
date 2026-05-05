import { NodeScene } from '../../nodes';
import { LevelNode } from '../../game/LevelNodes';
import { MiningToolNode } from '../../game/MiningToolNode';
import { PlayerControllerNode } from '../../game/PlayerControllerNode';
import {
  AutoSaveNode,
  CameraZoomNode,
  CollisionDebugNode,
  GameWorldNode,
  HudNode,
  PlayerPresentationNode,
  RunRecoveryNode,
  ShipDockNode,
} from '../../game/GameplayNodes';
import { GameplayUiScene } from '../../ui/GameplayUiScene';

export class GameplayRootNode extends NodeScene {
  constructor() {
    super({ sceneName: 'gameplay', order: 20 });
    this.addChild(new LevelNode());
    this.addChild(new CameraZoomNode());
    this.addChild(new GameWorldNode());
    this.addChild(new PlayerControllerNode());
    this.addChild(new MiningToolNode());
    this.addChild(new PlayerPresentationNode());
    this.addChild(new CollisionDebugNode());
    this.addChild(new HudNode());
    this.addChild(new RunRecoveryNode());
    this.addChild(new ShipDockNode());
    this.addChild(new AutoSaveNode());
    this.addChild(new GameplayUiScene());
  }
}
