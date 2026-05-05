export type MenuAction = 'start' | 'options';

export interface MenuItem {
  action: MenuAction;
  label: string;
  enabled: boolean;
}

export const MENU_ITEMS: MenuItem[] = [
  { action: 'start', label: 'SPIELEN', enabled: true },
  { action: 'options', label: 'OPTIONEN', enabled: true },
];

export const MENU_BACKGROUND = {
  width: 2048,
  height: 1152,
};

export const MENU_LAYOUT = {
  x: 442,
  top: 620,
  buttonScale: 0.205,
  buttonWidthScale: 1.2,
  buttonGap: 0.14,
  selectorWidth: 28,
  selectorHeight: 34,
  selectorGap: 14,
  selectorScale: 0.7,
  labelFontSize: 27,
  versionFontSize: 16,
  depth: 2000,
};
