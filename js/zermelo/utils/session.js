import {ZermeloError, ZermeloNetworkError, errorForStatus} from "./errors.js"

const REQUEST_TIMEOUT = 30*1000
const RETRY_DELAYS = [2*1000, 5*1000]

class Session{
    /**
     * @param options.retryDelays wachttijden tussen pogingen (voor de tests)
     * @param options.fetch eigen fetch-functie (voor de tests)
     */
    constructor(portal, token, options = {}) {
        this.portal = portal;
        this.token = token;
        this.retryDelays = options.retryDelays || RETRY_DELAYS
        this.fetch = options.fetch || ((...args) => globalThis.fetch(...args))
        //gobright has no window.caches
        //this.cache = window.caches.open("zapi")
    }

    async request(path, options= {}, req_options = {}, version= 3) {
        let url = "https://" + this.portal + ".zportal.nl/api/v" + version + "/" + path + "?" + Object.entries(options).map(e => e.join('=')).join('&');

        // Tijdelijke storingen (netwerk, time-out, 5xx, 429) niet meteen als fout laten gelden.
        for(let attempt = 0; ; attempt++){
            try {
                return await this.#requestOnce(path, url, req_options)
            }
            catch (e){
                if(!(e instanceof ZermeloError) || !e.retryable || attempt >= this.retryDelays.length){
                    throw e
                }
                console.warn("Request to " + path + " failed, trying again: " + e.message)
                await new Promise(resolve => setTimeout(resolve, this.retryDelays[attempt]))
            }
        }
    }

    async #requestOnce(endpoint, url, req_options) {
        let headers = new Headers(req_options.headers);
        headers.set("Authorization", "Bearer " + this.token)

        //TODO: write caching bc zermelo gives no-cache override headers, most things can be cached.

        // Zonder time-out kan een hangende verbinding het verversen voor altijd blokkeren.
        let controller = new AbortController()
        let timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

        let result
        try {
            result = await this.fetch(url, {...req_options, method: "GET", headers: headers, signal: controller.signal})
        }
        catch (e){
            clearTimeout(timeout)
            let reason = controller.signal.aborted ? "timeout" : e.message
            throw new ZermeloNetworkError(endpoint + ": " + reason, {kind: "network", endpoint})
        }

        let data
        try {
            data = await result.json()
        }
        catch (e){
            // bv. een HTML-foutpagina van een tussenliggende server, of een verbinding die halverwege wegvalt
            throw new ZermeloNetworkError(endpoint + ": " + result.status + " invalid response", {kind: "server", status: result.status, endpoint})
        }
        finally {
            clearTimeout(timeout)
        }

        if(!data || !data.response){
            throw new ZermeloNetworkError(endpoint + ": " + result.status + " invalid response", {kind: "server", status: result.status, endpoint})
        }

        let status = data.response.status
        if(status !== 200){
            let retryAfter = Number(result.headers && result.headers.get("Retry-After"))
            throw errorForStatus(status, {
                endpoint,
                zermeloMessage: data.response.message,
                eventId: data.response.eventId,
                retryAfter: retryAfter > 0 ? retryAfter : undefined,
            })
        }
        return data.response.data
    }
}
export default Session;
