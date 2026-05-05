import { GameplayInputNode } from './GameplayInputNode';
import { HudStateNode } from './HudStateNode';
import { NodeRoot } from '../../nodes';
import {
  AutoSaveNode,
  CameraZoomNode,
  GameWorldNode,
  HudNode,
  LevelNode,
  MiningToolNode,
  PlayerNode,
  RunRecoveryNode,
  ShipDockNode,
} from '../../game/nodes';
import { GameplayUiRootNode } from '../../ui/nodes';

export class GameplayRootNode extends NodeRoot {
  constructor() {
    super({ rootName: 'gameplay', order: 20, className: 'GameplayRootNode' });
    this.addChild(new GameplayInputNode());
    this.addChild(new HudStateNode());
    this.addChild(new LevelNode());
    this.addChild(new CameraZoomNode());
    this.addChild(new GameWorldNode());
    this.addChild(new PlayerNode());
    this.addChild(new MiningToolNode());
    this.addChild(new HudNode());
    this.addChild(new RunRecoveryNode());
    this.addChild(new ShipDockNode());
    this.addChild(new AutoSaveNode());
    this.addChild(new GameplayUiRootNode());
  }
}
