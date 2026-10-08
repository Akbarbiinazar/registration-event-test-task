import { defineConfig } from '@playwright/test';
import { loadConfig } from './apps/api/src/config.js';

// E2E runs against the test database so it never touches dev data.
const { TEST_DATABASE_URL } = loadConfig();

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:5173' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: 'npm run serve -w apps/api',
      url: 'http://127.0.0.1:3000/api/health',
      env: { DATABASE_URL: TEST_DATABASE_URL },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev -w apps/web',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
