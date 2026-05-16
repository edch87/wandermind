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
