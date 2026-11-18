import "./helpers/quiet.js"
import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import vm from "node:vm"

const source = readFileSync(new URL("../sw.js", import.meta.url), "utf8")
const ORIGIN = "https://tomkooij.github.io"
const SCOPE = ORIGIN + "/Rowizer/"

// sw.js in een nagebootste worker-omgeving draaien
function worker({fetch, timeoutMs}) {
    let store = new Map()
    let keyOf = (key, ignoreSearch) => {
        let url = new URL(typeof key === "string" ? key : key.url)
        if (ignoreSearch) url.search = ""
        return url.href
    }
    let cache = {
        put: async (key, response) => { store.set(keyOf(key, true), response) },
        match: async (key, options = {}) => store.get(keyOf(key, options.ignoreSearch)),
    }
    let listeners = {}
    let context = {
        self: {
            location: new URL(SCOPE + "sw.js"),
            registration: {scope: SCOPE},
            addEventListener: (type, fn) => { listeners[type] = fn },
            skipWaiting: () => {},
            clients: {claim: async () => {}},
        },
        caches: {open: async () => cache, keys: async () => ["rowizer-v0", "rowizer-v1"], delete: async name => { context.deleted = name }},
        fetch,
        URL,
        Promise,
        setTimeout: (fn, ms) => setTimeout(fn, timeoutMs ?? ms),
    }
    vm.runInNewContext(source, context)
    let handle = request => {
        let response
        listeners.fetch({request, respondWith: p => { response = p }})
        return response
    }
    return {handle, store, listeners, context}
}

const response = (body, extra = {}) => ({ok: true, type: "basic", body, clone() { return this }, ...extra})
const get = (path, mode = "cors") => ({method: "GET", url: SCOPE + path, mode})

test("netwerk eerst; het antwoord wordt bewaard", async () => {
    let w = worker({fetch: async () => response("nieuw")})
    assert.equal((await w.handle(get("js/script.js"))).body, "nieuw")
    assert.equal(w.store.get(SCOPE + "js/script.js").body, "nieuw")
})

test("geen netwerk: de bewaarde versie", async () => {
    let online = true
    let w = worker({fetch: async () => { if (!online) throw new TypeError("offline"); return response("v1") }})
    await w.handle(get("js/script.js"))
    online = false
    assert.equal((await w.handle(get("js/script.js"))).body, "v1")
})

test("de pagina onder één sleutel, ongeacht query en fragment", async () => {
    let online = true
    let w = worker({fetch: async () => { if (!online) throw new TypeError("offline"); return response("pagina") }})
    await w.handle(get("?v=1", "navigate"))
    online = false
    assert.equal((await w.handle(get("?v=2", "navigate"))).body, "pagina")
})

test("webhost hangt: na de time-out de bewaarde versie", async () => {
    let hang = false
    let w = worker({fetch: () => hang ? new Promise(() => {}) : Promise.resolve(response("v1")), timeoutMs: 10})
    await w.handle(get("styles.css"))
    hang = true
    assert.equal((await w.handle(get("styles.css"))).body, "v1")
})

test("Zermelo, HEAD-verzoeken en foutantwoorden blijven buiten de worker of de cache", async () => {
    let w = worker({fetch: async () => response("x", {ok: false})})
    assert.equal(w.handle({method: "GET", url: "https://j9qeq.zportal.nl/api/v3/appointments", mode: "cors"}), undefined)
    assert.equal(w.handle({method: "HEAD", url: SCOPE, mode: "cors"}), undefined)
    await w.handle(get("js/version.js"))
    assert.equal(w.store.size, 0, "een 404 of 500 wordt niet bewaard")
})

test("oude caches worden bij het activeren opgeruimd", async () => {
    let w = worker({fetch: async () => response("x")})
    let done
    w.listeners.activate({waitUntil: p => { done = p }})
    await done
    assert.equal(w.context.deleted, "rowizer-v0")
})
