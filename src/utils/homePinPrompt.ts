/**
 * Tracks whether a user has had the chance to refine their home location with
 * the new address-precise pin flow. Used to drive the Dashboard banner that
 * invites existing (city-level) users to update their home.
 *
 * The flag is set in three places:
 *  - End of onboarding (new users complete the pin step natively)
 *  - Settings save handler (any time a user re-saves their home)
 *  - Banner dismiss handler (the "Not now" path — roadmap calls for a
 *    one-time prompt, so dismissal sticks)
 *
 * Stored in localStorage keyed by user id so it survives reloads but doesn't
 * leak between accounts on a shared device.
 */

const KEY_PREFIX = 'lark.homePinRefined.';

export function isHomePinRefined(userId: string): boolean {
  try {
    return localStorage.getItem(KEY_PREFIX + userId) === '1';
  } catch {
    return true; // If storage is unavailable, suppress the banner rather than nag.
  }
}

export function markHomePinRefined(userId: string): void {
  try {
    localStorage.setItem(KEY_PREFIX + userId, '1');
  } catch {
    // Storage disabled — silently ignore; the banner will reappear on reload.
  }
}
