/**
 * Lives for the whole page, unlike a runtime mount. Client-side navigation can replace
 * <body> wholesale; this notices from the DOM itself, so it needs no knowledge of which
 * framework did the replacing.
 */
export function watchDocument(onBodyReplaced, { win = window, doc = document } = {}) {
    const observer = new win.MutationObserver((records) => {
        const bodyReplaced = records.some((record) =>
            Array.from(record.addedNodes).some((node) => node.nodeName === 'BODY'),
        )

        if (bodyReplaced) {
            onBodyReplaced()
        }
    })

    observer.observe(doc.documentElement, { childList: true })

    return () => observer.disconnect()
}
