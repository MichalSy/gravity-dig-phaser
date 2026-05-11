import Phaser from 'phaser';
import type { DebugNodePatch, DebugOverlayLayerDescriptor } from '@gravity-dig/debug-protocol';
import { isFrameAsset, type RenderableImageAsset } from '../assets/imageAssets';
import { type DebugOverlayLayerRenderContext, type NodeContext, type NodeDebugBounds, type NodeDebugProps } from './GameNode';
import { CORE_NODE_TYPE_IDS } from './NodeTypeIds';
import { exposedPropGroup, propAssetId, propBoolean, propString, type ExposedPropGroup } from './SceneProps';
import { TextNode } from './TextNode';
import { TransformNode, type TransformNodeOptions } from './TransformNode';

const DEFAULT_BUTTON_WIDTH = 220;
const DEFAULT_BUTTON_HEIGHT = 64;
const DEFAULT_NORMAL_COLOR = 0x334155;
const DEFAULT_ACTIVE_COLOR = 0x475569;
const DEFAULT_DISABLED_ALPHA = 0.45;
const DEFAULT_LABEL_COLOR = '#ffffff';
const DEFAULT_LABEL_FONT_SIZE = 18;
const DEFAULT_FLASH_TINT = 0xfff1a8;
const LABEL_CHILD_NAME = 'Label';
const LABEL_CHILD_ROLE = 'button-label';
const MANAGED_LABEL_REASON = 'managed by ButtonNode';

export interface ButtonNodeOptions extends TransformNodeOptions {
  action?: string;
  /** Legacy: migrated to the managed Label TextNode child. */
  label?: string;
  enabled?: boolean;
  normalAssetId?: string;
  activeAssetId?: string;
  selected?: boolean;
  /** Legacy: use the managed Label TextNode transform instead. */
  labelOffsetY?: number;
  /** Legacy: migrated to the managed Label TextNode child. */
  fontId?: string;
  /** Legacy: migrated to the managed Label TextNode child. */
  fontSize?: number;
}

type ButtonCallback = (button: ButtonNode) => void;
type ButtonBackground = Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;

function imageLocalSize(image: Phaser.GameObjects.Image): { width: number; height: number } {
  return { width: image.frame.width, height: image.frame.height };
}

function backgroundLocalSize(node: ButtonNode, background: ButtonBackground): { width: number; height: number } {
  if (background instanceof Phaser.GameObjects.Image) return imageLocalSize(background);
  return {
    width: node.size.width > 0 ? node.size.width : DEFAULT_BUTTON_WIDTH,
    height: node.size.height > 0 ? node.size.height : DEFAULT_BUTTON_HEIGHT,
  };
}

function backgroundLocalBounds(node: ButtonNode, background: ButtonBackground): NodeDebugBounds {
  const size = backgroundLocalSize(node, background);
  return { x: -node.origin.x * size.width, y: -node.origin.y * size.height, width: size.width, height: size.height, scrollFactor: node.scrollFactor };
}

export class ButtonNode extends TransformNode {
  static override readonly nodeTypeId: string = CORE_NODE_TYPE_IDS.ButtonNode;
  static override readonly sceneType: string = 'ButtonNode';
  static override readonly debugOverlayLayers: readonly DebugOverlayLayerDescriptor[] = [
    { id: 'button.bounds', label: 'Button Bounds', source: 'ButtonNode' },
  ];
  static override readonly exposedPropGroups: readonly ExposedPropGroup[] = [
    ...TransformNode.exposedPropGroups,
    exposedPropGroup('Button', {
      action: propString({ label: 'Action' }),
      enabled: propBoolean({ label: 'Enabled' }),
      selected: propBoolean({ label: 'Selected' }),
      normalAssetId: propAssetId({ label: 'Normal Image' }),
      activeAssetId: propAssetId({ label: 'Active Image' }),
    }),
  ];

  action: string;
  enabled: boolean;
  selected: boolean;
  normalAssetId: string;
  activeAssetId: string;

  private readonly legacyLabel: string;
  private readonly legacyLabelOffsetY: number;
  private readonly legacyFontId: string;
  private readonly legacyFontSize: number;
  private normalAsset?: RenderableImageAsset;
  private activeAsset?: RenderableImageAsset;
  private background?: ButtonBackground;
  private hoverCallback?: ButtonCallback;
  private activateCallback?: ButtonCallback;
  private flashUntil = 0;

