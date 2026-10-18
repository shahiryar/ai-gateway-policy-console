import { defineConfig } from '@playwright/test';

const PORT = 8090;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    // The built app against simulated Google APIs; see GOOGLE_API_MODE in the README.
    command: 'npm run build && npm start',
    url: `http://localhost:${PORT}/healthz`,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(PORT), GOOGLE_API_MODE: 'mock', MODEL_ARMOR_LOCATIONS: 'us-central1,europe-west4' },
  },
});
