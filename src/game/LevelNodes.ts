import { GameNode, type NodeContext } from '../nodes';
import { GravityDigLevelGenerator, type LevelData, type PlanetConfig } from './level';

export class LevelGeneratorManagerNode extends GameNode {
  private readonly generator = new GravityDigLevelGenerator();
  private planetConfig!: PlanetConfig;

  constructor() {
    super({ name: 'levelGenerator', order: 10 });
  }

  init(ctx: NodeContext): void {
    const config = ctx.phaserScene.cache.json.get('dev-planet') as PlanetConfig | undefined;
    if (!config) throw new Error('Planet config dev-planet is not loaded');

    this.planetConfig = config;
  }

  get config(): PlanetConfig {
    return this.planetConfig;
  }

  generateLevel(seed: number | string, difficultyLevel = 1): LevelData {
    return this.generator.generate(this.planetConfig, difficultyLevel, seed);
  }
}

export class LevelNode extends GameNode {
  private levelGenerator!: LevelGeneratorManagerNode;
  private currentLevel?: LevelData;

  constructor() {
    super({ name: 'level', order: 0 });
  }

  resolve(): void {
    this.levelGenerator = this.requireNode<LevelGeneratorManagerNode>('levelGenerator');
  }

  get level(): LevelData {
    if (!this.currentLevel) throw new Error('Level has not been generated yet');
    return this.currentLevel;
  }

  generate(seed: number | string, difficultyLevel = 1): LevelData {
    this.currentLevel = this.levelGenerator.generateLevel(seed, difficultyLevel);
    return this.currentLevel;
  }
}
