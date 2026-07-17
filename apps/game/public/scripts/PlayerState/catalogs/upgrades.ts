import { TILE_SIZE } from '../playerConfig';
import type { UpgradeDefinition, UpgradeId } from '../types';

export const SKILL_TREE_BRANCHES: Record<'movement' | 'vision' | 'mining' | 'utility', UpgradeId[]> = {
  movement: [
    'spring_boots', 'micro_jetpack', 'rocket_pants', 'moonwalk_insurance', 'ceiling_negotiator', 'turbo_snail',
    'chrono_shoelaces', 'bounce_tax_refund', 'antigravity_sandwich', 'panic_teleporter', 'comet_kneecaps',
    'quantum_hopscotch', 'uninstall_gravity',
  ],
  vision: [
    'wide_visor', 'ore_scanner', 'xray_potato', 'spectrum_monocle', 'copper_gossip', 'fog_coupon',
    'geology_karaoke', 'schrodinger_map', 'bureaucratic_xray', 'prophetic_breadcrumbs', 'seismic_gossip',
    'omniscient_toaster', 'privacy_abolished',
  ],
  mining: [
    'laser_focus', 'chain_lightning', 'storm_subscription', 'arc_apprentice', 'ore_blender', 'laser_spaghetti',
    'thunder_ferret', 'tax_evasion_drill', 'plasma_fondue', 'recursive_pickaxe', 'caffeinated_beam',
    'localized_apocalypse', 'planetary_unsubscribe',
  ],
  utility: [
    'cargo_tetris', 'pocket_wormhole', 'rubber_duck_protocol', 'emergency_banana', 'cargo_origami', 'pocket_dimension',
    'unionized_nanobots', 'loot_boomerang', 'insurance_fraud', 'portable_shipyard', 'cosmic_vacuum',
    'administrative_immortality', 'reality_premium',
  ],
};

export const SKILL_TREE_IDS: UpgradeId[] = [
  'prospector_core',
  ...SKILL_TREE_BRANCHES.movement,
  ...SKILL_TREE_BRANCHES.vision,
  ...SKILL_TREE_BRANCHES.mining,
  ...SKILL_TREE_BRANCHES.utility,
];

export function areUpgradePrerequisitesMet(
  definition: UpgradeDefinition,
  isPurchased: (upgradeId: UpgradeId) => boolean,
): boolean {
  const prerequisites = definition.prerequisites ?? [];
  if (prerequisites.length === 0) return true;
  return definition.prerequisiteMode === 'any'
    ? prerequisites.some(isPurchased)
    : prerequisites.every(isPurchased);
}

