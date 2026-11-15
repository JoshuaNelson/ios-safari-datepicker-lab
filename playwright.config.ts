import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: { command: 'node serve.mjs', url: 'http://localhost:8080/', reuseExistingServer: true },
  use: { baseURL: 'http://localhost:8080', trace: 'retain-on-failure' },
  projects: [
    { name: 'iphone-webkit', use: { ...devices['iPhone 15'] } },
    { name: 'narrow-iphone-webkit', use: { ...devices['iPhone SE'] } },
    { name: 'android-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'desktop-safari', use: { ...devices['Desktop Safari'] } },
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
  ],
});
