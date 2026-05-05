import { createDefaultPlayerProfile } from './PlayerProfile';
import { normalizeInventory } from './inventory';
import type { SaveGame } from './types';

const SAVE_KEY = 'gravity-dig-save-v1';

export function createDefaultSaveGame(): SaveGame {
  return {
    version: 1,
    profile: createDefaultPlayerProfile(),
  };
}

export function loadSaveGame(): SaveGame {
  if (typeof localStorage === 'undefined') return createDefaultSaveGame();

  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return createDefaultSaveGame();

  try {
    const parsed = JSON.parse(raw) as Partial<SaveGame>;
    if (parsed.version !== 1 || !parsed.profile) return createDefaultSaveGame();
    const defaults = createDefaultPlayerProfile();
    return {
      version: 1,
      profile: {
        ...defaults,
        ...parsed.profile,
        inventory: normalizeInventory(parsed.profile.inventory, defaults.inventory.slots.length, defaults.inventory.stackLimit),
        equipment: parsed.profile.equipment ?? defaults.equipment,
        upgrades: parsed.profile.upgrades ?? defaults.upgrades,
        perks: parsed.profile.perks ?? defaults.perks,
        stats: parsed.profile.stats ?? defaults.stats,
      },
      activeRun: parsed.activeRun,
    };
  } catch {
    return createDefaultSaveGame();
  }
}

export function saveGame(save: SaveGame): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}
