import { createDefaultPlayerProfile } from './PlayerProfile';
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
    return {
      version: 1,
      profile: {
        ...createDefaultPlayerProfile(),
        ...parsed.profile,
        inventory: parsed.profile.inventory ?? createDefaultPlayerProfile().inventory,
        equipment: parsed.profile.equipment ?? createDefaultPlayerProfile().equipment,
        upgrades: parsed.profile.upgrades ?? createDefaultPlayerProfile().upgrades,
        perks: parsed.profile.perks ?? createDefaultPlayerProfile().perks,
        stats: parsed.profile.stats ?? createDefaultPlayerProfile().stats,
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
