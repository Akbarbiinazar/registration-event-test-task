import { describe, expect, it } from 'vitest';
import { formatInZone } from '../src/format.js';

describe('formatInZone', () => {
  const at = new Date('2026-12-01T15:00:00.000Z');

  it('shows Moscow wall time with zone label and offset', () => {
    expect(formatInZone(at, 'Europe/Moscow')).toBe('1 декабря 2026 г. в 18:00 (Moscow, UTC+3)');
  });

  it('shows a different wall time for another zone', () => {
    expect(formatInZone(at, 'America/New_York')).toBe(
      '1 декабря 2026 г. в 10:00 (New York, UTC-5)',
    );
  });
});
