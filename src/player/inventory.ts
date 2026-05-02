import type { InventorySlot, InventoryState, ItemId } from './types';

export function createInventory(slotCount: number, stackLimit: number): InventoryState {
  return {
    slots: Array.from({ length: Math.max(0, Math.floor(slotCount)) }, () => ({ quantity: 0 })),
    stackLimit,
  };
}

export function normalizeInventory(raw: unknown, slotCount: number, stackLimit: number): InventoryState {
  const fallback = createInventory(slotCount, stackLimit);
  if (!raw || typeof raw !== 'object') return fallback;

  const maybe = raw as Partial<InventoryState> & { capacity?: number; items?: Partial<Record<ItemId, number>> };
  if (Array.isArray(maybe.slots)) {
    const slots = maybe.slots.slice(0, slotCount).map(normalizeSlot);
    while (slots.length < slotCount) slots.push({ quantity: 0 });
    return { slots, stackLimit };
  }

  if (maybe.items && typeof maybe.items === 'object') {
    const inventory = fallback;
    for (const [itemId, count] of Object.entries(maybe.items) as [ItemId, number][]) {
      addItem(inventory, itemId, count ?? 0);
    }
    return inventory;
  }

  return fallback;
}

export function getInventoryCount(inventory: InventoryState, itemId: ItemId): number {
  return inventory.slots.reduce((sum, slot) => sum + (slot.itemId === itemId ? slot.quantity : 0), 0);
}

export function getInventoryUsed(inventory: InventoryState): number {
  return inventory.slots.reduce((sum, slot) => sum + slot.quantity, 0);
}

export function getInventoryRemaining(inventory: InventoryState): number {
  return inventory.slots.reduce((sum, slot) => {
    if (!slot.itemId || slot.quantity <= 0) return sum + inventory.stackLimit;
    return sum + Math.max(0, inventory.stackLimit - slot.quantity);
  }, 0);
}

export function canAddItem(inventory: InventoryState, itemId: ItemId, quantity = 1): boolean {
  return findWritableSlot(inventory, itemId, quantity) !== undefined;
}

export function addItem(inventory: InventoryState, itemId: ItemId, quantity = 1): number {
  let remaining = Math.max(0, Math.floor(quantity));
  let accepted = 0;

  while (remaining > 0) {
    const slot = findWritableSlot(inventory, itemId, 1);
    if (!slot) break;

    if (!slot.itemId || slot.quantity <= 0) {
      slot.itemId = itemId;
      slot.quantity = 0;
    }

    const space = inventory.stackLimit - slot.quantity;
    const added = Math.min(space, remaining);
    slot.quantity += added;
    accepted += added;
    remaining -= added;
  }

  return accepted;
}

export function removeItem(inventory: InventoryState, itemId: ItemId, quantity = 1): number {
  let remaining = Math.max(0, Math.floor(quantity));
  let removed = 0;

  for (const slot of inventory.slots) {
    if (slot.itemId !== itemId || remaining <= 0) continue;
    const amount = Math.min(slot.quantity, remaining);
    slot.quantity -= amount;
    removed += amount;
    remaining -= amount;
    if (slot.quantity <= 0) clearSlot(slot);
  }

  return removed;
}

export function inventorySummary(inventory: InventoryState): string {
  const entries = inventory.slots
    .filter((slot): slot is Required<InventorySlot> => Boolean(slot.itemId && slot.quantity > 0))
    .map((slot) => `${slot.itemId}:${slot.quantity}`);

  return entries.length > 0 ? entries.join('  ') : 'leer';
}

function findWritableSlot(inventory: InventoryState, itemId: ItemId, quantity: number): InventorySlot | undefined {
  const stack = inventory.slots.find((slot) => slot.itemId === itemId && slot.quantity + quantity <= inventory.stackLimit);
  if (stack) return stack;
  return inventory.slots.find((slot) => !slot.itemId || slot.quantity <= 0);
}

function normalizeSlot(slot: unknown): InventorySlot {
  if (!slot || typeof slot !== 'object') return { quantity: 0 };
  const raw = slot as Partial<InventorySlot>;
  if (!raw.itemId || !raw.quantity || raw.quantity <= 0) return { quantity: 0 };
  return { itemId: raw.itemId, quantity: Math.floor(raw.quantity) };
}

function clearSlot(slot: InventorySlot): void {
  delete slot.itemId;
  slot.quantity = 0;
}
