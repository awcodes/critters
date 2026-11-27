export const CONFIG_SELECTOR = 'script[data-critters-config]'

export function readConfig(root = document) {
    const el = root.querySelector(CONFIG_SELECTOR)

    if (!el) {
        return null
    }

    try {
        return JSON.parse(el.textContent)
    } catch {
        return null
    }
}

export function configKey(config) {
    return config ? JSON.stringify(config) : null
}
