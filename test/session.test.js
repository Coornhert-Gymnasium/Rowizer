import "./helpers/tz.js"
import "./helpers/quiet.js"
import test from "node:test"
import assert from "node:assert/strict"
import Session from "../js/zermelo/utils/session.js"
import {ZermeloAuthorizationError, ZermeloError} from "../js/zermelo/utils/errors.js"
import {zermeloResponse, htmlResponse, scriptedFetch} from "./helpers/fakeFetch.js"

function session(handlers) {
    let fetch = scriptedFetch(handlers)
    return {fetch, session: new Session("demo", "token", {fetch, retryDelays: [1, 1]})}
}

async function kindOf(handlers) {
    let {session: s, fetch} = session(handlers)
    try {
        await s.request("branches")
    } catch (e) {
        return {error: e, calls: fetch.calls.length}
    }
    return {error: null, calls: fetch.calls.length}
}

test("geslaagd verzoek geeft de rijen", async () => {
    let {session: s, fetch} = session([() => zermeloResponse(200, [{id: 1}])])
    assert.deepEqual(await s.request("branches", {code: "a"}), [{id: 1}])
    assert.match(fetch.calls[0].url, /^https:\/\/demo\.zportal\.nl\/api\/v3\/branches\?code=a$/)
    assert.equal(fetch.calls[0].options.headers.get("Authorization"), "Bearer token")
})

test("401: auth, niet opnieuw proberen", async () => {
    let {error, calls} = await kindOf([() => zermeloResponse(401)])
    assert.ok(error instanceof ZermeloAuthorizationError)
    assert.equal(error.kind, "auth")
    assert.equal(error.code, "auth 401")
    assert.equal(error.endpoint, "branches")
    assert.equal(error.eventId, 123)
    assert.equal(calls, 1)
})

test("403: permission, niet opnieuw proberen", async () => {
    let {error, calls} = await kindOf([() => zermeloResponse(403)])
    assert.equal(error.kind, "permission")
    assert.equal(calls, 1)
})

test("404: request, niet opnieuw proberen", async () => {
    let {error, calls} = await kindOf([() => zermeloResponse(404)])
    assert.equal(error.kind, "request")
    assert.equal(error.retryable, false)
    assert.equal(calls, 1)
})

test("500 met Zermelo-JSON: server, drie pogingen", async () => {
    let {error, calls} = await kindOf([() => zermeloResponse(500)])
    assert.equal(error.kind, "server")
    assert.equal(calls, 3)
})

test("502 met HTML: server, drie pogingen", async () => {
    let {error, calls} = await kindOf([() => htmlResponse(502)])
    assert.equal(error.kind, "server")
    assert.equal(error.status, 502)
    assert.equal(calls, 3)
})

test("geen verbinding: network", async () => {
    let {error, calls} = await kindOf([() => new TypeError("Failed to fetch")])
    assert.equal(error.kind, "network")
    assert.ok(error instanceof ZermeloError)
    assert.equal(calls, 3)
})

test("429: rate, met Retry-After", async () => {
    let {error} = await kindOf([() => zermeloResponse(429, [], {headers: {"Retry-After": "30"}})])
    assert.equal(error.kind, "rate")
    assert.equal(error.retryAfter, 30)
})

test("tijdelijke storing die overgaat: gewoon resultaat", async () => {
    let {error, calls} = await kindOf([() => htmlResponse(503), () => zermeloResponse(200, [{id: 1}])])
    assert.equal(error, null)
    assert.equal(calls, 2)
})
