import { DeveloperDialog } from '../../debug/DeveloperDialog';
import { GameNode, type NodeContext } from '../../nodes';

export class DeveloperDialogNode extends GameNode {
  private developerDialog!: DeveloperDialog;

  constructor() {
    super({ name: 'ui.developerDialog', order: 30 });
  }

  init(ctx: NodeContext): void {
    this.developerDialog = new DeveloperDialog(ctx.phaserScene);
  }

  toggle(): void {
    this.developerDialog.toggle();
  }

  isOpen(): boolean {
    return this.developerDialog?.isOpen() ?? false;
  }

  destroy(): void {
    this.developerDialog?.destroy();
  }
}
