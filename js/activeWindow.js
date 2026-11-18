/**
 * Rusttijden (plan stap 3.2, besluit 3).
 *
 * Buiten het verversvenster (parameter `active`, standaard 06:30-18:00) en op dagen zonder
 * dagrooster haalt het bord niets op: het blijft staan met de laatste stand. 's Nachts en in het
 * weekend gaan er zo geen verzoeken naar Zermelo. `active=off` zet de rust uit.
 */

export const DEFAULT_WINDOW = "06:30-18:00"

/**
 * @param text "06:30-18:00", "off" of leeg (standaard)
 * @return {{start: number, end: number}|null} minuten na middernacht; null = altijd actief
 */
export function parseWindow(text) {
    text = (text || "").trim()
    if (text === "off") {
        return null
    }
    let match = (text || DEFAULT_WINDOW).match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/)
    let minutes = match && [[match[1], match[2]], [match[3], match[4]]].map(([h, m]) => Number(h)*60 + Number(m))
    if (!minutes || minutes.some(m => m > 24*60) || minutes[0] >= minutes[1] || Number(match[2]) > 59 || Number(match[4]) > 59) {
        console.warn("Invalid active window '" + text + "', using " + DEFAULT_WINDOW)
        return parseWindow(DEFAULT_WINDOW)
    }
    return {start: minutes[0], end: minutes[1]}
}

/** Valt dit moment binnen het venster? */
export function inWindow(window, now) {
    if (!window) {
        return true
    }
    let date = new Date(now)
    let minute = date.getHours()*60 + date.getMinutes()
    return minute >= window.start && minute < window.end
}

/**
 * @param input.window uitkomst van parseWindow
 * @param input.now
 * @param input.isReady zijn er basisgegevens? Zonder weten we nog niet of er een dagrooster is
 * @param input.lessons aantal lesuren vandaag
 * @return {boolean} true = niet verversen
 */
export function isResting({window, now, isReady, lessons}) {
    if (!window || !isReady) {
        return false
    }
    return !lessons || !inWindow(window, now)
}

/** "06:30" */
export function windowStartText(window) {
    let h = Math.floor(window.start / 60), m = window.start % 60
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0")
}