  constructor(options: ButtonNodeOptions = {}) {
    super({
      ...options,
      className: options.className ?? 'ButtonNode',
      origin: options.origin ?? { x: 0.5, y: 0.5 },
    });
    this.action = options.action ?? '';
    this.enabled = options.enabled ?? true;
    this.selected = options.selected ?? false;
    this.normalAssetId = options.normalAssetId ?? '';
    this.activeAssetId = options.activeAssetId ?? '';
    this.legacyLabel = options.label ?? '';
    this.legacyLabelOffsetY = options.labelOffsetY ?? 0;
    this.legacyFontId = options.fontId ?? '';
    this.legacyFontSize = options.fontSize ?? DEFAULT_LABEL_FONT_SIZE;
  }

  override ensureRequiredChildren(): void {
    const label = this.ensureLabelNode();
    this.configureManagedLabel(label);
  }

  init(ctx: NodeContext): void {
    this.normalAsset = this.normalAssetId ? this.assets.image(this.normalAssetId) : undefined;
    this.activeAsset = this.activeAssetId ? this.assets.image(this.activeAssetId) : undefined;
    const asset = this.currentAsset();
    this.background = asset
      ? ctx.phaserScene.add.image(0, 0, asset.textureKey, isFrameAsset(asset) ? asset.frameKey : undefined)
      : ctx.phaserScene.add.rectangle(0, 0, this.size.width || DEFAULT_BUTTON_WIDTH, this.size.height || DEFAULT_BUTTON_HEIGHT, DEFAULT_NORMAL_COLOR);
    this.configureInteractivity();
    if (this.sizeMode === 'content') this.size = backgroundLocalSize(this, this.background);
    this.applyButtonState();
    this.applyButtonTransform();
  }

  override measureSelf(): void {
    if (this.background && this.sizeMode === 'content') this.size = backgroundLocalSize(this, this.background);
  }

  override coreUpdate(): void {
    this.applyButtonState();
    this.applyButtonTransform();
  }

  destroy(): void {
    this.background?.destroy();
    this.background = undefined;
  }

  setCallbacks(callbacks: { onHover?: ButtonCallback; onActivate?: ButtonCallback }): void {
    this.hoverCallback = callbacks.onHover;
    this.activateCallback = callbacks.onActivate;
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
    this.applyButtonState();
  }

  flash(durationMs = 300): void {
    this.flashUntil = performance.now() + durationMs;
    this.applyButtonState();
  }

  protected override onEffectiveActiveChanged(active: boolean): void {
    this.background?.setVisible(active && this.visible);
  }

  protected override getLocalContentBounds(): NodeDebugBounds | undefined {
    if (!this.background) return super.getLocalContentBounds();
    return backgroundLocalBounds(this, this.background);
  }

  protected override renderDebugOverlayLayer(ctx: DebugOverlayLayerRenderContext): boolean {
    if (ctx.layer.id !== 'button.bounds') return super.renderDebugOverlayLayer(ctx);
    const bounds = this.getDebugBounds();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return false;
    ctx.graphics
      .setVisible(true)
      .setScrollFactor(bounds.scrollFactor ?? this.getEffectiveScrollFactor())
      .lineStyle(2, this.selected ? 0xfacc15 : 0x38bdf8, 0.95)
      .strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    return true;
  }

  override getSceneObjectsInHierarchy(): Phaser.GameObjects.GameObject[] {
    const objects: Phaser.GameObjects.GameObject[] = [];
    if (this.background) objects.push(this.background);
    objects.push(...super.getSceneObjectsInHierarchy());
    return objects;
  }

  override getDebugProps(): NodeDebugProps {
    return {
      ...super.getDebugProps(),
      action: this.action,
      enabled: this.enabled,
      selected: this.selected,
      normalAssetId: this.normalAssetId,
      activeAssetId: this.activeAssetId,
      labelNodeId: this.labelNode()?.instanceId ?? null,
      scrollFactor: this.scrollFactor,
      effectiveScrollFactor: this.getEffectiveScrollFactor(),
    };
  }

  protected override applySceneProp(key: string, value: DebugNodePatch[string]): boolean {
    switch (key) {
      case 'action':
        if (typeof value !== 'string') return false;
        this.action = value;
        return true;
      case 'enabled':
        if (typeof value !== 'boolean') return false;
        this.enabled = value;
        this.configureInteractivity();
        return true;
      case 'selected':
        if (typeof value !== 'boolean') return false;
        this.selected = value;
        return true;
      case 'normalAssetId':
        if (typeof value !== 'string') return false;
        this.normalAssetId = value;
        this.normalAsset = value ? this.assets.image(value) : undefined;
        return true;
      case 'activeAssetId':
        if (typeof value !== 'string') return false;
        this.activeAssetId = value;
        this.activeAsset = value ? this.assets.image(value) : undefined;
        return true;
      // Legacy props from older scene files. They are applied to the managed Label child.
      case 'label':
        if (typeof value !== 'string') return false;
        this.ensureLabelNode().setText(value);
        return true;
      case 'labelOffsetY':
        if (typeof value !== 'number') return false;
        this.ensureLabelNode().position = { x: 0, y: value };
        return true;
      case 'fontId':
        if (typeof value !== 'string') return false;
        this.ensureLabelNode().applySceneProps({ fontId: value });
        return true;
      case 'fontSize':
        if (typeof value !== 'number') return false;
        this.ensureLabelNode().setFontSize(value);
        return true;
      default:
        return super.applySceneProp(key, value);
    }
  }

