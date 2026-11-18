import "./helpers/tz.js"
import "./helpers/quiet.js"
import test from "node:test"
import assert from "node:assert/strict"
import {measureClockOffset, clockNote} from "../js/clockCheck.js"
import {setClockOffset, clockOffset, now, today, CLOCK_THRESHOLD} from "../js/appTime.js"
import DayRollover from "../js/dayRollover.js"

function fetchWithDate(date) {
    let calls = []
    let fn = async (url, options) => {
        calls.push({url, options})
        return {headers: new Headers(date ? {Date: date} : {})}
    }
    fn.calls = calls
    return fn
}

test("afwijking uit de Date-header, HEAD zonder query en zonder cookies", async () => {
    let local = Date.UTC(2026, 8, 23, 6, 0, 0)
    let fetch = fetchWithDate(new Date(local + 10*60*1000).toUTCString())
    let offset = await measureClockOffset({url: "/Rowizer/", fetch, now: () => local})
    assert.equal(offset, 10*60*1000 + 500)
    assert.deepEqual(fetch.calls[0], {url: "/Rowizer/", options: {method: "HEAD", cache: "no-store", credentials: "omit"}})
})

test("geen of onleesbare Date-header: null", async () => {
    assert.equal(await measureClockOffset({url: "/", fetch: fetchWithDate(null)}), null)
    assert.equal(await measureClockOffset({url: "/", fetch: fetchWithDate("gisteren")}), null)
})

test("kleine afwijking telt niet, grote wel", () => {
    assert.equal(setClockOffset(CLOCK_THRESHOLD - 1000), 0)
    assert.equal(setClockOffset(-30*60*1000), -30*60*1000)
    assert.equal(clockOffset(), -30*60*1000)
    assert.ok(Math.abs(now() - (Date.now() - 30*60*1000)) < 100)
    setClockOffset(0)
})

test("korte code", () => {
    assert.equal(clockNote(0), null)
    assert.equal(clockNote(12*60*1000), "klok +12 min")
    assert.equal(clockNote(-185*60*1000), "klok -185 min")
})

test("Pi start met de klok van gisteravond: de dagwissel corrigeert de dag", async () => {
    // lokale klok staat op 22-9 23:30, de server zegt 23-9 07:45
    let local = new Date(2026, 8, 22, 23, 30).getTime()
    let server = new Date(2026, 8, 23, 7, 45).getTime()
    let shown = new Date(2026, 8, 22)
    let switched = []
    let rollover = new DayRollover({
        currentDate: () => shown,
        onNewDay: async date => { switched.push(date); shown = date },
        now: () => local + (server - local),
        random: () => 0,
    })
    assert.equal(rollover.check(), true)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(switched[0].toDateString(), new Date(2026, 8, 23).toDateString())
})

test("today() gebruikt de gecorrigeerde tijd", () => {
    setClockOffset(24*60*60*1000)
    let tomorrow = new Date()
    tomorrow.setHours(0, 0, 0, 0)
    tomorrow.setDate(tomorrow.getDate() + 1)
    assert.equal(today().toDateString(), tomorrow.toDateString())
    setClockOffset(0)
})
