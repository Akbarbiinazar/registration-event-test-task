import pg from 'pg';

type Subscriber = () => void;

/** A dedicated LISTEN connection; notifications from every database connection reach subscribers. */
export class EventNotifier {
  private client: pg.Client | undefined;
  private connecting: Promise<void> | undefined;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private attempts = 0;
  private readonly subscribers = new Map<string, Set<Subscriber>>();

  constructor(private readonly connectionString: string) {}

  async start(): Promise<void> {
    this.stopped = false;
    if (this.client) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.connect();
    try {
      await this.connecting;
    } finally {
      this.connecting = undefined;
    }
  }

  subscribe(eventId: string, subscriber: Subscriber): () => void {
    const group = this.subscribers.get(eventId) ?? new Set<Subscriber>();
    group.add(subscriber);
    this.subscribers.set(eventId, group);
    return () => {
      group.delete(subscriber);
      if (group.size === 0) this.subscribers.delete(eventId);
    };
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    this.retry = undefined;
    if (this.connecting) await this.connecting.catch(() => undefined);
    const client = this.client;
    this.client = undefined;
    if (client) await client.end().catch(() => undefined);
    this.subscribers.clear();
  }

  private async connect(): Promise<void> {
    const client = new pg.Client({ connectionString: this.connectionString });
    try {
      await client.connect();
      await client.query('LISTEN event_stats');
      if (this.stopped) {
        await client.end();
        return;
      }
      this.client = client;
      this.attempts = 0;
      client.on('notification', (notification) => {
        if (notification.channel !== 'event_stats' || !notification.payload) return;
        for (const subscriber of this.subscribers.get(notification.payload) ?? []) subscriber();
      });
      client.on('error', () => this.disconnected(client));
      client.on('end', () => this.disconnected(client));
      for (const group of this.subscribers.values()) {
        for (const subscriber of group) subscriber();
      }
    } catch (error) {
      await client.end().catch(() => undefined);
      this.scheduleRetry();
      throw error;
    }
  }

  private disconnected(client: pg.Client): void {
    if (this.client !== client) return;
    this.client = undefined;
    void client.end().catch(() => undefined);
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    if (this.stopped || this.retry) return;
    const delay = Math.min(1000 * 2 ** this.attempts++, 30000);
    this.retry = setTimeout(() => {
      this.retry = undefined;
      void this.start().catch(() => undefined);
    }, delay);
  }
}
