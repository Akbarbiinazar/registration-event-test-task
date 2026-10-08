interface EventDateTimeProps {
  startsAt: string;
  startsAtLabel: string;
  timezone: string;
  className?: string;
}

export function EventDateTime({
  startsAt,
  startsAtLabel,
  timezone,
  className = '',
}: EventDateTimeProps) {
  const date = new Date(startsAt);
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const time = new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  const zone = startsAtLabel.match(/\(([^)]+)\)$/)?.[1] ?? timezone;
  return (
    <span className={`event-datetime ${className}`} aria-label={startsAtLabel}>
      <span className="event-date" aria-hidden="true">
        <strong>{get('day')}</strong>
        <span>{get('month')}</span>
        <small>{get('year')}</small>
      </span>
      <span className="event-row-time" aria-hidden="true">
        <strong>{time}</strong>
        <span className="event-zone">{zone}</span>
      </span>
    </span>
  );
}
