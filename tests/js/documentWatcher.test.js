import { describe, expect, it, vi } from 'vitest'
import { watchDocument } from '../../resources/js/runtime/DocumentWatcher.js'
import { readConfig } from '../../resources/js/runtime/config.js'

describe('watchDocument', () => {
    it('reports body replacement but not body content changes', async () => {
        const callback = vi.fn()
        const stop = watchDocument(callback)

        document.body.appendChild(document.createElement('div'))
        await Promise.resolve()

        expect(callback).not.toHaveBeenCalled()

        document.body.replaceWith(document.createElement('body'))
        await Promise.resolve()

        expect(callback).toHaveBeenCalledTimes(1)

        stop()
        document.body.replaceWith(document.createElement('body'))
        await Promise.resolve()

        expect(callback).toHaveBeenCalledTimes(1)
    })
})

describe('readConfig', () => {
    it('parses the panel config block and tolerates bad JSON', () => {
        document.body.innerHTML = '<script type="application/json" data-critters-config>{"panel":"admin"}</script>'

        expect(readConfig()).toEqual({ panel: 'admin' })

        document.body.innerHTML = '<script type="application/json" data-critters-config>{nope</script>'

        expect(readConfig()).toBeNull()

        document.body.innerHTML = ''

        expect(readConfig()).toBeNull()
    })
})
