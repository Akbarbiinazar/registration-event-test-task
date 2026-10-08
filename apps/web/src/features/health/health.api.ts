import { apiGet } from '@/shared/api/client';
import type { HealthResponse } from './health.types';

export function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiGet<HealthResponse>('/health', signal);
}
