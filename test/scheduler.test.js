import "./helpers/tz.js"
import "./helpers/quiet.js"
import test from "node:test"
import assert from "node:assert/strict"
import Scheduler from "../js/scheduler.js"

// Nep-timers: we bewaren de geplande taken en laten ze met de hand lopen.
function fakeTimers() {
    let state = {t: 1000, timers: new Map(), next: 1}
    state.setTimeout = (fn, ms) => { let id = state.next++; state.timers.set(id, {fn, at: state.t + ms, ms}); return id }
    state.clearTimeout = id => state.timers.delete(id)
    state.now = () => state.t
    state.delays = () => [...state.timers.values()].map(t => t.ms)
    state.fireAll = async () => {
        let due = [...state.timers.entries()]
        state.timers.clear()
        for (const [, timer] of due) {
            state.t = Math.max(state.t, timer.at)
            timer.fn()
        }
        await new Promise(resolve => setImmediate(resolve))
    }
    return state
}

function scheduler(timers, options = {}) {
    return new Scheduler({now: timers.now, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
        random: () => 0.5, ...options})
}

test("taken starten met een willekeurige vertraging tot 20 s", () => {
    let timers = fakeTimers()
    let s = scheduler(timers)
    s.add("changes", async () => true)
    s.add("absences", async () => true)
    s.start()
    assert.deepEqual(timers.delays(), [10000, 10000])
})

test("geslaagd: volgende ronde na het interval, mislukt: na het retry-interval", async () => {
    let timers = fakeTimers()
    let s = scheduler(timers)
    let ok = true
    s.add("changes", async () => ok, {interval: 300000, retryInterval: 60000})
    s.start()
    await timers.fireAll()
    assert.deepEqual(timers.delays(), [300000])
    assert.equal(s.task("changes").lastSuccess, timers.t)

    ok = false
    await timers.fireAll()
    assert.deepEqual(timers.delays(), [60000])
    assert.equal(s.task("changes").failures, 1)
})

test("een fout in de taak telt als mislukt en wordt bewaard", async () => {
    let timers = fakeTimers()
    let s = scheduler(timers)
    s.add("changes", async () => { throw Object.assign(new Error("down"), {kind: "network"}) })
    s.start()
    await timers.fireAll()
    let task = s.task("changes")
    assert.equal(task.lastError.kind, "network")
    assert.equal(task.lastSuccess, null)
    assert.equal(s.heartbeat, timers.t, "ook een mislukte ronde geeft een hartslag")
})

test("runNow start direct, maar nooit twee rondes van dezelfde taak tegelijk", async () => {
    let timers = fakeTimers()
    let s = scheduler(timers)
    let running = 0, maxRunning = 0, release
    s.add("changes", () => new Promise(resolve => {
        running++
        maxRunning = Math.max(maxRunning, running)
        release = () => { running--; resolve(true) }
    }))
    s.runNow()
    s.runNow()
    s.runNow()
    await new Promise(resolve => setImmediate(resolve))
    release()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(maxRunning, 1)
})

test("onRound wordt na elke ronde aangeroepen", async () => {
    let timers = fakeTimers()
    let rounds = []
    let s = scheduler(timers, {onRound: task => rounds.push(task.name)})
    s.add("changes", async () => true)
    s.runNow()
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(rounds, ["changes"])
})
