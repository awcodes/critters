import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { config, makeRuntime, setReducedMotion, setViewport, testSkin } from './helpers.js'

const serverConfig = {
    ...config,
    choices: ['cat', 'dog'],
    sprites: { cat: '/css/cat.css', dog: '/css/dog.css' },
}

function setup() {
    const made = makeRuntime()

    made.registry.registerCreature('dog', { title: 'Dog', width: 20, height: 20, speed: 100, skin: { ...testSkin, src: undefined, className: 'critters-skin-dog' } })
    made.registry.creature('cat').title = 'Cat'

    return made
}

describe('choosing a creature', () => {
    let runtime

    beforeEach(() => {
        setViewport(400, 300)
        setReducedMotion(false)
        localStorage.clear()
        document.head.innerHTML = ''
    })

    afterEach(() => {
        runtime?.destroy()
        document.body.innerHTML = ''
    })

    it('uses the server default until a choice is stored', () => {
        ;({ runtime } = setup())
        runtime.sync(serverConfig)

        expect(runtime.config.creature).toBe('cat')
    })

    it('switches, remembers the choice per panel and loads the sprite once', () => {
        vi.useFakeTimers()
        ;({ runtime } = setup())
        runtime.sync(serverConfig)
        runtime.setCreature('dog')
        vi.advanceTimersByTime(100)

        expect(runtime.config.creature).toBe('dog')
        expect(document.querySelectorAll('[data-critters-creature="dog"]')).toHaveLength(1)
        expect(document.querySelectorAll('[data-critters-creature="cat"]')).toHaveLength(0)
        expect(localStorage.getItem('critters:admin:creature')).toBe('dog')
        expect(document.head.querySelectorAll('link[data-critters-sprite="dog"]')).toHaveLength(1)
        expect(document.querySelector('.critters-status').textContent).toBe('Now showing the dog.')

        // A fresh page load (same browser) mounts the remembered creature.
        runtime.destroy()
        ;({ runtime } = setup())
        runtime.sync(serverConfig)

        expect(runtime.config.creature).toBe('dog')
        expect(document.head.querySelectorAll('link[data-critters-sprite="dog"]')).toHaveLength(1)
        vi.useRealTimers()
    })

    it('ignores choices the panel no longer offers', () => {
        ;({ runtime } = setup())
        localStorage.setItem('critters:admin:creature', 'sparky')
        runtime.sync(serverConfig)

        expect(runtime.config.creature).toBe('cat')

        runtime.setCreature('sparky')

        expect(runtime.config.creature).toBe('cat')
    })

    it('un-hides when a critter is picked', () => {
        ;({ runtime } = setup())
        runtime.sync(serverConfig)
        runtime.toggleHidden()
        runtime.setCreature('dog')

        expect(runtime.hidden).toBe(false)
        expect(localStorage.getItem('critters:admin:hidden')).toBeNull()
    })

    it('keeps the same mount across SPA navigation when nothing changed', () => {
        ;({ runtime } = setup())
        runtime.sync(serverConfig)
        runtime.setCreature('dog')

        const mounts = runtime.stats.mounts

        runtime.sync(serverConfig)

        expect(runtime.stats.mounts).toBe(mounts)
    })

    it('uses the panel\'s translated text and names', () => {
        vi.useFakeTimers()
        ;({ runtime } = setup())
        runtime.sync({
            ...serverConfig,
            strings: { pickerTitle: 'Wähle dein Tierchen', pickerClose: 'Schließen', nowShowing: 'Jetzt da: :creature.' },
            names: { cat: { title: 'Katze', label: 'die Katze' }, dog: { title: 'Hund', label: 'der Hund' } },
        })
        runtime.choose()

        const dialog = document.querySelector('dialog.critters-picker')

        expect(dialog.querySelector('.critters-picker-title').textContent).toBe('Wähle dein Tierchen')
        expect(dialog.querySelector('.critters-picker-close').textContent).toBe('Schließen')
        expect([...dialog.querySelectorAll('[data-critters-choice]')].map((o) => o.textContent)).toEqual(['Katze', 'Hund'])

        document.querySelector('[data-critters-choice="dog"]').click()
        vi.advanceTimersByTime(100)

        expect(document.querySelector('.critters-status').textContent).toBe('Jetzt da: der Hund.')
        vi.useRealTimers()
    })

    describe('picker', () => {
        it('lists the choices with previews and marks the current one', () => {
            ;({ runtime } = setup())
            runtime.sync(serverConfig)
            runtime.choose()

            const dialog = document.querySelector('dialog.critters-picker')
            const options = [...dialog.querySelectorAll('[data-critters-choice]')]

            expect(dialog.getAttribute('aria-labelledby')).toBe('critters-picker-title')
            expect(options.map((o) => o.textContent)).toEqual(['Cat', 'Dog'])
            expect(options.map((o) => o.getAttribute('aria-pressed'))).toEqual(['true', 'false'])
            expect(dialog.querySelector('[data-critters-choice="dog"] .critters-picker-sprite').classList.contains('critters-skin-dog')).toBe(true)
            expect(document.activeElement).toBe(options[0])
            // Opening the picker preloads every offered sprite for the previews.
            expect(document.head.querySelectorAll('link[data-critters-sprite]')).toHaveLength(2)
        })

        it('picks a creature and closes', () => {
            ;({ runtime } = setup())
            runtime.sync(serverConfig)
            runtime.choose()
            document.querySelector('[data-critters-choice="dog"]').click()

            expect(runtime.config.creature).toBe('dog')
            expect(document.querySelector('dialog.critters-picker')).toBeNull()
            expect(runtime.picker).toBeNull()
        })

        it('closes without changing anything', () => {
            ;({ runtime } = setup())
            runtime.sync(serverConfig)
            runtime.choose()
            document.querySelector('.critters-picker-close').click()

            expect(runtime.config.creature).toBe('cat')
            expect(document.querySelector('dialog.critters-picker')).toBeNull()
        })

        it('does not open without at least two choices', () => {
            ;({ runtime } = setup())
            runtime.sync({ ...serverConfig, choices: [] })
            runtime.choose()

            expect(document.querySelector('dialog.critters-picker')).toBeNull()
        })
    })
})
