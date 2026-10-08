import { apiGet, apiPost } from '@/shared/api/client';
import type { CreatedEvent, CreateEventInput, OrganizerEvent, PublicEvent } from './events.types';

export const fetchEvents = (signal?: AbortSignal) => apiGet<PublicEvent[]>('/events', signal);
export const fetchEvent = (id: string, signal?: AbortSignal) =>
  apiGet<PublicEvent>(`/events/${id}`, signal);
export const createEvent = (input: CreateEventInput) => apiPost<CreatedEvent>('/events', input);
export const fetchOrganizerEvent = (id: string, key: string, signal?: AbortSignal) =>
  apiGet<OrganizerEvent>(`/organizer/events/${id}`, signal, key);
