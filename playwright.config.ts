import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', timeout: 30000, fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:3101', browserName: 'chromium', headless: true, trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev', url: 'http://127.0.0.1:3101', reuseExistingServer: false, timeout: 60000,
    env: { PORT: '3101', DISABLE_MODEL_API: '1' },
  },
});
