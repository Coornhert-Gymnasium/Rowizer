import "./helpers/tz.js"
import "./helpers/quiet.js"
import test from "node:test"
import assert from "node:assert/strict"
import Session from "../js/zermelo/utils/session.js"
import {zermeloResponse, htmlResponse, scriptedFetch, virtualClock, memoryStore} from "./helpers/fakeFetch.js"

const ok = () => zermeloResponse(200, [{id: 1}])

function setup(handlers, options = {}) {
    let fetch = scriptedFetch(handlers)
    let clock = virtualClock()
    let store = options.store || memoryStore()
    let session = new Session("demo", "token", {fetch, now: clock.now, sleep: clock.sleep, random: options.random || (() => 0.5), store})
    return {fetch, clock, store, session}
}

const MINUTE = 60*1000

test("opnieuw proberen na 2, 5 en 15 seconden", async () => {
    let {session, fetch, clock} = setup([() => htmlResponse(503)])
    await assert.rejects(session.request("appointments"), e => e.kind === "server")
    assert.equal(fetch.calls.length, 4)
    assert.deepEqual(clock.sleeps.filter(ms => ms >= 1000), [2000, 5000, 15000])
})

test("spreiding van ±30% op de wachttijd", async () => {
    let low = setup([() => htmlResponse(503)], {random: () => 0})
    await assert.rejects(low.session.request("x"))
    assert.deepEqual(low.clock.sleeps.filter(ms => ms >= 1000), [1400, 3500, 10500])
    let high = setup([() => htmlResponse(503)], {random: () => 1})
    await assert.rejects(high.session.request("x"))
    assert.deepEqual(high.clock.sleeps.filter(ms => ms >= 1000), [2600, 6500, 19500])
})

test("429 volgt Retry-After, anders 60 seconden", async () => {
    let withHeader = setup([() => zermeloResponse(429, [], {headers: {"Retry-After": "30"}}), ok])
    await withHeader.session.request("x")
    assert.ok(withHeader.clock.sleeps.includes(30000))
    let without = setup([() => zermeloResponse(429), ok])
    await without.session.request("x")
    assert.ok(without.clock.sleeps.includes(60000))
})

test("tussen twee verzoeken minstens 250 ms", async () => {
    let {session, fetch, clock} = setup([ok])
    let times = []
    let original = fetch
    await session.request("a")
    times.push(clock.now())
    await session.request("b")
    times.push(clock.now())
    assert.ok(times[1] - times[0] >= 250)
    assert.equal(original.calls.length, 2)
})

test("nooit meer dan 2 verzoeken tegelijk", async () => {
    let active = 0, maxActive = 0
    let fetch = async () => {
        active++
        maxActive = Math.max(maxActive, active)
        await new Promise(resolve => setImmediate(resolve))
        await new Promise(resolve => setImmediate(resolve))
        active--
        return ok()
    }
    let clock = virtualClock()
    let session = new Session("demo", "token", {fetch, now: clock.now, sleep: clock.sleep, store: memoryStore()})
    await Promise.all(Array.from({length: 8}, (_, i) => session.request("x" + i)))
    assert.equal(maxActive, 2)
})

test("budget: het 61e verzoek in een uitbarsting wacht niet eindeloos maar faalt als 'rate'", async () => {
    let {session, fetch} = setup([ok])
    for (let i = 0; i < 60; i++) {
        await session.request("x")
    }
    await assert.rejects(session.request("x"), e => e.kind === "rate" && e.local === true)
    assert.equal(fetch.calls.length, 60)
    assert.equal(session.budget.hits, 1)
    // het eigen budget is geen storing van Zermelo
    assert.equal(session.health.state, "ok")
})

test("budget: met ruimte binnen 2 minuten wacht het verzoek en gaat het door", async () => {
    let {session, fetch, clock} = setup([ok])
    for (let i = 0; i < 60; i++) {
        await session.request("x")
    }
    clock.advance(9*MINUTE)
    await session.request("x")
    assert.equal(fetch.calls.length, 61)
    assert.ok(session.budget.lastWindow <= 60)
})

test("budget overleeft een paginaherlading", async () => {
    let store = memoryStore()
    let first = setup([ok], {store})
    for (let i = 0; i < 60; i++) {
        await first.session.request("x")
    }
    let second = new Session("demo", "token", {fetch: first.fetch, now: first.clock.now, sleep: first.clock.sleep, store})
    assert.equal(second.budget.lastWindow, 60)
    await assert.rejects(second.request("x"), e => e.kind === "rate")
})

test("budget per etmaal", async () => {
    let clock = virtualClock()
    let d = new Date(clock.now())
    let store = memoryStore({recent: [], day: d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(), dayCount: 2500, hits: 0})
    let {session, fetch} = setup([ok], {store})
    await assert.rejects(session.request("x"), e => e.kind === "rate")
    assert.equal(fetch.calls.length, 0)
})

test("storing: andere verzoeken worden overgeslagen tot het proefverzoek", async () => {
    let failing = true
    let {session, fetch, clock} = setup([() => failing ? new TypeError("Failed to fetch") : ok()])
    await assert.rejects(session.request("appointments"), e => e.kind === "network")
    assert.equal(session.health.state, "down")
    let calls = fetch.calls.length

    await assert.rejects(session.request("employeeabsences"), e => e.skipped === true && e.kind === "network")
    assert.equal(fetch.calls.length, calls, "geen verzoek tijdens de storing")

    failing = false
    clock.advance(MINUTE)
    assert.deepEqual(await session.request("appointments"), [{id: 1}])
    assert.equal(session.health.state, "ok")
})

test("storing: interval voor het proefverzoek loopt op", async () => {
    let {session, clock} = setup([() => new TypeError("Failed to fetch")])
    await assert.rejects(session.request("x"))
    let first = session.health.nextProbeAt - clock.now()
    clock.advance(first)
    await assert.rejects(session.request("x"))
    let second = session.health.nextProbeAt - clock.now()
    assert.equal(first, MINUTE)
    assert.equal(second, 2*MINUTE)
})

test("verlopen token: proefverzoek pas na 10 minuten", async () => {
    let {session, clock} = setup([() => zermeloResponse(401)])
    await assert.rejects(session.request("x"), e => e.kind === "auth")
    assert.equal(session.health.state, "down")
    assert.equal(session.health.nextProbeAt - clock.now(), 10*MINUTE)
})

test("ontbrekend recht (403) is geen storing", async () => {
    let {session} = setup([() => zermeloResponse(403)])
    await assert.rejects(session.request("employeeabsences"), e => e.kind === "permission")
    assert.equal(session.health.state, "ok")
})

test("query-parameters worden gecodeerd, lijsten met komma's", async () => {
    let {session, fetch} = setup([ok])
    await session.request("locationofbranches", {name: "leerplein a&b", fields: ["id", "name"], valid: false, skip: undefined})
    let url = new URL(fetch.calls[0].url)
    assert.equal(url.searchParams.get("name"), "leerplein a&b")
    assert.equal(url.searchParams.get("fields"), "id,name")
    assert.equal(url.searchParams.get("valid"), "false")
    assert.equal(url.searchParams.has("skip"), false)
    assert.equal(fetch.calls[0].options.credentials, "omit")
    assert.equal(fetch.calls[0].options.cache, "no-store")
})
