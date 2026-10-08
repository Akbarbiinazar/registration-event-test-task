import { defineConfig } from '@playwright/test';
import { loadConfig } from './apps/api/src/config.js';

// Dedicated ports prevent Playwright from reusing a dev server connected to the dev database.
const { TEST_DATABASE_URL } = loadConfig();
const webBaseUrl = 'http://localhost:5174';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: webBaseUrl,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: 'npm run serve -w apps/api',
      url: 'http://127.0.0.1:3100/api/health',
      env: { DATABASE_URL: TEST_DATABASE_URL, PORT: '3100', WEB_BASE_URL: webBaseUrl },
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev -w apps/web',
      url: webBaseUrl,
      env: { WEB_PORT: '5174', API_ORIGIN: 'http://127.0.0.1:3100' },
      reuseExistingServer: false,
    },
  ],
});
