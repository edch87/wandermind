import type { UserProfile } from '../types';

/** Up to two initials from the user's display name, for the avatar button.
 *  Falls back to a single character when there's only one word, and to a
 *  bullet when displayName is empty (shouldn't happen post-onboarding). */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '•';
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Top-right circular avatar that opens Settings. Shared across the primary
 * content tabs (Dashboard, My List, Discover) since Settings was removed from
 * the bottom nav on 2026-06-30 ([[project-nav-structure]]). 44x44 hit area,
 * descriptive aria-label, focus ring. The button gives Settings a consistent,
 * predictable home no matter which tab the user is on.
 */
export default function HeaderAvatar({ profile, onOpen }: {
  profile: UserProfile;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      aria-label="Open settings"
      className="flex-shrink-0 w-11 h-11 rounded-full bg-sand-200 text-sand-900 text-sm font-semibold flex items-center justify-center hover:bg-sand-300 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50"
    >
      {getInitials(profile.displayName)}
    </button>
  );
}
