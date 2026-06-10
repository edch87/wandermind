/**
 * Tracks which bucket-list items the user has recently been recommended,
 * so we can softly down-rank them and avoid showing the same 3 every time.
 *
 * Persisted to localStorage (per-browser), with a rolling 3-day window
 * and a 10-item cap. Soft penalty only — see recommendation.ts.
 */

const STORAGE_KEY = 'lark:recent-shown';
const MAX_ENTRIES = 10;
const TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

interface Entry {
  id: string;
  shownAt: number; // epoch ms
}

function readRaw(): Entry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e): e is Entry =>
      e && typeof e.id === 'string' && typeof e.shownAt === 'number'
    );
  } catch {
    return [];
  }
}

function writeRaw(entries: Entry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — fail silently
  }
}

/** IDs to soft-penalise in scoring. Expired entries are filtered out. */
export function getSuppressedIds(): string[] {
  const now = Date.now();
  const fresh = readRaw().filter(e => now - e.shownAt < TTL_MS);
  return fresh.map(e => e.id);
}

/**
 * Record that these item IDs were just shown to the user.
 * Keeps the most recent MAX_ENTRIES across all calls, dedupes by ID
 * (newest occurrence wins), and prunes expired entries.
 */
export function recordShown(ids: string[]): void {
  if (ids.length === 0) return;
  const now = Date.now();
  const existing = readRaw().filter(e => now - e.shownAt < TTL_MS);
  const newEntries: Entry[] = ids.map(id => ({ id, shownAt: now }));
  // Newest first, dedupe by id (keep newest), cap to MAX_ENTRIES.
  const merged = [...newEntries, ...existing];
  const seen = new Set<string>();
  const deduped: Entry[] = [];
  for (const e of merged) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    deduped.push(e);
    if (deduped.length >= MAX_ENTRIES) break;
  }
  writeRaw(deduped);
}
