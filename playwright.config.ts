import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html'],
    ['./e2e/helpers/foundry-reporter.ts'],
  ],
  use: {
    baseURL: process.env.FOUNDRY_URL || 'http://localhost:30000',
    viewport: { width: 1920, height: 1080 },
    storageState: 'playwright/.auth/user.json',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },
  ],
  webServer: {
    command: 'echo "Checking local Foundry server on http://localhost:30000..."',
    url: 'http://localhost:30000',
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});
