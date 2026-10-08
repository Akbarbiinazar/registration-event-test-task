/** Response of GET /api/health (duplicated from the API on purpose, see project_spec §1). */
export interface HealthResponse {
  ok: true;
  db: true;
}
