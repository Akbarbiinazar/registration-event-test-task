import { apiDelete, apiGet, apiPatch, apiPost } from '@/shared/api/client';
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
export const rescheduleEvent = (id: string, key: string, startsAt: string) =>
  apiPatch<{ unchanged?: boolean }>(`/organizer/events/${id}`, { startsAt }, key);
export const checkInTicket = (id: string, key: string, code: string) =>
  apiPost<{ checkedInAt: string }>(`/organizer/events/${id}/checkins`, { code }, key);
export const registerForEvent = (id: string, email: string) =>
  apiPost<RegistrationResult>(`/events/${id}/registrations`, { email });
export const fetchTicket = (token: string, signal?: AbortSignal) =>
  apiGet<Ticket>(`/tickets/${token}`, signal);
export const cancelTicket = (token: string) =>
  apiDelete<{ status: 'cancelled' }>(`/tickets/${token}`);
