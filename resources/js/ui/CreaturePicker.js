const PREVIEW_SIZE = 72
const IDLE_FRAME = 4

/**
 * The "Change critter" dialog. A native modal <dialog> provides the focus trap, Escape to
 * close and an inert page behind it; options are plain buttons with `aria-pressed`.
 */
export class CreaturePicker {
    constructor({ doc = document, choices, current, describe, onPick, onClose = () => {}, strings = {} }) {
        this.doc = doc
        this.choices = choices
        this.current = current
        this.describe = describe
        this.onPick = onPick
        this.onClose = onClose
        this.strings = { title: 'Choose your critter', close: 'Close', ...strings }
        this.dialog = null
    }

    get isOpen() {
        return Boolean(this.dialog?.open)
    }

    open() {
        if (this.isOpen) return this

        const doc = this.doc
        const dialog = doc.createElement('dialog')
        const title = doc.createElement('h2')
        const options = doc.createElement('div')
        const close = doc.createElement('button')

        dialog.className = 'critters-picker'
        dialog.setAttribute('aria-labelledby', 'critters-picker-title')
        title.id = 'critters-picker-title'
        title.className = 'critters-picker-title'
        title.textContent = this.strings.title
        options.className = 'critters-picker-options'

        for (const name of this.choices) {
            options.appendChild(this.option(name))
        }

        close.type = 'button'
        close.className = 'critters-picker-close'
        close.textContent = this.strings.close
        close.addEventListener('click', () => this.close())

        dialog.append(title, options, close)
        // Clicking the backdrop (the dialog itself, outside its content) closes it.
        dialog.addEventListener('click', (event) => event.target === dialog && this.close())
        dialog.addEventListener('close', () => {
            dialog.remove()
            this.dialog = null
            this.onClose()
        })

        const initial = dialog.querySelector('[aria-pressed="true"]') ?? dialog.querySelector('button')

        initial?.setAttribute('autofocus', '')
        doc.body.appendChild(dialog)
        this.dialog = dialog
        // Fallback for environments without modal dialogs: a plain open dialog.
        typeof dialog.showModal === 'function' ? dialog.showModal() : dialog.setAttribute('open', '')
        initial?.focus()

        // Opening from a menu: the menu closes after this handler and may move focus (WebKit
        // sends it to <body>). Put it back once, on the next frame, if it left the dialog.
        doc.defaultView?.requestAnimationFrame?.(() => {
            if (this.dialog === dialog && !dialog.contains(doc.activeElement)) initial?.focus()
        })

        return this
    }

    option(name) {
        const doc = this.doc
        const { title, definition } = this.describe(name)
        const button = doc.createElement('button')
        const preview = doc.createElement('span')
        const sprite = doc.createElement('span')
        const label = doc.createElement('span')

        button.type = 'button'
        button.className = 'critters-picker-option'
        button.dataset.crittersChoice = name
        button.setAttribute('aria-pressed', name === this.current ? 'true' : 'false')
        preview.className = 'critters-picker-preview'
        preview.setAttribute('aria-hidden', 'true')
        label.className = 'critters-picker-name'
        label.textContent = title

        if (definition) {
            const { skin } = definition
            const scale = Math.min(1, PREVIEW_SIZE / Math.max(definition.width, definition.height))
            const width = Math.round(definition.width * scale)
            const height = Math.round(definition.height * scale)

            sprite.className = `critters-picker-sprite ${skin.className ?? ''}`.trim()
            Object.assign(sprite.style, {
                width: `${width}px`,
                height: `${height}px`,
                backgroundSize: `${skin.frameCount * width}px ${height}px`,
                backgroundPosition: `${-Math.min(IDLE_FRAME, skin.frameCount - 1) * width}px 0`,
            })

            if (!skin.className && skin.src) sprite.style.backgroundImage = `url("${skin.src}")`

            preview.appendChild(sprite)
        }

        button.append(preview, label)
        button.addEventListener('click', () => {
            this.onPick(name)
            this.close()
        })

        return button
    }

    close() {
        if (!this.dialog) return

        if (typeof this.dialog.close === 'function' && this.dialog.open) {
            this.dialog.close()
        } else {
            this.dialog.removeAttribute('open')
            this.dialog.dispatchEvent(new Event('close'))
        }
    }
}
