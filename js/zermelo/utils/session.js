import {ZermeloAuthorizationError, ZermeloError, ZermeloNetworkError} from "./errors.js"

const REQUEST_TIMEOUT = 30*1000
const RETRY_DELAYS = [2*1000, 5*1000]

function retryable(error){
    error.retryable = true
    return error
}

class Session{
    constructor(portal, token) {
        this.portal = portal;
        this.token = token;
        //gobright has no window.caches
        //this.cache = window.caches.open("zapi")
    }

    async request(path, options= {}, req_options = {}, version= 3) {
        let url = "https://" + this.portal + ".zportal.nl/api/v" + version + "/" + path + "?" + Object.entries(options).map(e => e.join('=')).join('&');

        // Tijdelijke storingen (netwerk, time-out, 5xx) niet meteen als fout laten gelden.
        for(let attempt = 0; ; attempt++){
            try {
                return await this.#requestOnce(url, req_options)
            }
            catch (e){
                if(!e.retryable || attempt >= RETRY_DELAYS.length){
                    throw e
                }
                console.warn("Request to " + path + " failed, trying again: " + e.message)
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]))
            }
        }
    }

    async #requestOnce(url, req_options) {
        let headers = new Headers(req_options.headers);
        headers.set("Authorization", "Bearer " + this.token)

        //TODO: write caching bc zermelo gives no-cache override headers, most things can be cached.

        // Zonder time-out kan een hangende verbinding het verversen voor altijd blokkeren.
        let controller = new AbortController()
        let timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

        try {
            var result = await fetch(url, {...req_options, method: "GET", headers: headers, signal: controller.signal})
        }
        catch (e){
            clearTimeout(timeout)
            throw retryable(new ZermeloError(e.message));
        }

        try {
            var data = await result.json()
        }
        catch (e){
            // bv. een HTML-foutpagina van een tussenliggende server, of een verbinding die halverwege wegvalt
            throw retryable(new ZermeloNetworkError(result.status + " invalid response"));
        }
        finally {
            clearTimeout(timeout)
        }

        if(!data || !data.response){
            throw retryable(new ZermeloNetworkError(result.status + " invalid response"));
        }

        let status = data.response.status
        if(status !== 200){
            if(status === 401 || status === 403){
                throw new ZermeloAuthorizationError(status+" "+data.response.message);
            }
            let error = new ZermeloNetworkError(status+" "+data.response.message)
            throw (status >= 500 || status === 429) ? retryable(error) : error
        }
        return data.response.data
    }
}
export default Session;
