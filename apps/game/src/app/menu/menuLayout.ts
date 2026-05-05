import { MENU_BACKGROUND, MENU_LAYOUT } from './menuConfig';

export interface MenuLayoutInput {
  screenWidth: number;
  screenHeight: number;
  backgroundWidth: number;
  buttonTextureWidth: number;
  buttonTextureHeight: number;
  itemCount: number;
  activeIndex: number;
}

export interface MenuButtonLayout {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  fontSize: number;
}

export interface MenuLayoutResult {
  sceneScale: number;
  background: { x: number; y: number; scale: number };
  buttons: MenuButtonLayout[];
  version: { x: number; y: number; fontSize: number };
  selector: { x: number; y: number; scale: number };
}

export function computeMenuLayout(input: MenuLayoutInput): MenuLayoutResult {
  const sceneScale = input.screenWidth / input.backgroundWidth;
  const buttonScale = sceneScale * MENU_LAYOUT.buttonScale;
  const buttonWidth = input.buttonTextureWidth * buttonScale * MENU_LAYOUT.buttonWidthScale;
  const buttonHeight = input.buttonTextureHeight * buttonScale;
  const gap = buttonHeight * MENU_LAYOUT.buttonGap;
  const left = backgroundToScreenX(MENU_LAYOUT.x, input.screenWidth, sceneScale);
  const top = backgroundToScreenY(MENU_LAYOUT.top, input.screenHeight, sceneScale);
  const selectorScale = sceneScale * MENU_LAYOUT.selectorScale;

  return {
    sceneScale,
    background: { x: input.screenWidth / 2, y: input.screenHeight / 2, scale: sceneScale },
    buttons: Array.from({ length: input.itemCount }, (_, index) => ({
      x: left,
      y: top + index * (buttonHeight + gap),
      scaleX: buttonScale * MENU_LAYOUT.buttonWidthScale,
      scaleY: buttonScale,
      fontSize: Math.max(14, MENU_LAYOUT.labelFontSize * sceneScale),
    })),
    version: {
      x: input.screenWidth - 18 * sceneScale,
      y: input.screenHeight - 14 * sceneScale,
      fontSize: Math.max(10, MENU_LAYOUT.versionFontSize * sceneScale),
    },
    selector: {
      x: left - buttonWidth / 2 - MENU_LAYOUT.selectorGap * sceneScale - (MENU_LAYOUT.selectorWidth * selectorScale) / 2,
      y: top + input.activeIndex * (buttonHeight + gap),
      scale: selectorScale,
    },
  };
}

function backgroundToScreenX(x: number, screenWidth: number, scale: number): number {
  return screenWidth / 2 + (x - MENU_BACKGROUND.width / 2) * scale;
}

function backgroundToScreenY(y: number, screenHeight: number, scale: number): number {
  return screenHeight / 2 + (y - MENU_BACKGROUND.height / 2) * scale;
}
