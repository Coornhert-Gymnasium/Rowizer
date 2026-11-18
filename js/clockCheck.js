/**
 * Meet hoeveel de klok van dit scherm afwijkt van die van de webserver (plan stap R.6).
 *
 * @param options.url eigen pagina, zonder query (het token hoort niet naar de webserver)
 * @param options.fetch, options.now voor de tests
 * @return {Promise<number|null>} afwijking in ms (server min lokaal), of null zonder bruikbare Date-header
 */
export async function measureClockOffset(options = {}) {
    let fetchFn = options.fetch || ((...args) => globalThis.fetch(...args))
    let now = options.now || (() => Date.now())
    let before = now()
    let response = await fetchFn(options.url, {method: "HEAD", cache: "no-store", credentials: "omit"})
    let after = now()
    let header = response.headers && response.headers.get("Date")
    let server = header ? Date.parse(header) : NaN
    if (Number.isNaN(server)) {
        return null
    }
    // De header rondt af op hele seconden: de echte servertijd ligt in [server, server + 1 s).
    return server + 500 - (before + after) / 2
}

export const SCHOOL_TIME_ZONE = "Europe/Amsterdam"

/**
 * Tijdzone van dit scherm (plan stap R.6, besluit 7). Rowizer rekent met de tijd van het scherm;
 * staat dat op een andere tijdzone dan de school, dan kloppen de dag en het lopende lesuur niet.
 * Dat lossen we niet op in de code (de Pi staat op Amsterdam), maar het moet wel opvallen.
 * @return {string|null} korte code voor rechtsonder, bv. "tijdzone UTC", of null als het klopt
 */
export function timeZoneNote(expected = SCHOOL_TIME_ZONE, now = Date.now(), resolved = currentTimeZone()) {
    if (resolved === expected) {
        return null
    }
    // een andere naam met dezelfde tijd (bv. Europe/Brussels) is geen probleem
    let format = zone => {
        try {
            return new Intl.DateTimeFormat("en-GB", {timeZone: zone, dateStyle: "short", timeStyle: "short"}).format(now)
        } catch (e) {
            return null
        }
    }
    let ours = format(resolved), school = format(expected)
    if (ours && school && ours === school) {
        return null
    }
    return "tijdzone " + (resolved || "onbekend")
}

function currentTimeZone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch (e) {
        return null
    }
}

/** Korte code voor rechtsonder, bv. "klok +12 min", of null als de klok goed staat. */
export function clockNote(offset) {
    if (!offset) {
        return null
    }
    let minutes = Math.round(offset / 60000)
    return "klok " + (minutes > 0 ? "+" : "") + minutes + " min"
}
