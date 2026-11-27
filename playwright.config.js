import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
    testDir: './tests/browser',
    fullyParallel: false,
    workers: 1,
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
    ],
    webServer: {
        command: 'vendor/bin/testbench serve --port=8765 --no-reload',
        url: 'http://127.0.0.1:8765/admin/login',
        reuseExistingServer: true,
    },
})
