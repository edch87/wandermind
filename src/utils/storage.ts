import type { UserProfile, BucketListItem } from '../types';

const PROFILE_KEY = 'wandermind_profile';
const ITEMS_KEY = 'wandermind_items';

export function getProfile(): UserProfile | null {
  const data = localStorage.getItem(PROFILE_KEY);
  return data ? JSON.parse(data) : null;
}

export function saveProfile(profile: UserProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function getItems(): BucketListItem[] {
  const data = localStorage.getItem(ITEMS_KEY);
  return data ? JSON.parse(data) : [];
}

export function saveItem(item: BucketListItem): void {
  const items = getItems();
  const idx = items.findIndex(i => i.id === item.id);
  if (idx >= 0) {
    items[idx] = item;
  } else {
    items.push(item);
  }
  localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
}

export function deleteItem(id: string): void {
  const items = getItems().filter(i => i.id !== id);
  localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
}

export function generateId(): string {
  return crypto.randomUUID();
}
