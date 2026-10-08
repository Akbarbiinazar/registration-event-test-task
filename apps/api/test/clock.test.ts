import { describe, expect, it } from 'vitest';
import { FakeClock } from '../src/clock.js';

describe('FakeClock', () => {
  it('returns the instant it was set to and moves only on advance', () => {
    const clock = new FakeClock(new Date('2026-05-01T10:00:00Z'));
    expect(clock.now().toISOString()).toBe('2026-05-01T10:00:00.000Z');

    clock.advance(90_000);
    expect(clock.now().toISOString()).toBe('2026-05-01T10:01:30.000Z');

    clock.set(new Date('2027-01-01T00:00:00Z'));
    expect(clock.now().toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('does not let callers mutate its internal state', () => {
    const clock = new FakeClock(new Date('2026-05-01T10:00:00Z'));
    clock.now().setFullYear(1999);
    expect(clock.now().getUTCFullYear()).toBe(2026);
  });
});
