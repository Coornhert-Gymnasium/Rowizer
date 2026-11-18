import "./helpers/tz.js"
import "./helpers/quiet.js"
import test from "node:test"
import assert from "node:assert/strict"
import {parseWindow, inWindow, isResting, windowStartText} from "../js/activeWindow.js"
import Scheduler from "../js/scheduler.js"
import {computeStatus} from "../js/status.js"

const at = (h, m = 0, day = 23) => new Date(2026, 8, day, h, m).getTime()

test("venster lezen", () => {
    assert.deepEqual(parseWindow(null), {start: 390, end: 1080})
    assert.deepEqual(parseWindow(""), {start: 390, end: 1080})
    assert.deepEqual(parseWindow("7:00-17:30"), {start: 420, end: 1050})
    assert.deepEqual(parseWindow("00:00-24:00"), {start: 0, end: 1440})
    assert.equal(parseWindow("off"), null)
    assert.equal(windowStartText(parseWindow("7:05-17:30")), "07:05")
})

test("ongeldig venster: standaard", () => {
    for (const text of ["18:00-06:30", "6-18", "06:30-25:00", "06:61-18:00", "onzin"]) {
        assert.deepEqual(parseWindow(text), {start: 390, end: 1080}, text)
    }
})

test("binnen en buiten het venster", () => {
    let w = parseWindow()
    assert.equal(inWindow(w, at(6, 29)), false)
    assert.equal(inWindow(w, at(6, 30)), true)
    assert.equal(inWindow(w, at(17, 59)), true)
    assert.equal(inWindow(w, at(18, 0)), false)
    assert.equal(inWindow(null, at(3)), true)
})

test("rust: buiten het venster of zonder lessen; zonder basisgegevens nooit", () => {
    let window = parseWindow()
    assert.equal(isResting({window, now: at(12), isReady: true, lessons: 10}), false)
    assert.equal(isResting({window, now: at(20), isReady: true, lessons: 10}), true)
    assert.equal(isResting({window, now: at(12, 0, 26), isReady: true, lessons: 0}), true, "zaterdag")
    assert.equal(isResting({window, now: at(20), isReady: false, lessons: 0}), false)
    assert.equal(isResting({window: null, now: at(20), isReady: true, lessons: 0}), false, "active=off")
})

function fakeTimers() {
    let state = {t: 1000, timers: new Map(), next: 1}
    state.setTimeout = (fn, ms) => { let id = state.next++; state.timers.set(id, {fn, ms}); return id }
    state.clearTimeout = id => state.timers.delete(id)
    state.fireAll = async () => {
        let due = [...state.timers.values()]
        state.timers.clear()
        due.forEach(timer => timer.fn())
        await new Promise(resolve => setImmediate(resolve))
    }
    return state
}

test("planner: in rust geen geplande rondes, wel een hartslag; runNow loopt altijd", async () => {
    let timers = fakeTimers()
    let resting = false
    let s = new Scheduler({now: () => timers.t, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
        random: () => 0, isResting: () => resting})
    let runs = {changes: 0, token: 0}
    s.add("changes", async () => { runs.changes++; return true }, {rest: true})
    s.add("token", async () => { runs.token++; return true })
    s.start()
    await timers.fireAll()
    assert.deepEqual(runs, {changes: 1, token: 1})

    resting = true
    timers.t = 5000
    await timers.fireAll()
    assert.deepEqual(runs, {changes: 1, token: 2}, "changes rust, token niet")
    assert.equal(s.heartbeat, 5000)
    assert.equal(timers.timers.size, 2, "blijft gepland")

    assert.equal(s.runAfterEvent(), true)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(runs.changes, 1, "scherm weer aan in rusttijd: niet verversen")

    s.runNow()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(runs.changes, 2, "dagwissel of begin van het venster")
})

test("planner: nooit geslaagd of laatste ronde mislukt: ook in rust proberen", async () => {
    let timers = fakeTimers()
    let s = new Scheduler({now: () => timers.t, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
        random: () => 0, isResting: () => true})
    let ok = false, runs = 0
    s.add("changes", async () => { runs++; return ok }, {rest: true})
    s.start()
    await timers.fireAll()
    await timers.fireAll()
    assert.equal(runs, 2)
    ok = true
    await timers.fireAll()
    await timers.fireAll()
    assert.equal(runs, 3, "na de eerste geslaagde ronde rust")
})

test("status in rust: geen waarschuwing, afwezigen blijven, code 'rust'", () => {
    let now = at(22)
    let status = computeStatus({
        now, isReady: true, health: {state: "ok"},
        changes: {addedAt: at(7), lastSuccess: at(17, 58), lastError: null},
        absences: {lastSuccess: at(17, 58)},
        resting: true,
    })
    assert.equal(status.bar, null)
    assert.equal(status.absences, "fresh")
    assert.equal(status.code, "rust")
    assert.equal(status.updated, "bijgewerkt 17:58")
})
