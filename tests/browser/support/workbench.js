// Shared setup for the manual measurement scripts: reuse a running Workbench on :8765 or
// start one (and stop it afterwards), and make sure a signed-in session exists.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export const BASE_URL = 'http://127.0.0.1:8765'
export const STORAGE_STATE = 'tests/browser/.auth/user.json'

const isUp = () =>
    fetch(`${BASE_URL}/admin/login`)
        .then((response) => response.ok)
        .catch(() => false)

export async function ensureWorkbench() {
    if (await isUp()) return () => {}

    console.log(`Starting the Workbench on ${BASE_URL} …`)

    const server = spawn('vendor/bin/testbench', ['serve', '--port=8765', '--no-reload'], { stdio: 'ignore', detached: true })
    const stop = () => {
        try {
            process.kill(-server.pid)
        } catch {
            // Already gone.
        }
    }

    process.on('exit', stop)

    for (let i = 0; i < 60; i++) {
        if (await isUp()) return stop

        await new Promise((resolve) => setTimeout(resolve, 250))
    }

    stop()
    throw new Error('The Workbench did not start on :8765. Run `composer build` first, then try again.')
}

export async function ensureSession(browser) {
    if (existsSync(STORAGE_STATE)) return

    console.log('Signing in to the Workbench …')
    mkdirSync(dirname(STORAGE_STATE), { recursive: true })

    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto(`${BASE_URL}/admin/login`)
    await page.waitForFunction(() => window.Livewire?.all().length > 0)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL(/\/admin$/)
    await context.storageState({ path: STORAGE_STATE })
    await context.close()
}
