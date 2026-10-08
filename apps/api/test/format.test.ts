import { describe, expect, it } from 'vitest';
import { formatInZone } from '../src/format.js';

describe('formatInZone', () => {
  const at = new Date('2026-12-01T15:00:00.000Z');

  it('shows Moscow wall time with zone label and offset', () => {
    expect(formatInZone(at, 'Europe/Moscow')).toBe('1 декабря 2026 г. в 18:00 (Москва, UTC+3)');
  });

  it('shows a different wall time for another zone', () => {
    expect(formatInZone(at, 'America/New_York')).toBe(
      '1 декабря 2026 г. в 10:00 (New York, UTC-5)',
    );
  });

  it.each([
    ['Asia/Almaty', 'Алматы', '20:00', 'UTC+5'],
    ['Asia/Tashkent', 'Ташкент', '20:00', 'UTC+5'],
    ['Asia/Bishkek', 'Бишкек', '21:00', 'UTC+6'],
    ['Europe/Minsk', 'Минск', '18:00', 'UTC+3'],
    ['Asia/Yekaterinburg', 'Екатеринбург', '20:00', 'UTC+5'],
    ['Asia/Tbilisi', 'Тбилиси', '19:00', 'UTC+4'],
  ])('names %s in Russian', (zone, city, time, offset) => {
    expect(formatInZone(at, zone)).toBe(`1 декабря 2026 г. в ${time} (${city}, ${offset})`);
  });

  it('handles half-hour and zero offsets', () => {
    expect(formatInZone(at, 'Asia/Kolkata')).toBe('1 декабря 2026 г. в 20:30 (Kolkata, UTC+5:30)');
    expect(formatInZone(at, 'UTC')).toBe('1 декабря 2026 г. в 15:00 (UTC, UTC+0)');
  });
});
