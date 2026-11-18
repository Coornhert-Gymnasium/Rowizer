import {ZermeloError, ZermeloNetworkError, errorForStatus} from "./errors.js"

const REQUEST_TIMEOUT = 30*1000

// Opnieuw proberen bij tijdelijke fouten: oplopende wachttijd met spreiding, zodat schermen
// niet tegelijk terugkomen.
const RETRY_DELAYS = [2*1000, 5*1000, 15*1000]
const RETRY_JITTER = 0.3
const RATE_LIMIT_WAIT = 60*1000

/**
 * Eigen verzoekbudget per scherm (plan stap R.3, besluit 10). Zermelo hanteert geen limiet;
 * dit is een zelfgekozen grens ruim boven normaal gebruik (ongeveer 14 verzoeken per 10 minuten),
 * die een fout in de eigen code (een lus die doordraait) stopt voordat de portal er last van heeft.
 * Bewust geen URL-parameter.
 */
const LIMITS = {
    concurrent: 2,
    spacing: 250,
    windowLength: 10*60*1000,
    // 60 bleek in de praktijk te krap: twee keer verversen (elk ~20 verzoeken met herhalingen)
    // plus een paar extra rondes liet het bord minutenlang leeg. 100 is nog ~7x normaal gebruik.
    windowMax: 100,
    dayMax: 2500,
    maxWait: 2*60*1000,
}

// Na een storing: één proefverzoek per interval, oplopend tot 10 minuten.
const PROBE_INTERVALS = [60*1000, 2*60*1000, 5*60*1000, 10*60*1000]
const AUTH_PROBE_INTERVAL = 10*60*1000
const DOWN_KINDS = ["network", "server", "rate", "data", "auth"]

/**
 * Bewaart het budget in window.name: dat blijft bij een paginaherlading bestaan, zodat een
 * herlaadlus het budget niet omzeilt, en het werkt ook waar localStorage ontbreekt.
 */
export const windowNameStore = {
    load(){
        try {
            return JSON.parse(globalThis.window?.name || "{}").rowizerBudget
        } catch (e) {
            return undefined
        }
    },
    save(budget){
        if(!globalThis.window){
            return
        }
        let value = {}
        try {
            value = JSON.parse(window.name || "{}") || {}
        } catch (e) {
            // window.name was van iemand anders: overschrijven
        }
        value.rowizerBudget = budget
        window.name = JSON.stringify(value)
    }
}

function memoryStore(){
    let saved
    return {load: () => saved, save: budget => { saved = structuredClone(budget) }}
}

function dayKey(time){
    let d = new Date(time)
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate()
}

class Session{
    #active = 0
    #waiting = []
    #lastStart = 0
    #budget
    #health = {state: "ok", failures: 0, nextProbeAt: 0, lastError: null, probing: false, since: null}

