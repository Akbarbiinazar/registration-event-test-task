/** Mirrors of the API's event responses (duplicated on purpose, see project_spec §1). */
export interface PublicEvent {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  startsAtLabel: string;
  timezone: string;
  capacity: number;
  seatsLeft: number;
  hasStarted: boolean;
}

export interface CreateEventInput {
  title: string;
  description: string;
  startsAt: string;
  timezone: string;
  capacity: number;
}

export interface CreatedEvent {
  event: PublicEvent;
  organizerKey: string;
}

export interface OrganizerEvent {
  event: PublicEvent;
  stats: { registered: number; waitlisted: number; checkedIn: number; capacity: number };
}

export interface RegistrationResult {
  status: 'confirmed' | 'waitlisted';
  alreadyRegistered: boolean;
}

export interface Ticket {
  event: { id: string; title: string; startsAtLabel: string };
  status: 'confirmed' | 'waitlisted' | 'cancelled';
  code?: string;
  position?: number;
}
