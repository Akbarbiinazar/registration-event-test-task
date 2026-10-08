import { ZONE_NAMES_RU } from './zone-names.js';

/** True when `timezone` is an IANA zone name this runtime knows. */
export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('ru', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** "1 декабря 2026 г. в 18:00 (Москва, UTC+3)": wall time in the event's zone, with the zone named. */
export function formatInZone(at: Date, timezone: string): string {
  const when = new Intl.DateTimeFormat('ru', {
    timeZone: timezone,
    dateStyle: 'long',
    timeStyle: 'short',
    hourCycle: 'h23',
  }).format(at);
  const offset = new Intl.DateTimeFormat('en', { timeZone: timezone, timeZoneName: 'shortOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value;
  const utc = (offset ?? 'GMT').replace('GMT', 'UTC');
  const city =
    ZONE_NAMES_RU[timezone] ?? (timezone.split('/').pop() ?? timezone).replace(/_/g, ' ');
  return `${when} (${city}, ${utc === 'UTC' ? 'UTC+0' : utc})`;
}
