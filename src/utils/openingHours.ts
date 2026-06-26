/**
 * Opening hours parser and formatter for OSM opening_hours strings.
 * Handles common patterns like "Mo-Fr 09:00-17:00; Sa 10:00-14:00"
 */

const DAY_NAMES: Record<string, string> = {
  Mo: 'Mon', Tu: 'Tue', We: 'Wed', Th: 'Thu', Fr: 'Fri', Sa: 'Sat', Su: 'Sun',
};

const DAY_ORDER = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const FULL_DAY_NAMES: Record<string, string> = {
  Mo: 'Monday', Tu: 'Tuesday', We: 'Wednesday', Th: 'Thursday',
  Fr: 'Friday', Sa: 'Saturday', Su: 'Sunday',
};

interface DaySchedule {
  days: string; // e.g. "Mon-Fri" or "Sat"
  hours: string; // e.g. "9:00 AM - 5:00 PM" or "Closed"
}

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  if (isNaN(h)) return time;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  if (m === 0) return `${hour12} ${suffix}`;
  return `${hour12}:${m.toString().padStart(2, '0')} ${suffix}`;
}

function formatDayRange(daySpec: string): string {
  // Handle ranges like "Mo-Fr", single days "Sa", or lists "Mo,We,Fr"
  return daySpec.replace(/([A-Z][a-z])/g, (match) => DAY_NAMES[match] || match)
    .replace(/,/g, ', ');
}

function formatTimeRange(timeSpec: string): string {
  if (timeSpec.trim() === 'off') return 'Closed';
  if (timeSpec.trim() === '24/7') return 'Open 24 hours';

  return timeSpec.split(',').map(range => {
    const parts = range.trim().split('-');
    if (parts.length === 2) {
      return `${formatTime(parts[0].trim())} - ${formatTime(parts[1].trim())}`;
    }
    return range.trim();
  }).join(', ');
}

/**
 * Parse an OSM opening_hours string into structured day schedules.
 */
export function parseOpeningHours(raw: string): DaySchedule[] {
  if (!raw) return [];

  // Handle simple cases
  if (raw.trim() === '24/7') return [{ days: 'Every day', hours: 'Open 24 hours' }];

  const schedules: DaySchedule[] = [];

  // Split on semicolons for different rules
  const rules = raw.split(';').map(r => r.trim()).filter(Boolean);

  for (const rule of rules) {
    // Try to match "DaySpec TimeSpec" pattern
    // e.g. "Mo-Fr 09:00-17:00" or "Sa 10:00-14:00" or "Su off"
    const match = rule.match(/^([A-Z][a-z][\w,\s-]*?)\s+([\d:,\s-]+|off)$/i);
    if (match) {
      schedules.push({
        days: formatDayRange(match[1].trim()),
        hours: formatTimeRange(match[2].trim()),
      });
    } else if (rule.match(/^\d{2}:\d{2}-\d{2}:\d{2}$/)) {
      // Just a time range without days specified
      schedules.push({
        days: 'Every day',
        hours: formatTimeRange(rule),
      });
    } else {
      // Fallback: just show the raw rule cleaned up
      schedules.push({
        days: '',
        hours: rule,
      });
    }
  }

  return schedules;
}

/**
 * Format opening hours into a nicely readable multi-line string.
 */
export function formatOpeningHours(raw: string): string {
  if (!raw) return '';
  const schedules = parseOpeningHours(raw);
  if (schedules.length === 0) return raw;

  return schedules.map(s =>
    s.days ? `${s.days}: ${s.hours}` : s.hours
  ).join('\n');
}

/**
 * Get the day-of-week abbreviation for a given date (OSM format).
 */
function getOsmDay(date: Date): string {
  return DAY_ORDER[date.getDay() === 0 ? 6 : date.getDay() - 1];
}

/**
 * Check if a place is likely open at a given date, and generate warnings.
 * Returns null if can't determine, or a warning/info string.
 */
