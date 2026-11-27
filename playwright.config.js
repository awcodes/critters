import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
    testDir: './tests/browser',
    fullyParallel: false,
    workers: 1,
    // One retry on CI absorbs PHP dev-server hiccups late in a three-browser run; retried
    // tests are still reported as flaky. Locally, failures stay failures.
    retries: process.env.CI ? 1 : 0,
    reporter: 'list',
    use: {
        baseURL: 'http://127.0.0.1:8765',
        trace: 'retain-on-failure',
    },
    projects: [
        { name: 'setup', testMatch: /auth\.setup\.js/ },
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'], storageState: 'tests/browser/.auth/user.json' },
            dependencies: ['setup'],
        },
        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'], storageState: 'tests/browser/.auth/user.json' },
            dependencies: ['setup'],
        },
        {
            name: 'webkit',
            use: { ...devices['Desktop Safari'], storageState: 'tests/browser/.auth/user.json' },
            dependencies: ['setup'],
        },
    ],
    webServer: {
        command: 'vendor/bin/testbench serve --port=8765 --no-reload',
        url: 'http://127.0.0.1:8765/admin/login',
        reuseExistingServer: true,
    },
})