  private currentAsset(): RenderableImageAsset | undefined {
    if (this.selected && this.enabled) return this.activeAsset ?? this.normalAsset;
    return this.normalAsset ?? this.activeAsset;
  }

  private applyButtonState(): void {
    const background = this.background;
    if (!background) return;

    const asset = this.currentAsset();
    const isFlashing = performance.now() < this.flashUntil;
    if (background instanceof Phaser.GameObjects.Image && asset) {
      background.setTexture(asset.textureKey, isFrameAsset(asset) ? asset.frameKey : undefined);
      background.setTint(isFlashing ? DEFAULT_FLASH_TINT : 0xffffff);
    } else if (background instanceof Phaser.GameObjects.Rectangle) {
      background.setFillStyle(isFlashing ? DEFAULT_FLASH_TINT : this.selected && this.enabled ? DEFAULT_ACTIVE_COLOR : DEFAULT_NORMAL_COLOR);
      background.setSize(this.size.width || DEFAULT_BUTTON_WIDTH, this.size.height || DEFAULT_BUTTON_HEIGHT);
    }
    background.setAlpha(this.enabled ? 1 : DEFAULT_DISABLED_ALPHA);
    const label = this.labelNode();
    if (label?.isInitialized) label.object.setAlpha(this.enabled ? 1 : DEFAULT_DISABLED_ALPHA);
    if (this.sizeMode === 'content') this.size = backgroundLocalSize(this, background);
  }

  private applyButtonTransform(): void {
    if (!this.background) return;
    this.applyTransformTo(this.background);
  }

  private configureInteractivity(): void {
    const object = this.background;
    if (!object) return;
    object.removeAllListeners('pointerover');
    object.removeAllListeners('pointerdown');
    object.disableInteractive();
    if (!this.enabled) return;
    object.setInteractive({ useHandCursor: true });
    object.on('pointerover', () => this.hoverCallback?.(this));
    object.on('pointerdown', () => this.activateCallback?.(this));
  }

  private ensureLabelNode(): TextNode {
    const existing = this.labelNode();
    if (existing) return existing;

    const label = new TextNode({
      instanceId: `${this.instanceId}:label`,
      name: LABEL_CHILD_NAME,
      text: this.legacyLabel,
      fontId: this.legacyFontId,
      fontSize: this.legacyFontSize,
      color: DEFAULT_LABEL_COLOR,
      align: 'center',
      resolution: 2,
      parentAnchor: 'center',
      position: { x: 0, y: this.legacyLabelOffsetY },
      origin: { x: 0.5, y: 0.5 },
      sizeMode: 'fill',
      boundsMode: 'none',
      scrollFactor: 1,
    });
    return this.addChild(label);
  }

  private labelNode(): TextNode | undefined {
    return this.children.find((child): child is TextNode => child instanceof TextNode && (child.getEditorTreeMetadata().ownedRole === LABEL_CHILD_ROLE || child.debugName() === LABEL_CHILD_NAME));
  }

  private configureManagedLabel(label: TextNode): void {
    label.markEditorTreeMetadata({ locked: true, defaultCollapsed: true, ownedRole: LABEL_CHILD_ROLE });
    label.parentAnchor = 'center';
    label.sizeMode = 'fill';
    label.boundsMode = 'none';
    label.origin = { x: 0.5, y: 0.5 };
    label.markExposedPropReadOnly('active', MANAGED_LABEL_REASON);
    label.markExposedPropReadOnly('visible', MANAGED_LABEL_REASON);
    label.markExposedPropReadOnly('parentAnchor', MANAGED_LABEL_REASON);
    label.markExposedPropReadOnly('size', MANAGED_LABEL_REASON);
    label.markExposedPropReadOnly('sizeMode', MANAGED_LABEL_REASON);
    label.markExposedPropReadOnly('origin', MANAGED_LABEL_REASON);
    label.markExposedPropReadOnly('rotation', MANAGED_LABEL_REASON);
    label.markExposedPropReadOnly('scale', MANAGED_LABEL_REASON);
  }
}