export function getOpeningHoursWarning(raw: string | undefined, targetDate: string): string | null {
  if (!raw) return null;
  if (raw.trim() === '24/7') return null; // Always open

  const date = new Date(targetDate + 'T12:00:00');
  const targetDay = getOsmDay(date);

  const rules = raw.split(';').map(r => r.trim()).filter(Boolean);

  for (const rule of rules) {
    const match = rule.match(/^([A-Z][a-z][\w,\s-]*?)\s+([\d:,\s-]+|off)$/i);
    if (!match) continue;

    const daySpec = match[1].trim();
    const timeSpec = match[2].trim();

    // Check if this rule applies to the target day
    if (dayMatchesSpec(targetDay, daySpec)) {
      if (timeSpec === 'off') {
        return `Closed on ${FULL_DAY_NAMES[targetDay] || targetDay}s`;
      }

      // Parse closing time to generate warnings
      const times = timeSpec.split(',').map(t => t.trim());
      const lastRange = times[times.length - 1];
      const closeParts = lastRange.split('-');
      if (closeParts.length === 2) {
        const closeTime = closeParts[1].trim();
        const [closeH] = closeTime.split(':').map(Number);

        if (closeH <= 14) {
          return `Only open until ${formatTime(closeTime)} — lunchtime hours`;
        } else if (closeH <= 17) {
          return `Closes at ${formatTime(closeTime)}`;
        } else if (closeH <= 19) {
          return `Open until ${formatTime(closeTime)}`;
        }
      }

      // Check for late opening
      const openParts = times[0].split('-');
      if (openParts.length === 2) {
        const openTime = openParts[0].trim();
        const [openH] = openTime.split(':').map(Number);
        if (openH >= 11) {
          return `Opens at ${formatTime(openTime)}`;
        }
      }

      return null;
    }
  }

  // If no rule matched this day, it might be closed
  // Only flag if we have rules for other days (suggesting it's not just incomplete data)
  if (rules.some(r => r.match(/^[A-Z][a-z]/))) {
    return `May be closed on ${FULL_DAY_NAMES[targetDay] || targetDay}s`;
  }

  return null;
}

/** Parsed view of a day's opening: either a list of ranges (minutes from
 *  midnight), or closed. Closed days have an empty `ranges` array. */
interface DayRanges {
  closed: boolean;
  ranges: { startMin: number; endMin: number }[];
}

