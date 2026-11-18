import "./helpers/tz.js"
import "./helpers/quiet.js"
import test from "node:test"
import assert from "node:assert/strict"
import DayRollover from "../js/dayRollover.js"
import {buildBoard} from "./helpers/board.js"
import {ZermeloNetworkError} from "../js/zermelo/utils/errors.js"

const MINUTE = 60*1000
const tick = () => new Promise(resolve => setImmediate(resolve))

function rollover(options = {}) {
    let state = {t: new Date(2026, 8, 23, 23, 58).getTime(), shown: new Date(2026, 8, 23), calls: []}
    let r = new DayRollover({
        currentDate: () => state.shown,
        onNewDay: async date => { state.calls.push(date); state.shown = date },
        now: () => state.t,
        random: options.random || (() => 0.5),
        fixedDate: options.fixedDate,
    })
    return {r, state}
}

test("zelfde dag: niets", () => {
    let {r, state} = rollover()
    assert.equal(r.check(), false)
    assert.equal(state.calls.length, 0)
})

test("nieuwe dag: wissel na een willekeurige wachttijd binnen 10 minuten", async () => {
    let {r, state} = rollover({random: () => 0.5})
    state.t = new Date(2026, 8, 24, 0, 0).getTime()
    assert.equal(r.check(), false, "nog niet: 5 minuten spreiding")
    assert.equal(r.pendingAt, state.t + 5*MINUTE)
    state.t += 4*MINUTE
    assert.equal(r.check(), false)
    state.t += MINUTE
    assert.equal(r.check(), true)
    await tick()
    assert.equal(state.calls.length, 1)
    assert.equal(state.calls[0].toDateString(), new Date(2026, 8, 24).toDateString())
    assert.equal(r.check(), false, "daarna niet nog eens")
})

test("vaste datum (URL-parameter): nooit wisselen", () => {
    let {r, state} = rollover({fixedDate: true})
    state.t = new Date(2026, 8, 25, 9, 0).getTime()
    assert.equal(r.check(), false)
    assert.equal(r.pendingAt, null)
})

test("mislukte wissel laat de controle niet vastlopen", async () => {
    let {r, state} = rollover({random: () => 0})
    r.onNewDay = async () => { throw new Error("down") }
    state.t = new Date(2026, 8, 24, 0, 1).getTime()
    assert.equal(r.check(), true)
    await tick()
    await tick()
    assert.equal(r.check(), true, "datum nog niet gewisseld: opnieuw")
})

test("switchDay laadt altijd een nieuwe momentopname; tot dan is isCurrent false", async () => {
    let {connector} = await buildBoard()
    assert.equal(connector.isCurrent, true)
    let old = connector.snapshot
    let loading = connector.switchDay(new Date(2026, 8, 24))
    assert.equal(connector.isCurrent, false)
    assert.equal(connector.snapshot, old, "oude momentopname blijft beschikbaar")
    await loading
    assert.equal(connector.isCurrent, true)
    assert.notEqual(connector.snapshot, old)
})

test("switchDay met Zermelo onbereikbaar: isCurrent blijft false, oude gegevens blijven", async () => {
    let down = false
    let {connector} = await buildBoard("2026-09-23", {
        intercept: () => down ? new ZermeloNetworkError("down", {kind: "network"}) : undefined
    })
    let old = connector.snapshot
    down = true
    await assert.rejects(connector.switchDay(new Date(2026, 8, 24)))
    assert.equal(connector.isCurrent, false)
    assert.equal(connector.snapshot, old)
    down = false
    await connector.reload()
    assert.equal(connector.isCurrent, true)
})

test("requestRefresh: hoogstens eens per 10 minuten", async () => {
    let now = new Date(2026, 8, 23, 9, 0).getTime()
    let {connector, session} = await buildBoard("2026-09-23", {now: () => now})
    let count = () => session.requests.filter(r => r.endpoint === "branches").length
    let before = count()
    await connector.requestRefresh()
    assert.equal(count(), before, "net geladen: niet opnieuw")
    now += 11*MINUTE
    await connector.requestRefresh()
    assert.equal(count(), before + 1)
    await connector.requestRefresh()
    assert.equal(count(), before + 1)
})

test("refreshIfStale: na een uur", async () => {
    let now = new Date(2026, 8, 23, 9, 0).getTime()
    let {connector, session} = await buildBoard("2026-09-23", {now: () => now})
    let count = () => session.requests.filter(r => r.endpoint === "branches").length
    let before = count()
    now += 30*MINUTE
    await connector.refreshIfStale()
    assert.equal(count(), before)
    now += 31*MINUTE
    await connector.refreshIfStale()
    assert.equal(count(), before + 1)
})
