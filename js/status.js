/**
 * Wat het scherm zegt over de actualiteit van de gegevens (plan stap R.10, besluit 9).
 * Pure functie: alle invoer komt mee, zodat dit zonder browser te testen is.
 *
 * Op het scherm alleen neutrale tekst; de oorzaak staat als korte code rechtsonder.
 */

const MINUTE = 60*1000
export const STALE_WARN = 15*MINUTE
export const STALE_ERROR = 60*MINUTE
export const ABSENCES_STALE = 30*MINUTE
export const ABSENCES_HIDE = 2*60*MINUTE

export const NEUTRAL_TEXT = "Roosterwijzigingen tijdelijk niet beschikbaar"
export const NO_LESSONS_TEXT = "Vandaag geen lessen"
const CONNECTION_KINDS = ["network", "server", "rate", "data"]

// Tijden op het scherm volgen de gecorrigeerde klok (plan stap R.6); zie computeStatus.
let displayOffset = 0

function time(ms) {
    return new Date(ms + displayOffset).toLocaleTimeString("nl-NL", {hour: "2-digit", minute: "2-digit"})
}

/** Korte code van een fout, bv. "auth 401", "network", "render". */
export function errorCode(error) {
    if (!error) {
        return null
    }
    if (typeof error === "string") {
        return error
    }
    if (error.code) {
        return error.code
    }
    return error.kind || "error"
}

/**
 * @param input.now
 * @param input.isReady zijn er basisgegevens?
 * @param input.loadError laatste fout bij het laden van de basisgegevens
 * @param input.health storingstoestand van de sessie ({state, lastError})
 * @param input.changes taak uit de planner ({addedAt, lastSuccess, lastError}) of undefined
 * @param input.changesFailure "load" | "render" | null (ChangesUiManager.lastFailure)
 * @param input.absences taak uit de planner, of undefined als afwezigen uit staan
 * @param input.clockOffset afwijking van de klok van dit scherm, voor het tonen van tijden
 * @return {{bar: null|{level: string, text: string}, boardMessage: string|null, code: string|null,
 *           updated: string|null, absences: "fresh"|"stale"|"hidden", absencesNote: string|null}}
 */
export function computeStatus(input) {
    let {now, isReady, loadError, health, changes, changesFailure, absences} = input
    displayOffset = input.clockOffset || 0
    let result = {bar: null, boardMessage: null, code: null, updated: null, absences: "fresh", absencesNote: null}

    let healthError = health && health.state === "down" ? health.lastError : null
    // changesFailure is "render" of de fout bij het laden
    let changesError = changesFailure && typeof changesFailure === "object" ? changesFailure : null

    if (!isReady) {
        if (loadError) {
            result.code = errorCode(loadError)
            result.boardMessage = loadError.kind === "config" && loadError.reason === "school-year-unknown"
                ? NO_LESSONS_TEXT
                : NEUTRAL_TEXT
        }
        return result
    }

    let lastSuccess = changes && changes.lastSuccess
    if (lastSuccess) {
        result.updated = "bijgewerkt " + time(lastSuccess)
    }
    // Zonder geslaagde ronde telt de tijd vanaf het begin van de taak.
    let age = now - (lastSuccess || (changes && changes.addedAt) || now)
    let cause = healthError || changesError || (changes && changes.lastError) || (changesFailure === "render" ? "render" : null)
    if (cause) {
        result.code = errorCode(cause)
    }

    if (cause && age > STALE_WARN) {
        // alleen bij een echte verbindingsfout noemen we de verbinding; anders neutraal
        let connection = typeof cause === "object" && CONNECTION_KINDS.includes(cause.kind)
        let text = (connection ? "Geen verbinding met Zermelo" : NEUTRAL_TEXT) + (lastSuccess ? " – stand van " + time(lastSuccess) : "")
        result.bar = {level: age > STALE_ERROR ? "error" : "warn", text}
    }

    if (absences && absences.lastSuccess) {
        let absencesAge = now - absences.lastSuccess
        if (absencesAge > ABSENCES_HIDE) {
            result.absences = "hidden"
        } else if (absencesAge > ABSENCES_STALE) {
            result.absences = "stale"
            result.absencesNote = "(stand van " + time(absences.lastSuccess) + ")"
        }
    }
    return result
}
