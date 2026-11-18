// Bouwstenen voor een nep-fetch met de antwoordvormen die op de demo-portal gemeten zijn
// (docs/VERBETERPLAN.md §2.5).

export function zermeloResponse(status, data = [], extra = {}) {
    let body = {response: {status, message: status === 200 ? "" : "melding " + status, details: "", eventId: 123,
        startRow: 0, endRow: data?.length ?? 0, totalRows: data?.length ?? 0, data, ...extra}}
    return new Response(JSON.stringify(body), {
        status: status === 200 ? 200 : status,
        headers: {"content-type": "application/json", ...(extra.headers || {})},
    })
}

export function htmlResponse(status) {
    return new Response("<html><body>Bad gateway</body></html>", {status, headers: {"content-type": "text/html"}})
}

/**
 * Virtuele klok: sleep() zet de tijd direct vooruit, zodat wachttijden van minuten niets kosten.
 */
export function virtualClock(start = new Date(2026, 8, 23, 8, 0).getTime()) {
    let clock = {t: start, sleeps: []}
    clock.now = () => clock.t
    clock.sleep = ms => {
        clock.sleeps.push(Math.round(ms))
        clock.t += Math.max(0, ms)
        return new Promise(resolve => setImmediate(resolve))
    }
    clock.advance = ms => { clock.t += ms }
    return clock
}

export function memoryStore(initial) {
    let saved = initial
    return {load: () => saved, save: budget => { saved = structuredClone(budget) }, get saved() { return saved }}
}

/**
 * @param handlers lijst van (url, attempt) => Response | Error, één per poging; de laatste wordt herhaald
 */
export function scriptedFetch(handlers) {
    let calls = []
    let fn = async (url, options) => {
        calls.push({url: String(url), options})
        let handler = handlers[Math.min(calls.length - 1, handlers.length - 1)]
        let result = await handler(String(url), calls.length)
        if (result instanceof Error) {
            throw result
        }
        return result
    }
    fn.calls = calls
    return fn
}