export const UPGRADE_DEFINITIONS: Record<UpgradeId, UpgradeDefinition> = {
  prospector_core: {
    id: 'prospector_core', label: 'Prospektor-Kern', description: 'Schaltet die vier Forschungsäste frei und spendiert 10 Energie.', category: 'core',
    cost: { credits: 50 }, effects: [{ stat: 'maxEnergy', op: 'add', value: 10 }], tree: { x: 0, y: 0, branch: 'core' },
  },
  spring_boots: {
    id: 'spring_boots', label: 'Federstiefel', description: '12 % höher springen. Boing ist eine Wissenschaft.', category: 'boots',
    cost: { credits: 100 }, prerequisites: ['prospector_core'], effects: [{ stat: 'jumpVelocity', op: 'multiply', value: 1.12 }], tree: { x: -1, y: 1, branch: 'movement' },
  },
  micro_jetpack: {
    id: 'micro_jetpack', label: 'Mikro-Jetpack', description: 'Ein zusätzlicher Sprung in der Luft.', category: 'boots',
    cost: { credits: 350 }, prerequisites: ['spring_boots', 'cargo_tetris'], prerequisiteMode: 'any', effects: [{ stat: 'airJumps', op: 'set', value: 1 }], tree: { x: -2, y: 2, branch: 'movement' },
  },
  rocket_pants: {
    id: 'rocket_pants', label: 'Raketenhose', description: 'Zwei Luftsprünge und 28 % weniger Schwerkraft. Garantie erloschen.', category: 'boots',
    cost: { credits: 900 }, prerequisites: ['spring_boots', 'wide_visor'], prerequisiteMode: 'any', effects: [{ stat: 'airJumps', op: 'set', value: 2 }, { stat: 'gravityMultiplier', op: 'multiply', value: 0.72 }], tree: { x: -3, y: 3, branch: 'movement' },
  },
  wide_visor: {
    id: 'wide_visor', label: 'Weitwinkel-Visier', description: 'Erhöht die permanente Sichtweite auf 3 Tiles.', category: 'visor',
    cost: { credits: 100 }, prerequisites: ['prospector_core'], effects: [{ stat: 'sightRadius', op: 'set', value: 3 }], tree: { x: 1, y: -1, branch: 'vision' },
  },
  ore_scanner: {
    id: 'ore_scanner', label: 'Erz-Scanner', description: 'Markiert Erzadern im Radius von 4 Tiles durch den Fog.', category: 'visor',
    cost: { credits: 350 }, prerequisites: ['wide_visor'], effects: [{ stat: 'oreScannerRadius', op: 'set', value: 4 }], tree: { x: 2, y: -2, branch: 'vision' },
  },
  xray_potato: {
    id: 'xray_potato', label: 'Kristallradar', description: 'Scanner-Radius 7 und +1 Sicht. Kristalle flüstern ihre Position.', category: 'visor',
    cost: { credits: 900 }, prerequisites: ['wide_visor', 'laser_focus'], prerequisiteMode: 'any', effects: [{ stat: 'oreScannerRadius', op: 'set', value: 7 }, { stat: 'sightRadius', op: 'add', value: 1 }], tree: { x: 3, y: -3, branch: 'vision' },
  },
  laser_focus: {
    id: 'laser_focus', label: 'Laser-Fokus', description: '25 % mehr Mining-Schaden.', category: 'laser',
    cost: { credits: 125 }, prerequisites: ['prospector_core'], effects: [{ stat: 'miningDamagePerSec', op: 'multiply', value: 1.25 }], tree: { x: 1, y: 1, branch: 'mining' },
  },
  chain_lightning: {
    id: 'chain_lightning', label: 'Kettenblitz', description: 'Jeder zerstörte Block zerlegt zwei benachbarte Blöcke.', category: 'laser',
    cost: { credits: 450 }, prerequisites: ['laser_focus'], effects: [{ stat: 'chainMiningTargets', op: 'set', value: 2 }], tree: { x: 2, y: 2, branch: 'mining' },
  },
  storm_subscription: {
    id: 'storm_subscription', label: 'Quantenbohrer', description: 'Vier Kettenziele und 15 % mehr Schaden durch einen instabilen Bohrkern.', category: 'laser',
    cost: { credits: 1100 }, prerequisites: ['laser_focus', 'ore_scanner'], prerequisiteMode: 'any', effects: [{ stat: 'chainMiningTargets', op: 'set', value: 4 }, { stat: 'miningDamagePerSec', op: 'multiply', value: 1.15 }], tree: { x: 3, y: 3, branch: 'mining' },
  },
  cargo_tetris: {
    id: 'cargo_tetris', label: 'Cargo-Tetris', description: '+1 Cargo-Slot. Reihen verschwinden leider nicht.', category: 'cargo',
    cost: { credits: 100 }, prerequisites: ['prospector_core'], effects: [{ stat: 'cargoSlots', op: 'add', value: 1 }], tree: { x: -1, y: -1, branch: 'utility' },
  },
  pocket_wormhole: {
    id: 'pocket_wormhole', label: 'Sternenfrachter', description: '+3 Stackgröße und 140 Pixel Sammelradius durch gefalteten Frachtraum.', category: 'cargo',
    cost: { credits: 400 }, prerequisites: ['cargo_tetris', 'spring_boots'], prerequisiteMode: 'any', effects: [{ stat: 'cargoStackLimit', op: 'add', value: 3 }, { stat: 'pickupRadius', op: 'set', value: 140 }], tree: { x: -2, y: -2, branch: 'utility' },
  },
  rubber_duck_protocol: {
    id: 'rubber_duck_protocol', label: 'Goldene Gummiente', description: '+25 Leben, 220 Pixel Magnet und 15 % weniger Schwerkraft. Quak.', category: 'core',
    cost: { credits: 1000 }, prerequisites: ['cargo_tetris', 'micro_jetpack'], prerequisiteMode: 'any', effects: [{ stat: 'maxHealth', op: 'add', value: 25 }, { stat: 'pickupRadius', op: 'set', value: 220 }, { stat: 'gravityMultiplier', op: 'multiply', value: 0.85 }], tree: { x: -3, y: -3, branch: 'utility' },
  },
  moonwalk_insurance: {
    id: 'moonwalk_insurance', label: "Mondlauf-Versicherung", description: "8 % Tempo und 8 % weniger Schwerkraft. Deckt keine Mondkrater.", category: 'boots',
    cost: { credits: 1500 }, prerequisites: ['spring_boots'], effects: [{ stat: 'moveSpeed', op: 'multiply', value: 1.08 }, { stat: 'gravityMultiplier', op: 'multiply', value: 0.92 }], tree: { x: -4, y: 4, branch: 'movement' },
  },
  ceiling_negotiator: {
    id: 'ceiling_negotiator', label: "Decken-Verhandler", description: "8 % mehr Sprung und 10 Leben. Einigt sich außergerichtlich mit Decken.", category: 'boots',
    cost: { credits: 2200 }, prerequisites: ['micro_jetpack', 'rocket_pants'], prerequisiteMode: 'any', effects: [{ stat: 'jumpVelocity', op: 'multiply', value: 1.08 }, { stat: 'maxHealth', op: 'add', value: 10 }], tree: { x: -5, y: 5, branch: 'movement' },
  },
  turbo_snail: {
    id: 'turbo_snail', label: "Turbo-Schnecke", description: "5 % Tempo und 20 Energie. Langsam war gestern, Schnecke bleibt.", category: 'boots',
    cost: { credits: 3200 }, prerequisites: ['micro_jetpack', 'moonwalk_insurance', 'xray_potato'], prerequisiteMode: 'any', effects: [{ stat: 'moveSpeed', op: 'multiply', value: 1.05 }, { stat: 'maxEnergy', op: 'add', value: 20 }], tree: { x: -6, y: 6, branch: 'movement' },
  },
  chrono_shoelaces: {
    id: 'chrono_shoelaces', label: "Chrono-Schnürsenkel", description: "8 % Tempo und 10 % schnellere Regeneration. Zeit ist nur schlecht gebunden.", category: 'boots',
    cost: { credits: 4500 }, prerequisites: ['rocket_pants', 'moonwalk_insurance'], prerequisiteMode: 'any', effects: [{ stat: 'moveSpeed', op: 'multiply', value: 1.08 }, { stat: 'energyRegenPerSec', op: 'multiply', value: 1.1 }], tree: { x: -7, y: 7, branch: 'movement' },
  },
  bounce_tax_refund: {
    id: 'bounce_tax_refund', label: "Hüpfsteuer-Rückzahlung", description: "10 % mehr Sprung und 15 Energie. Formular B-OIN-G genehmigt.", category: 'boots',
    cost: { credits: 6200 }, prerequisites: ['ceiling_negotiator', 'turbo_snail'], effects: [{ stat: 'jumpVelocity', op: 'multiply', value: 1.1 }, { stat: 'maxEnergy', op: 'add', value: 15 }], tree: { x: -8, y: 8, branch: 'movement' },
  },
  antigravity_sandwich: {
    id: 'antigravity_sandwich', label: "Antigrav-Sandwich", description: "Dritter Luftsprung und 18 % weniger Schwerkraft. Mit Käse stabiler.", category: 'boots',
    cost: { credits: 8500 }, prerequisites: ['ceiling_negotiator', 'chrono_shoelaces', 'unionized_nanobots'], prerequisiteMode: 'any', effects: [{ stat: 'airJumps', op: 'set', value: 3 }, { stat: 'gravityMultiplier', op: 'multiply', value: 0.82 }], tree: { x: -9, y: 9, branch: 'movement' },
  },
  panic_teleporter: {
    id: 'panic_teleporter', label: "Panik-Teleporter", description: "12 % Tempo und 25 Energie. Teleportiert nur deine Motivation.", category: 'boots',
    cost: { credits: 11000 }, prerequisites: ['turbo_snail', 'chrono_shoelaces'], effects: [{ stat: 'moveSpeed', op: 'multiply', value: 1.12 }, { stat: 'maxEnergy', op: 'add', value: 25 }], tree: { x: -10, y: 10, branch: 'movement' },
  },
  comet_kneecaps: {
    id: 'comet_kneecaps', label: "Kometen-Kniescheiben", description: "12 % mehr Sprung und 10 % weniger Schwerkraft. Orthopäden hassen sie.", category: 'boots',
    cost: { credits: 14500 }, prerequisites: ['bounce_tax_refund', 'antigravity_sandwich'], prerequisiteMode: 'any', effects: [{ stat: 'jumpVelocity', op: 'multiply', value: 1.12 }, { stat: 'gravityMultiplier', op: 'multiply', value: 0.9 }], tree: { x: -11, y: 11, branch: 'movement' },
  },
  quantum_hopscotch: {
    id: 'quantum_hopscotch', label: "Quantum-Himmel-und-Hölle", description: "Vier Luftsprünge und 8 % Tempo. Jeder zweite Sprung existiert nur wahrscheinlich.", category: 'boots',
    cost: { credits: 19000 }, prerequisites: ['antigravity_sandwich', 'panic_teleporter', 'prophetic_breadcrumbs'], prerequisiteMode: 'any', effects: [{ stat: 'airJumps', op: 'set', value: 4 }, { stat: 'moveSpeed', op: 'multiply', value: 1.08 }], tree: { x: -12, y: 12, branch: 'movement' },
  },
  uninstall_gravity: {
    id: 'uninstall_gravity', label: "Schwerkraft deinstallieren", description: "35 % weniger Schwerkraft, 12 % mehr Sprung und 50 Energie. Neustart nicht nötig.", category: 'boots',
    cost: { credits: 26000 }, prerequisites: ['comet_kneecaps', 'quantum_hopscotch'], prerequisiteMode: 'any', effects: [{ stat: 'gravityMultiplier', op: 'multiply', value: 0.65 }, { stat: 'jumpVelocity', op: 'multiply', value: 1.12 }, { stat: 'maxEnergy', op: 'add', value: 50 }], tree: { x: -13, y: 13, branch: 'movement' },
  },
  spectrum_monocle: {
    id: 'spectrum_monocle', label: "Spektrum-Monokel", description: "Ein Tile mehr Sicht. Sieht auch peinliche Mineralien.", category: 'visor',
    cost: { credits: 1500 }, prerequisites: ['wide_visor'], effects: [{ stat: 'sightRadius', op: 'add', value: 1 }], tree: { x: 4, y: -4, branch: 'vision' },
  },
  copper_gossip: {
    id: 'copper_gossip', label: "Kupfer-Klatschfunk", description: "Scanner +2 Tiles und Magnet +20 Pixel. Kupfer erzählt wirklich alles.", category: 'visor',
    cost: { credits: 2200 }, prerequisites: ['ore_scanner', 'xray_potato'], prerequisiteMode: 'any', effects: [{ stat: 'oreScannerRadius', op: 'add', value: 2 }, { stat: 'pickupRadius', op: 'add', value: 20 }], tree: { x: 5, y: -5, branch: 'vision' },
  },
  fog_coupon: {
    id: 'fog_coupon', label: "Nebel-Rabattcoupon", description: "Ein Tile mehr Sicht und 15 Energie. Nur heute: 30 % weniger Unwissen.", category: 'visor',
    cost: { credits: 3200 }, prerequisites: ['ore_scanner', 'spectrum_monocle', 'storm_subscription'], prerequisiteMode: 'any', effects: [{ stat: 'sightRadius', op: 'add', value: 1 }, { stat: 'maxEnergy', op: 'add', value: 15 }], tree: { x: 6, y: -6, branch: 'vision' },
  },
  geology_karaoke: {
    id: 'geology_karaoke', label: "Geologie-Karaoke", description: "Scanner +2 und 10 % Regeneration. Erze leuchten, wenn du falsch singst.", category: 'visor',
    cost: { credits: 4500 }, prerequisites: ['xray_potato', 'spectrum_monocle'], prerequisiteMode: 'any', effects: [{ stat: 'oreScannerRadius', op: 'add', value: 2 }, { stat: 'energyRegenPerSec', op: 'multiply', value: 1.1 }], tree: { x: 7, y: -7, branch: 'vision' },
  },
  schrodinger_map: {
    id: 'schrodinger_map', label: "Schrödingers Karte", description: "Sicht +1 und Scanner +1. Das Erz ist da und nicht da.", category: 'visor',
    cost: { credits: 6200 }, prerequisites: ['copper_gossip', 'fog_coupon'], effects: [{ stat: 'sightRadius', op: 'add', value: 1 }, { stat: 'oreScannerRadius', op: 'add', value: 1 }], tree: { x: 8, y: -8, branch: 'vision' },
  },
  bureaucratic_xray: {
    id: 'bureaucratic_xray', label: "Bürokratie-Röntgen", description: "Scanner +3 und 20 Leben. Genehmigt nur korrekt gestempelte Adern.", category: 'visor',
    cost: { credits: 8500 }, prerequisites: ['copper_gossip', 'geology_karaoke', 'chrono_shoelaces'], prerequisiteMode: 'any', effects: [{ stat: 'oreScannerRadius', op: 'add', value: 3 }, { stat: 'maxHealth', op: 'add', value: 20 }], tree: { x: 9, y: -9, branch: 'vision' },
  },
  prophetic_breadcrumbs: {
    id: 'prophetic_breadcrumbs', label: "Prophetische Brotkrumen", description: "Sicht +1 und Magnet +40 Pixel. Folgen auf eigene Gluten-Gefahr.", category: 'visor',
    cost: { credits: 11000 }, prerequisites: ['fog_coupon', 'geology_karaoke'], effects: [{ stat: 'sightRadius', op: 'add', value: 1 }, { stat: 'pickupRadius', op: 'add', value: 40 }], tree: { x: 10, y: -10, branch: 'vision' },
  },
  seismic_gossip: {
    id: 'seismic_gossip', label: "Seismischer Klatsch", description: "Scanner +3 und 8 % Laserschaden. Der Planet redet im Schlaf.", category: 'visor',
    cost: { credits: 14500 }, prerequisites: ['schrodinger_map', 'bureaucratic_xray'], prerequisiteMode: 'any', effects: [{ stat: 'oreScannerRadius', op: 'add', value: 3 }, { stat: 'miningDamagePerSec', op: 'multiply', value: 1.08 }], tree: { x: 11, y: -11, branch: 'vision' },
  },
  omniscient_toaster: {
    id: 'omniscient_toaster', label: "Allwissender Toaster", description: "Sicht +1, 40 Energie und 10 % Regeneration. Kennt dein Frühstück.", category: 'visor',
    cost: { credits: 19000 }, prerequisites: ['bureaucratic_xray', 'prophetic_breadcrumbs', 'recursive_pickaxe'], prerequisiteMode: 'any', effects: [{ stat: 'sightRadius', op: 'add', value: 1 }, { stat: 'maxEnergy', op: 'add', value: 40 }, { stat: 'energyRegenPerSec', op: 'multiply', value: 1.1 }], tree: { x: 12, y: -12, branch: 'vision' },
  },
  privacy_abolished: {
    id: 'privacy_abolished', label: "Planet ohne Privatsphäre", description: "Sicht +2, Scanner +4 und Magnet +80 Pixel. Datenschutz war optional.", category: 'visor',
    cost: { credits: 26000 }, prerequisites: ['seismic_gossip', 'omniscient_toaster'], prerequisiteMode: 'any', effects: [{ stat: 'sightRadius', op: 'add', value: 2 }, { stat: 'oreScannerRadius', op: 'add', value: 4 }, { stat: 'pickupRadius', op: 'add', value: 80 }], tree: { x: 13, y: -13, branch: 'vision' },
  },
  arc_apprentice: {
    id: 'arc_apprentice', label: "Lichtbogen-Lehrling", description: "Fünf Kettenziele und 5 % Schaden. Sicherheitsunterweisung übersprungen.", category: 'laser',
    cost: { credits: 1600 }, prerequisites: ['laser_focus'], effects: [{ stat: 'chainMiningTargets', op: 'set', value: 5 }, { stat: 'miningDamagePerSec', op: 'multiply', value: 1.05 }], tree: { x: 4, y: 4, branch: 'mining' },
  },
  ore_blender: {
    id: 'ore_blender', label: "Erz-Mixer", description: "12 % Schaden bei 7 % weniger Energieverbrauch. Smoothies separat erhältlich.", category: 'laser',
    cost: { credits: 2400 }, prerequisites: ['chain_lightning', 'storm_subscription'], prerequisiteMode: 'any', effects: [{ stat: 'miningDamagePerSec', op: 'multiply', value: 1.12 }, { stat: 'energyCostPerSec', op: 'multiply', value: 0.93 }], tree: { x: 5, y: 5, branch: 'mining' },
  },
  laser_spaghetti: {
    id: 'laser_spaghetti', label: "Laser-Spaghetti", description: "Zwei Tiles mehr Reichweite. Al dente und hochenergetisch.", category: 'laser',
    cost: { credits: 3500 }, prerequisites: ['chain_lightning', 'arc_apprentice', 'rubber_duck_protocol'], prerequisiteMode: 'any', effects: [{ stat: 'miningRange', op: 'add', value: TILE_SIZE * 2 }], tree: { x: 6, y: 6, branch: 'mining' },
  },
  thunder_ferret: {
    id: 'thunder_ferret', label: "Donner-Frettchen", description: "Sechs Kettenziele und Magnet +30 Pixel. Bitte nicht füttern.", category: 'laser',
    cost: { credits: 5000 }, prerequisites: ['storm_subscription', 'arc_apprentice'], prerequisiteMode: 'any', effects: [{ stat: 'chainMiningTargets', op: 'set', value: 6 }, { stat: 'pickupRadius', op: 'add', value: 30 }], tree: { x: 7, y: 7, branch: 'mining' },
  },
  tax_evasion_drill: {
    id: 'tax_evasion_drill', label: "Steuerflucht-Bohrer", description: "15 % Schaden und +2 Stackgröße. Finanzamt hasst diesen Trick.", category: 'laser',
    cost: { credits: 7000 }, prerequisites: ['ore_blender', 'laser_spaghetti'], effects: [{ stat: 'miningDamagePerSec', op: 'multiply', value: 1.15 }, { stat: 'cargoStackLimit', op: 'add', value: 2 }], tree: { x: 8, y: 8, branch: 'mining' },
  },
  plasma_fondue: {
    id: 'plasma_fondue', label: "Plasma-Fondue", description: "15 % Schaden und ein Tile Reichweite. Erz bitte nicht doppelt dippen.", category: 'laser',
    cost: { credits: 9500 }, prerequisites: ['ore_blender', 'thunder_ferret', 'unionized_nanobots'], prerequisiteMode: 'any', effects: [{ stat: 'miningDamagePerSec', op: 'multiply', value: 1.15 }, { stat: 'miningRange', op: 'add', value: TILE_SIZE }], tree: { x: 9, y: 9, branch: 'mining' },
  },
  recursive_pickaxe: {
    id: 'recursive_pickaxe', label: "Rekursive Spitzhacke", description: "Acht Kettenziele und 10 % Schaden. Baut sich gelegentlich selbst ab.", category: 'laser',
    cost: { credits: 12500 }, prerequisites: ['laser_spaghetti', 'thunder_ferret'], effects: [{ stat: 'chainMiningTargets', op: 'set', value: 8 }, { stat: 'miningDamagePerSec', op: 'multiply', value: 1.1 }], tree: { x: 10, y: 10, branch: 'mining' },
  },
  caffeinated_beam: {
    id: 'caffeinated_beam', label: "Koffein-Strahl", description: "20 % Schaden, 10 % weniger Verbrauch und 5 % Tempo. Zittert präzise.", category: 'laser',
    cost: { credits: 16500 }, prerequisites: ['tax_evasion_drill', 'plasma_fondue'], prerequisiteMode: 'any', effects: [{ stat: 'miningDamagePerSec', op: 'multiply', value: 1.2 }, { stat: 'energyCostPerSec', op: 'multiply', value: 0.9 }, { stat: 'moveSpeed', op: 'multiply', value: 1.05 }], tree: { x: 11, y: 11, branch: 'mining' },
  },
  localized_apocalypse: {
    id: 'localized_apocalypse', label: "Lokale Apokalypse", description: "Zehn Kettenziele, zwei Tiles Reichweite und 30 Energie. Nur lokal schlimm.", category: 'laser',
    cost: { credits: 21500 }, prerequisites: ['plasma_fondue', 'recursive_pickaxe', 'portable_shipyard'], prerequisiteMode: 'any', effects: [{ stat: 'chainMiningTargets', op: 'set', value: 10 }, { stat: 'miningRange', op: 'add', value: TILE_SIZE * 2 }, { stat: 'maxEnergy', op: 'add', value: 30 }], tree: { x: 12, y: 12, branch: 'mining' },
  },
  planetary_unsubscribe: {
    id: 'planetary_unsubscribe', label: "Planet deabonnieren", description: "35 % Schaden, zwölf Kettenziele und 20 % weniger Verbrauch. Newsletter beendet.", category: 'laser',
    cost: { credits: 30000 }, prerequisites: ['caffeinated_beam', 'localized_apocalypse'], prerequisiteMode: 'any', effects: [{ stat: 'miningDamagePerSec', op: 'multiply', value: 1.35 }, { stat: 'chainMiningTargets', op: 'set', value: 12 }, { stat: 'energyCostPerSec', op: 'multiply', value: 0.8 }], tree: { x: 13, y: 13, branch: 'mining' },
  },
  emergency_banana: {
    id: 'emergency_banana', label: "Notfall-Banane", description: "20 Leben und 5 % mehr Sprung. Kaliumbasierte Raumfahrt.", category: 'core',
    cost: { credits: 1500 }, prerequisites: ['cargo_tetris'], effects: [{ stat: 'maxHealth', op: 'add', value: 20 }, { stat: 'jumpVelocity', op: 'multiply', value: 1.05 }], tree: { x: -4, y: -4, branch: 'utility' },
  },
  cargo_origami: {
    id: 'cargo_origami', label: "Cargo-Origami", description: "Vier mehr pro Stack und ein Cargo-Slot. Faltet auch massive Basaltbrocken.", category: 'cargo',
    cost: { credits: 2300 }, prerequisites: ['pocket_wormhole', 'rubber_duck_protocol'], prerequisiteMode: 'any', effects: [{ stat: 'cargoStackLimit', op: 'add', value: 4 }, { stat: 'cargoSlots', op: 'add', value: 1 }], tree: { x: -5, y: -5, branch: 'utility' },
  },
  pocket_dimension: {
    id: 'pocket_dimension', label: "Hosentaschen-Dimension", description: "Magnet +60 Pixel und +3 Stackgröße. Fussel nicht mitgerechnet.", category: 'cargo',
    cost: { credits: 3400 }, prerequisites: ['pocket_wormhole', 'emergency_banana', 'rocket_pants'], prerequisiteMode: 'any', effects: [{ stat: 'pickupRadius', op: 'add', value: 60 }, { stat: 'cargoStackLimit', op: 'add', value: 3 }], tree: { x: -6, y: -6, branch: 'utility' },
  },
  unionized_nanobots: {
    id: 'unionized_nanobots', label: "Gewerkschafts-Nanobots", description: "25 % Regeneration und 20 Leben. Machen gesetzliche Ladepause.", category: 'core',
    cost: { credits: 4800 }, prerequisites: ['rubber_duck_protocol', 'emergency_banana'], prerequisiteMode: 'any', effects: [{ stat: 'energyRegenPerSec', op: 'multiply', value: 1.25 }, { stat: 'maxHealth', op: 'add', value: 20 }], tree: { x: -7, y: -7, branch: 'utility' },
  },
  loot_boomerang: {
    id: 'loot_boomerang', label: "Loot-Bumerang", description: "Magnet +80 Pixel und ein Tile Laserreichweite. Kommt meistens zurück.", category: 'cargo',
    cost: { credits: 6700 }, prerequisites: ['cargo_origami', 'pocket_dimension'], effects: [{ stat: 'pickupRadius', op: 'add', value: 80 }, { stat: 'miningRange', op: 'add', value: TILE_SIZE }], tree: { x: -8, y: -8, branch: 'utility' },
  },
  insurance_fraud: {
    id: 'insurance_fraud', label: "Meteoriten-Versicherungsbetrug", description: "30 Leben und 30 Energie. Schaden bitte leserlich einreichen.", category: 'core',
    cost: { credits: 9000 }, prerequisites: ['cargo_origami', 'unionized_nanobots', 'thunder_ferret'], prerequisiteMode: 'any', effects: [{ stat: 'maxHealth', op: 'add', value: 30 }, { stat: 'maxEnergy', op: 'add', value: 30 }], tree: { x: -9, y: -9, branch: 'utility' },
  },
  portable_shipyard: {
    id: 'portable_shipyard', label: "Tragbare Schiffswerft", description: "+5 Energieregeneration und ein Cargo-Slot. Passt knapp in die Tasche.", category: 'ship',
    cost: { credits: 12000 }, prerequisites: ['pocket_dimension', 'unionized_nanobots'], effects: [{ stat: 'energyRegenPerSec', op: 'add', value: 5 }, { stat: 'cargoSlots', op: 'add', value: 1 }], tree: { x: -10, y: -10, branch: 'utility' },
  },
  cosmic_vacuum: {
    id: 'cosmic_vacuum', label: "Kosmischer Staubsauger", description: "400 Pixel Magnet und +5 Stackgröße. Verschluckt Kleingeld.", category: 'cargo',
    cost: { credits: 16000 }, prerequisites: ['loot_boomerang', 'insurance_fraud'], prerequisiteMode: 'any', effects: [{ stat: 'pickupRadius', op: 'set', value: 400 }, { stat: 'cargoStackLimit', op: 'add', value: 5 }], tree: { x: -11, y: -11, branch: 'utility' },
  },
  administrative_immortality: {
    id: 'administrative_immortality', label: "Administrative Unsterblichkeit", description: "50 Leben, 50 Energie und 8 % weniger Schwerkraft. Tod nicht genehmigt.", category: 'core',
    cost: { credits: 21000 }, prerequisites: ['insurance_fraud', 'portable_shipyard', 'panic_teleporter'], prerequisiteMode: 'any', effects: [{ stat: 'maxHealth', op: 'add', value: 50 }, { stat: 'maxEnergy', op: 'add', value: 50 }, { stat: 'gravityMultiplier', op: 'multiply', value: 0.92 }], tree: { x: -12, y: -12, branch: 'utility' },
  },
  reality_premium: {
    id: 'reality_premium', label: "Gravitationskern", description: "75 Leben/Energie, 15 % Schaden, 10 % Tempo, +1 Sicht und +100 Magnet.", category: 'core',
    cost: { credits: 30000 }, prerequisites: ['cosmic_vacuum', 'administrative_immortality', 'uninstall_gravity', 'privacy_abolished', 'planetary_unsubscribe'], prerequisiteMode: 'any', effects: [{ stat: 'maxHealth', op: 'add', value: 75 }, { stat: 'maxEnergy', op: 'add', value: 75 }, { stat: 'miningDamagePerSec', op: 'multiply', value: 1.15 }, { stat: 'moveSpeed', op: 'multiply', value: 1.1 }, { stat: 'sightRadius', op: 'add', value: 1 }, { stat: 'pickupRadius', op: 'add', value: 100 }], tree: { x: -13, y: -13, branch: 'utility' },
  },
  laser_mk2: {
    id: 'laser_mk2',
    label: 'Laser MK2',
    category: 'laser',
    cost: { credits: 100 },
    effects: [{ stat: 'miningRange', op: 'add', value: TILE_SIZE }],
  },
  laser_mk3: {
    id: 'laser_mk3',
    label: 'Laser MK3',
    category: 'laser',
    cost: { credits: 300 },
    prerequisites: ['laser_mk2'],
    effects: [{ stat: 'miningRange', op: 'add', value: TILE_SIZE * 2 }],
  },
  laser_mk4: {
    id: 'laser_mk4',
    label: 'Laser MK4',
    category: 'laser',
    cost: { credits: 800 },
    prerequisites: ['laser_mk3'],
    effects: [{ stat: 'miningRange', op: 'add', value: TILE_SIZE * 3 }],
  },
  piercing_laser: {
    id: 'piercing_laser',
    label: 'Durchschlags-Laser',
    category: 'laser',
    cost: { credits: 500 },
    effects: [{ stat: 'miningDamagePerSec', op: 'multiply', value: 1.15 }],
  },
  fast_laser: {
    id: 'fast_laser',
    label: 'Schnell-Laser',
    category: 'laser',
    cost: { credits: 600 },
    effects: [{ stat: 'miningDamagePerSec', op: 'multiply', value: 1.5 }],
  },
  auto_laser: {
    id: 'auto_laser',
    label: 'Auto-Laser',
    category: 'laser',
    cost: { credits: 1000 },
    effects: [{ stat: 'energyCostPerSec', op: 'multiply', value: 0.9 }],
  },
  spectral_laser: {
    id: 'spectral_laser',
    label: 'Spektral-Laser',
    category: 'laser',
    cost: { credits: 1500 },
    effects: [{ stat: 'sightRadius', op: 'add', value: 1 }],
  },
  visor_mk1: {
    id: 'visor_mk1',
    label: 'Visier MK1',
    category: 'visor',
    cost: { credits: 150 },
    effects: [{ stat: 'sightRadius', op: 'set', value: 3 }],
  },
  visor_mk2: {
    id: 'visor_mk2',
    label: 'Visier MK2',
    category: 'visor',
    cost: { credits: 400 },
    prerequisites: ['visor_mk1'],
    effects: [{ stat: 'sightRadius', op: 'set', value: 4 }],
  },
  radar_visor: {
    id: 'radar_visor',
    label: 'Radar-Visier',
    category: 'visor',
    cost: { credits: 900 },
    prerequisites: ['visor_mk2'],
    effects: [{ stat: 'sightRadius', op: 'set', value: 5 }],
  },
  quantum_visor: {
    id: 'quantum_visor',
    label: 'Quantum-Visier',
    category: 'visor',
    cost: { credits: 2000 },
    prerequisites: ['radar_visor'],
    effects: [{ stat: 'sightRadius', op: 'set', value: 6 }],
  },
  battery_mk1: {
    id: 'battery_mk1',
    label: 'Batterie MK1',
    category: 'battery',
    cost: { credits: 400 },
    effects: [{ stat: 'maxEnergy', op: 'set', value: 150 }],
  },
  battery_mk2: {
    id: 'battery_mk2',
    label: 'Batterie MK2',
    category: 'battery',
    cost: { credits: 900 },
    prerequisites: ['battery_mk1'],
    effects: [{ stat: 'maxEnergy', op: 'set', value: 250 }],
  },
  battery_mk3: {
    id: 'battery_mk3',
    label: 'Batterie MK3',
    category: 'battery',
    cost: { credits: 2000 },
    prerequisites: ['battery_mk2'],
    effects: [{ stat: 'maxEnergy', op: 'set', value: 400 }],
  },
  battery_fusion: {
    id: 'battery_fusion',
    label: 'Batterie Fusion',
    category: 'battery',
    cost: { credits: 5000 },
    prerequisites: ['battery_mk3'],
    effects: [{ stat: 'maxEnergy', op: 'set', value: 700 }],
  },
  boots_mk1: {
    id: 'boots_mk1',
    label: 'Stiefel MK1',
    category: 'boots',
    cost: { credits: 500 },
    effects: [{ stat: 'jumpVelocity', op: 'multiply', value: 1.05 }],
  },
  boots_mk2: {
    id: 'boots_mk2',
    label: 'Stiefel MK2',
    category: 'boots',
    cost: { credits: 1200 },
    prerequisites: ['boots_mk1'],
    effects: [{ stat: 'jumpVelocity', op: 'multiply', value: 1.1 }],
  },
  boots_mk3: {
    id: 'boots_mk3',
    label: 'Stiefel MK3',
    category: 'boots',
    cost: { credits: 3000 },
    prerequisites: ['boots_mk2'],
    effects: [{ stat: 'jumpVelocity', op: 'multiply', value: 1.16 }],
  },
  boots_mk4: {
    id: 'boots_mk4',
    label: 'Stiefel MK4',
    category: 'boots',
    cost: { credits: 6000 },
    prerequisites: ['boots_mk3'],
    effects: [{ stat: 'jumpVelocity', op: 'multiply', value: 1.22 }],
  },
  speed_mk1: {
    id: 'speed_mk1',
    label: 'Servo-Antrieb I',
    category: 'boots',
    cost: { credits: 60 },
    effects: [{ stat: 'moveSpeed', op: 'set', value: 489 }],
  },
  speed_mk2: {
    id: 'speed_mk2',
    label: 'Servo-Antrieb II',
    category: 'boots',
    cost: { credits: 180 },
    prerequisites: ['speed_mk1'],
    effects: [{ stat: 'moveSpeed', op: 'set', value: 508 }],
  },
  speed_mk3: {
    id: 'speed_mk3',
    label: 'Servo-Antrieb III',
    category: 'boots',
    cost: { credits: 420 },
    prerequisites: ['speed_mk2'],
    effects: [{ stat: 'moveSpeed', op: 'set', value: 526 }],
  },
  core_compass: {
    id: 'core_compass',
    label: 'Core-Compass',
    category: 'core',
    cost: { credits: 800 },
    effects: [],
  },
  core_scanner: {
    id: 'core_scanner',
    label: 'Core-Scanner',
    category: 'core',
    cost: { credits: 2000 },
    prerequisites: ['core_compass'],
    effects: [],
  },
  advanced_mapper: {
    id: 'advanced_mapper',
    label: 'Advanced-Mapper',
    category: 'core',
    cost: { credits: 5000 },
    prerequisites: ['core_scanner'],
    effects: [{ stat: 'sightRadius', op: 'add', value: 1 }],
  },
  cargo_mk1: {
    id: 'cargo_mk1',
    label: 'Erweiterter Laderaum I',
    category: 'cargo',
    cost: { credits: 75 },
    effects: [{ stat: 'cargoSlots', op: 'set', value: 3 }],
  },
  cargo_mk2: {
    id: 'cargo_mk2',
    label: 'Erweiterter Laderaum II',
    category: 'cargo',
    cost: { credits: 225 },
    prerequisites: ['cargo_mk1'],
    effects: [{ stat: 'cargoSlots', op: 'set', value: 4 }],
  },
  cargo_mk3: {
    id: 'cargo_mk3',
    label: 'Erweiterter Laderaum III',
    category: 'cargo',
    cost: { credits: 525 },
    prerequisites: ['cargo_mk2'],
    effects: [{ stat: 'cargoSlots', op: 'set', value: 5 }],
  },
  cargo_stack_mk1: {
    id: 'cargo_stack_mk1',
    label: 'Cargo-Slot-Größe I',
    category: 'cargo',
    cost: { credits: 90 },
    effects: [{ stat: 'cargoStackLimit', op: 'set', value: 5 }],
  },
  cargo_stack_mk2: {
    id: 'cargo_stack_mk2',
    label: 'Cargo-Slot-Größe II',
    category: 'cargo',
    cost: { credits: 260 },
    prerequisites: ['cargo_stack_mk1'],
    effects: [{ stat: 'cargoStackLimit', op: 'set', value: 8 }],
  },
  cargo_stack_mk3: {
    id: 'cargo_stack_mk3',
    label: 'Cargo-Slot-Größe III',
    category: 'cargo',
    cost: { credits: 600 },
    prerequisites: ['cargo_stack_mk2'],
    effects: [{ stat: 'cargoStackLimit', op: 'set', value: 12 }],
  },
  engine_mk1: {
    id: 'engine_mk1',
    label: 'Triebwerke MK1',
    category: 'ship',
    cost: { credits: 500 },
    effects: [{ stat: 'fuelEfficiency', op: 'multiply', value: 1.1 }],
  },
  engine_mk2: {
    id: 'engine_mk2',
    label: 'Triebwerke MK2',
    category: 'ship',
    cost: { credits: 1500 },
    prerequisites: ['engine_mk1'],
    effects: [{ stat: 'fuelEfficiency', op: 'multiply', value: 1.25 }],
  },
  engine_mk3: {
    id: 'engine_mk3',
    label: 'Triebwerke MK3',
    category: 'ship',
    cost: { credits: 4000 },
    prerequisites: ['engine_mk2'],
    effects: [{ stat: 'fuelEfficiency', op: 'multiply', value: 1.4 }],
  },
};
