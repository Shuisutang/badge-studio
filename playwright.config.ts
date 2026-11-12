import { defineConfig, devices } from '@playwright/test';

/**
 * E2E against the production build (vite preview, base /badge-studio/).
 * Set LIVE_URL to run the same suite against the deployed site instead.
 * Set CHROME_PATH to use a system Chrome (e.g. /usr/bin/google-chrome).
 */
const live = process.env.LIVE_URL;
const executablePath = process.env.CHROME_PATH;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: live ?? 'http://localhost:4173/badge-studio/',
    acceptDownloads: true,
    // Pixel probes can otherwise migrate Canvas 2D from GPU to CPU mid-test,
    // changing blur/shadow rasterization even when every setting is restored.
    // Keep the 2D backend fixed; WebGL remains available to the 3D checks.
    launchOptions: { ...(executablePath ? { executablePath } : {}), args: ['--disable-accelerated-2d-canvas'] },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: live
    ? undefined
    : { command: 'npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173/badge-studio/', reuseExistingServer: true },
});
