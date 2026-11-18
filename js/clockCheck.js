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

/** Korte code voor rechtsonder, bv. "klok +12 min", of null als de klok goed staat. */
export function clockNote(offset) {
    if (!offset) {
        return null
    }
    let minutes = Math.round(offset / 60000)
    return "klok " + (minutes > 0 ? "+" : "") + minutes + " min"
}
