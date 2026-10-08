import { apiGet, apiPost } from '@/shared/api/client';
import type {
  CreatedEvent,
  CreateEventInput,
  OrganizerEvent,
  PublicEvent,
  RegistrationResult,
  Ticket,
} from './events.types';

export const fetchEvents = (signal?: AbortSignal) => apiGet<PublicEvent[]>('/events', signal);
export const fetchEvent = (id: string, signal?: AbortSignal) =>
  apiGet<PublicEvent>(`/events/${id}`, signal);
export const createEvent = (input: CreateEventInput) => apiPost<CreatedEvent>('/events', input);
export const fetchOrganizerEvent = (id: string, key: string, signal?: AbortSignal) =>
  apiGet<OrganizerEvent>(`/organizer/events/${id}`, signal, key);
export const registerForEvent = (id: string, email: string) =>
  apiPost<RegistrationResult>(`/events/${id}/registrations`, { email });
export const fetchTicket = (token: string, signal?: AbortSignal) =>
  apiGet<Ticket>(`/tickets/${token}`, signal);
