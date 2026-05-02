import type { InventoryState, ItemId } from './types';

export function createInventory(capacity: number): InventoryState {
  return { capacity, items: {} };
}

export function getInventoryCount(inventory: InventoryState, itemId: ItemId): number {
  return inventory.items[itemId] ?? 0;
}

export function getInventoryUsed(inventory: InventoryState): number {
  return Object.values(inventory.items).reduce((sum, count) => sum + (count ?? 0), 0);
}

export function getInventoryRemaining(inventory: InventoryState): number {
  return Math.max(0, inventory.capacity - getInventoryUsed(inventory));
}

export function canAddItem(inventory: InventoryState, quantity = 1): boolean {
  return getInventoryRemaining(inventory) >= quantity;
}

export function addItem(inventory: InventoryState, itemId: ItemId, quantity = 1): number {
  const accepted = Math.min(quantity, getInventoryRemaining(inventory));
  if (accepted <= 0) return 0;

  inventory.items[itemId] = getInventoryCount(inventory, itemId) + accepted;
  return accepted;
}

export function removeItem(inventory: InventoryState, itemId: ItemId, quantity = 1): number {
  const current = getInventoryCount(inventory, itemId);
  const removed = Math.min(current, quantity);
  const next = current - removed;

  if (next > 0) {
    inventory.items[itemId] = next;
  } else {
    delete inventory.items[itemId];
  }

  return removed;
}

export function inventorySummary(inventory: InventoryState): string {
  const entries = Object.entries(inventory.items)
    .filter((entry): entry is [ItemId, number] => Boolean(entry[1]))
    .map(([itemId, count]) => `${itemId}:${count}`);

  return entries.length > 0 ? entries.join('  ') : 'leer';
}