function timeToMinutes(t: string): number | null {
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function minutesToLabel(min: number): string {
  // Wrap end-of-day to a friendlier "midnight" rather than 12 AM ambiguity.
  if (min >= 1440) return 'midnight';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return formatTime(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
}

/** Extract day-of-week ranges from an OSM-style opening_hours string. Returns
 *  an array indexed by DAY_ORDER (Mo=0..Su=6). Missing days are treated as
 *  "no rule" (returned as undefined) — distinct from explicit `off`. */
function parseWeek(raw: string): (DayRanges | undefined)[] {
  const week: (DayRanges | undefined)[] = new Array(7);
  if (!raw) return week;
  if (raw.trim() === '24/7') {
    for (let i = 0; i < 7; i++) week[i] = { closed: false, ranges: [{ startMin: 0, endMin: 1440 }] };
    return week;
  }
  const rules = raw.split(';').map(r => r.trim()).filter(Boolean);
  for (const rule of rules) {
    const match = rule.match(/^([A-Z][a-z][\w,\s-]*?)\s+([\d:,\s-]+|off)$/i);
    if (!match) continue;
    const daySpec = match[1].trim();
    const timeSpec = match[2].trim();
    for (let i = 0; i < 7; i++) {
      const dayCode = DAY_ORDER[i];
      if (!dayMatchesSpec(dayCode, daySpec)) continue;
      if (timeSpec === 'off') { week[i] = { closed: true, ranges: [] }; continue; }
      const ranges: { startMin: number; endMin: number }[] = [];
      for (const part of timeSpec.split(',')) {
        const [start, end] = part.trim().split('-').map(s => s.trim());
        const s = timeToMinutes(start);
        const e = timeToMinutes(end);
        if (s == null || e == null) continue;
        // Closing past midnight (e.g. 20:00-02:00) — wrap end into >24h so
        // comparisons against "now in minutes" work without special-casing.
        ranges.push({ startMin: s, endMin: e <= s ? e + 1440 : e });
      }
      if (ranges.length > 0) week[i] = { closed: false, ranges };
    }
  }
  return week;
}

export interface OpeningStatus {
  /** True when the place is open right now. */
  isOpen: boolean;
  /** One-line glanceable status — "Open until 6 PM", "Closed, opens 2 PM",
   *  "Closed, opens 9 AM Thu", "Closed today", "Open 24 hours". Empty when we
   *  can't determine anything useful (the detail page hides the block). */
  label: string;
}

/**
 * Glanceable "are we open?" status for the item detail page. Returns the
 * status string + an isOpen flag for the coloured dot. Returns null when the
 * opening_hours string is missing or unparseable — callers should hide the
 * block in that case. Day-of-week and current time read from the user's
 * device local time, matching the venue's local time for typical use.
 */
export function getOpeningHoursStatus(raw: string | undefined, now: Date = new Date()): OpeningStatus | null {
  if (!raw) return null;
  if (raw.trim() === '24/7') return { isOpen: true, label: 'Open 24 hours' };

  const week = parseWeek(raw);
  if (week.every(d => d === undefined)) return null;

  const todayIdx = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const today = week[todayIdx];

  // Open right now? Check today's normal ranges plus a yesterday-wrap range
  // that crossed midnight into today.
  const yesterdayIdx = (todayIdx + 6) % 7;
  const yesterday = week[yesterdayIdx];
  const yesterdayWrap = yesterday?.ranges.find(r => r.endMin > 1440);

  if (today && !today.closed) {
    const live = today.ranges.find(r => nowMin >= r.startMin && nowMin < r.endMin);
    if (live) return { isOpen: true, label: `Open until ${minutesToLabel(live.endMin)}` };
  }
  if (yesterdayWrap && nowMin < yesterdayWrap.endMin - 1440) {
    return { isOpen: true, label: `Open until ${minutesToLabel(yesterdayWrap.endMin - 1440)}` };
  }

  // Closed. Find next opening — first a later range today, then walk forward.
  if (today && !today.closed) {
    const next = today.ranges.find(r => r.startMin > nowMin);
    if (next) return { isOpen: false, label: `Closed, opens ${minutesToLabel(next.startMin)}` };
  }
  for (let offset = 1; offset <= 7; offset++) {
    const idx = (todayIdx + offset) % 7;
    const day = week[idx];
    if (!day || day.closed || day.ranges.length === 0) continue;
    const first = day.ranges[0];
    if (offset === 1) return { isOpen: false, label: `Closed, opens ${minutesToLabel(first.startMin)} tomorrow` };
    const dayName = DAY_NAMES[DAY_ORDER[idx]];
    return { isOpen: false, label: `Closed, opens ${minutesToLabel(first.startMin)} ${dayName}` };
  }

  // No future opening found in the next week — treat as permanently closed.
  return { isOpen: false, label: 'Closed today' };
}

/**
 * Check if a day matches an OSM day specification like "Mo-Fr" or "Sa" or "Mo,We,Fr"
 */
function dayMatchesSpec(day: string, spec: string): boolean {
  // Handle range "Mo-Fr"
  const rangeMatch = spec.match(/^([A-Z][a-z])-([A-Z][a-z])$/);
  if (rangeMatch) {
    const startIdx = DAY_ORDER.indexOf(rangeMatch[1]);
    const endIdx = DAY_ORDER.indexOf(rangeMatch[2]);
    const dayIdx = DAY_ORDER.indexOf(day);
    if (startIdx === -1 || endIdx === -1 || dayIdx === -1) return false;
    if (startIdx <= endIdx) return dayIdx >= startIdx && dayIdx <= endIdx;
    // Wrapping range (e.g., Fr-Mo)
    return dayIdx >= startIdx || dayIdx <= endIdx;
  }

  // Handle comma-separated "Mo,We,Fr"
  if (spec.includes(',')) {
    return spec.split(',').map(s => s.trim()).includes(day);
  }

  // Handle "PH" (public holiday) - skip
  if (spec === 'PH') return false;

  // Single day match
  return spec === day;
}
