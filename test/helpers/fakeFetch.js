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
