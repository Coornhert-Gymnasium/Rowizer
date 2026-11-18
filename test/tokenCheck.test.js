import "./helpers/tz.js"
import "./helpers/quiet.js"
import test from "node:test"
import assert from "node:assert/strict"
import {checkToken, tokenNote} from "../js/tokenCheck.js"
import {errorForStatus} from "../js/zermelo/utils/errors.js"
import diagnostics from "../js/diagnostics.js"

const now = new Date(2026, 8, 23, 8, 0).getTime()
const DAY = 24*60*60*1000

function session(result) {
    let requests = []
    return {
        requests,
        async request(path, options) {
            requests.push({path, options})
            if (result instanceof Error) throw result
            return result
        }
    }
}

test("vraagt alleen gebruiker en vervaldatum op", async () => {
    let s = session([{user: "narrowcasting", expires: 1915567199}])
    let result = await checkToken(s, now)
    assert.deepEqual(s.requests[0], {path: "tokens/~current", options: {fields: ["user", "expires"]}})
    assert.equal(result.user, "narrowcasting")
    assert.equal(result.expiresSoon, false)
    assert.equal(tokenNote(result), null)
    assert.equal(diagnostics.token.user, "narrowcasting")
})

test("verloopt binnen 30 dagen: korte code", async () => {
    let expires = new Date(2026, 9, 10, 23, 59).getTime()
    let result = await checkToken(session([{user: "x", expires: expires/1000}]), now)
    assert.equal(result.expiresSoon, true)
    assert.equal(result.daysLeft, 17)
    assert.equal(tokenNote(result), "token 10-10-2026")
})

test("verloopt niet (expires 0)", async () => {
    let result = await checkToken(session([{user: "x", expires: 0}]), now)
    assert.equal(result.expires, null)
    assert.equal(result.expiresSoon, false)
})

test("geen recht: overslaan zonder fout", async () => {
    assert.equal(await checkToken(session(errorForStatus(403)), now), null)
})

test("netwerkfout: doorgeven, zodat de planner het later opnieuw probeert", async () => {
    await assert.rejects(checkToken(session(errorForStatus(503)), now), e => e.kind === "server")
})

test("verlopen token (daysLeft negatief) telt ook als 'binnenkort'", async () => {
    let result = await checkToken(session([{user: "x", expires: (now - 2*DAY)/1000}]), now)
    assert.equal(result.expiresSoon, true)
    assert.ok(result.daysLeft < 0)
})
