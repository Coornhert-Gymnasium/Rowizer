/**
 * Starten zonder Zermelo (plan stap R.16).
 *
 * Na elke geslaagde ronde bewaart het bord wat het toont (het rooster en de afwezigen) in
 * localStorage. Start het scherm later die dag opnieuw zonder verbinding met Zermelo (stroomstoring,
 * nachtelijke herlading tijdens een storing), dan staat die stand er meteen weer, met de rode balk.
 *
 * - Nooit het token: alleen de getoonde HTML, de dag, het tijdstip en portal+vestiging.
 * - Alleen dezelfde dag en dezelfde portal en vestiging.
 * - Bij het terugzetten alleen bekende elementen en attributen: localStorage is gedeeld met andere
 *   pagina's op hetzelfde domein (bv. andere projecten op github.io), dus de inhoud is niet te vertrouwen.
 */

const KEY = "rowizerBoard"
const ALLOWED_TAGS = new Set(["DIV", "SPAN"])
const ALLOWED_ATTRIBUTES = {
    "class": /^[\w\s-]*$/,
    "id": /^schedule-content-year-[\w-]+$/,
    "data-timeslot": /^\d+$/,
    "data-appointment-id": /^\d+$/,
    "data-end-rank": /^\d+$/,
    // alleen CSS-variabelen met een getal of woord, zoals --start-hour: 3; --timeslots: 10
    "style": /^(\s*--[a-z-]+:\s*[\w.]+;?\s*)*$/,
}

/** Werkt opslag echt (schrijven en teruglezen)? */
export function storageWorks(storage) {
    try {
        storage.setItem(KEY + "Test", "1")
        let ok = storage.getItem(KEY + "Test") === "1"
        storage.removeItem(KEY + "Test")
        return ok
    } catch (e) {
        return false
    }
}

/**
 * @param entry.day Date.toDateString() van de getoonde dag
 * @param entry.scope portal en vestiging, bv. "j9qeq|a"
 * @param entry.savedAt epoch ms
 * @param entry.board, entry.absences HTML
 */
export function saveBoard(storage, entry) {
    try {
        storage.setItem(KEY, JSON.stringify({version: 1, ...entry}))
        return true
    } catch (e) {
        // vol of geblokkeerd: dan maar niet
        return false
    }
}

/** @return {{savedAt: number, board: string, absences: string}|null} alleen voor dezelfde dag en scope */
export function loadBoard(storage, {day, scope}) {
    try {
        let entry = JSON.parse(storage.getItem(KEY))
        if (entry && entry.version === 1 && entry.day === day && entry.scope === scope
            && Number.isFinite(entry.savedAt) && typeof entry.board === "string") {
            return {savedAt: entry.savedAt, board: entry.board, absences: typeof entry.absences === "string" ? entry.absences : ""}
        }
    } catch (e) {
        // kapot of geen opslag
    }
    return null
}

/**
 * Zet bewaarde HTML veilig om in elementen: onbekende elementen worden hun tekst, onbekende
 * attributen verdwijnen.
 * @return {DocumentFragment}
 */
export function sanitize(html, doc = document) {
    let template = doc.createElement("template")
    template.innerHTML = html
    let clean = node => {
        if (node.nodeType === 3) {
            return doc.createTextNode(node.textContent)
        }
        if (node.nodeType !== 1) {
            return null
        }
        if (!ALLOWED_TAGS.has(node.tagName)) {
            return doc.createTextNode(node.textContent)
        }
        let el = doc.createElement(node.tagName.toLowerCase())
        for (const attr of node.attributes) {
            let pattern = ALLOWED_ATTRIBUTES[attr.name]
            if (pattern && pattern.test(attr.value)) {
                el.setAttribute(attr.name, attr.value)
            }
        }
        node.childNodes.forEach(child => {
            let c = clean(child)
            if (c) {
                el.append(c)
            }
        })
        return el
    }
    let fragment = doc.createDocumentFragment()
    template.content.childNodes.forEach(child => {
        let c = clean(child)
        if (c) {
            fragment.append(c)
        }
    })
    return fragment
}
