import { createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';
import { loadConfig } from './config.js';
import { createPool, type Db } from './db.js';

const events = [
  {
    title: 'Вечер настольных игр',
    description: 'Игры для новичков и постоянных гостей.',
    days: 7,
    hourUtc: 12,
    timezone: 'Asia/Bishkek',
    capacity: 24,
  },
  {
    title: 'Практикум по городской фотографии',
    description: 'Прогулка и разбор снимков после неё.',
    days: 12,
    hourUtc: 9,
    timezone: 'Europe/Moscow',
    capacity: 18,
  },
  {
    title: 'Книжный клуб: рассказы о городе',
    description: 'Обсудим короткие тексты за чаем.',
    days: 18,
    hourUtc: 13,
    timezone: 'Asia/Almaty',
    capacity: 16,
  },
  {
    title: 'Открытая лекция об астрономии',
    description: 'Небо, планеты и вопросы слушателей.',
    days: 25,
    hourUtc: 13,
    timezone: 'Asia/Bishkek',
    capacity: 60,
  },
  {
    title: 'Мастерская керамики',
    description: 'Сделаем небольшую чашу вручную.',
    days: 33,
    hourUtc: 8,
    timezone: 'Europe/Moscow',
    capacity: 12,
  },
  {
    title: 'Утренняя пробежка в парке',
    description: 'Спокойный темп и кофе после финиша.',
    days: 40,
    hourUtc: 1,
    timezone: 'Asia/Bishkek',
    capacity: 30,
  },
  {
    title: 'Встреча разработчиков',
    description: 'Короткие доклады и общение.',
    days: 55,
    hourUtc: 12,
    timezone: 'Asia/Almaty',
    capacity: 45,
  },
] as const;

export async function seedEvents(db: Db | pg.PoolClient): Promise<number> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let inserted = 0;
  for (const [index, event] of events.entries()) {
    const startsAt = new Date(today);
    startsAt.setUTCDate(startsAt.getUTCDate() + event.days);
    startsAt.setUTCHours(event.hourUtc);
    const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    const tokenHash = createHash('sha256').update(randomBytes(32)).digest('hex');
    const result = await db.query(
      `INSERT INTO events (id, title, description, starts_at, timezone, capacity, organizer_token_hash, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        event.title,
        event.description,
        startsAt,
        event.timezone,
        event.capacity,
        tokenHash,
        new Date(),
      ],
    );
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = createPool(loadConfig().DATABASE_URL);
  try {
    console.log(`Seeded ${await seedEvents(db)} events`);
  } finally {
    await db.end();
  }
}