    /**
     * @param options.fetch eigen fetch-functie (tests)
     * @param options.now, options.sleep eigen klok (tests)
     * @param options.random eigen toevalsgenerator (tests)
     * @param options.store opslag voor het budget, standaard window.name
     * @param options.retryDelays wachttijden tussen pogingen
     */
    constructor(portal, token, options = {}) {
        this.portal = portal;
        this.token = token;
        this.fetch = options.fetch || ((...args) => globalThis.fetch(...args))
        this.now = options.now || (() => Date.now())
        this.sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)))
        this.random = options.random || Math.random
        this.retryDelays = options.retryDelays || RETRY_DELAYS
        this.store = options.store || (globalThis.window ? windowNameStore : memoryStore())
        this.#budget = this.#loadBudget()
    }

    /** Storingstoestand, gedeeld door alle verversloops. */
    get health(){
        let h = this.#health
        return {state: h.state, failures: h.failures, since: h.since, nextProbeAt: h.nextProbeAt, lastError: h.lastError}
    }

    /** Tellers voor de diagnose. */
    get budget(){
        this.#pruneBudget()
        return {lastWindow: this.#budget.recent.length, today: this.#budget.dayCount, hits: this.#budget.hits, limits: {...LIMITS}}
    }

    async request(path, options= {}, req_options = {}, version= 3) {
        let url = this.#buildUrl(path, options, version)

        // Tijdens een storing doen de andere loops geen verzoeken; één proefverzoek per interval.
        let health = this.#health
        let isProbe = false
        if(health.state === "down"){
            if(health.probing || this.now() < health.nextProbeAt){
                throw this.#skippedError(path)
            }
            health.probing = true
            isProbe = true
        }

        try {
            let result = await this.#requestWithRetries(path, url, req_options)
            this.#markHealthy()
            return result
        }
        catch (e){
            if(e instanceof ZermeloError && !e.local && DOWN_KINDS.includes(e.kind)){
                this.#markDown(e)
            }
            throw e
        }
        finally {
            if(isProbe){
                health.probing = false
            }
        }
    }

    #buildUrl(path, options, version){
        let query = new URLSearchParams()
        Object.entries(options).forEach(([key, value]) => {
            if(value === undefined || value === null){
                return
            }
            query.append(key, Array.isArray(value) ? value.join(",") : String(value))
        })
        let qs = query.toString()
        return "https://" + encodeURIComponent(this.portal) + ".zportal.nl/api/v" + version + "/" + path + (qs ? "?" + qs : "")
    }

    async #requestWithRetries(path, url, req_options){
        for(let attempt = 0; ; attempt++){
            let release = await this.#acquire(path)
            try {
                return await this.#requestOnce(path, url, req_options)
            }
            catch (e){
                release()
                if(!(e instanceof ZermeloError) || !e.retryable || attempt >= this.retryDelays.length){
                    throw e
                }
                let delay = e.kind === "rate"
                    ? (e.retryAfter ? e.retryAfter*1000 : RATE_LIMIT_WAIT)
                    : this.retryDelays[attempt] * (1 + RETRY_JITTER*(2*this.random() - 1))
                console.warn("Request to " + path + " failed, trying again in " + Math.round(delay/1000) + "s: " + e.message)
                await this.sleep(delay)
            }
            finally {
                release()
            }
        }
    }

    // --- wachtrij en budget ---

    /**
     * Wacht op een plek in de wachtrij en op het budget.
     * @return {Function} geeft de plek weer vrij; mag vaker aangeroepen worden
     */
    async #acquire(path){
        // maximaal LIMITS.concurrent tegelijk; een vrijgekomen plek gaat direct naar de volgende
        if(this.#active >= LIMITS.concurrent){
            await new Promise(resolve => this.#waiting.push(resolve))
        } else {
            this.#active++
        }
        let released = false
        let release = () => {
            if(released){
                return
            }
            released = true
            let next = this.#waiting.shift()
            if(next){
                next()
            } else {
                this.#active--
            }
        }

        let started = this.now()
        let warned = false
        for(;;){
            let {wait, overBudget} = this.#budgetWait()
            if(wait <= 0){
                break
            }
            if(overBudget){
                if(!warned){
                    warned = true
                    this.#budget.hits++
                    console.warn("Request budget reached, " + path + " waits " + Math.round(wait/1000) + "s. This is a bug in Rowizer.")
                }
                if(this.now() + wait - started > LIMITS.maxWait){
                    release()
                    let error = new ZermeloNetworkError(path + ": request budget exhausted", {kind: "rate", endpoint: path})
                    error.local = true
                    throw error
                }
            }
            await this.sleep(wait)
        }

        this.#lastStart = this.now()
        this.#budget.recent.push(this.#lastStart)
        this.#budget.dayCount++
        this.#saveBudget()
        return release
    }

    #budgetWait(){
        this.#pruneBudget()
        let now = this.now()
        let budget = this.#budget
        if(budget.dayCount >= LIMITS.dayMax){
            let midnight = new Date(now)
            midnight.setHours(24, 0, 0, 0)
            return {wait: midnight.getTime() - now, overBudget: true}
        }
        if(budget.recent.length >= LIMITS.windowMax){
            return {wait: budget.recent[0] + LIMITS.windowLength - now, overBudget: true}
        }
        return {wait: this.#lastStart + LIMITS.spacing - now, overBudget: false}
    }

    #pruneBudget(){
        let now = this.now()
        let budget = this.#budget
        budget.recent = budget.recent.filter(time => time > now - LIMITS.windowLength && time <= now)
        if(budget.day !== dayKey(now)){
            budget.day = dayKey(now)
            budget.dayCount = 0
        }
    }

    #loadBudget(){
        let saved = this.store.load()
        let budget = {recent: [], day: dayKey(this.now()), dayCount: 0, hits: 0}
        if(saved && Array.isArray(saved.recent) && typeof saved.dayCount === "number"){
            budget = {...budget, ...saved}
        }
        return budget
    }

    #saveBudget(){
        try {
            this.store.save(this.#budget)
        } catch (e) {
            // zonder opslag werkt het budget alleen binnen deze pagina
        }
    }

    // --- storingstoestand ---

    #markHealthy(){
        let health = this.#health
        if(health.state !== "ok"){
            console.info("Zermelo reachable again")
        }
        Object.assign(health, {state: "ok", failures: 0, nextProbeAt: 0, lastError: null, since: null})
    }

    #markDown(error){
        let health = this.#health
        health.failures++
        let interval = error.kind === "auth"
            ? AUTH_PROBE_INTERVAL
            : PROBE_INTERVALS[Math.min(health.failures - 1, PROBE_INTERVALS.length - 1)]
        if(health.state !== "down"){
            health.since = this.now()
        }
        Object.assign(health, {state: "down", nextProbeAt: this.now() + interval, lastError: error})
    }

    #skippedError(path){
        let last = this.#health.lastError
        let error = new ZermeloNetworkError(path + ": skipped, Zermelo not reachable (" + (last ? last.message : "") + ")", {
            kind: last ? last.kind : "network",
            status: last && last.status,
            endpoint: path,
        })
        error.skipped = true
        return error
    }

    // --- één verzoek ---

    async #requestOnce(endpoint, url, req_options) {
        let headers = new Headers(req_options.headers);
        headers.set("Authorization", "Bearer " + this.token)

        // Zonder time-out kan een hangende verbinding het verversen voor altijd blokkeren.
        let controller = new AbortController()
        let timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

        let result
        try {
            result = await this.fetch(url, {
                ...req_options,
                method: "GET",
                headers: headers,
                signal: controller.signal,
                // geen cookies (Zermelo zet een JSESSIONID) en geen verouderde antwoorden
                credentials: "omit",
                cache: "no-store",
            })
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

        // Een afgekapt of verkeerd gevormd antwoord mag nooit als 'geen wijzigingen' gelden.
        let rows = data.response.data
        if(!Array.isArray(rows)){
            throw new ZermeloNetworkError(endpoint + ": response without data", {kind: "data", endpoint})
        }
        let total = data.response.totalRows
        if(typeof total === "number" && total > rows.length){
            throw new ZermeloNetworkError(endpoint + ": incomplete response, " + rows.length + " of " + total + " rows",
                {kind: "data", endpoint})
        }
        return rows
    }
}
export default Session;
