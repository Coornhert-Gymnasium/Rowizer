import "./helpers/tz.js"
import "./helpers/quiet.js"
import test from "node:test"
import assert from "node:assert/strict"
import {storageWorks, saveBoard, loadBoard} from "../js/boardCache.js"
import {computeStatus} from "../js/status.js"

function storage() {
    let data = new Map()
    return {
        getItem: k => data.has(k) ? data.get(k) : null,
        setItem: (k, v) => data.set(k, String(v)),
        removeItem: k => data.delete(k),
        data,
    }
}

const DAY = new Date(2026, 8, 23).toDateString()
const entry = {day: DAY, scope: "j9qeq|a", savedAt: new Date(2026, 8, 23, 9, 5).getTime(), board: "<div>bord</div>", absences: "<div class=\"absence\">bee</div>"}

test("opslag testen met schrijven en teruglezen", () => {
    assert.equal(storageWorks(storage()), true)
    assert.equal(storageWorks({setItem: () => { throw new Error("vol") }}), false)
    assert.equal(storageWorks({setItem: () => {}, getItem: () => null, removeItem: () => {}}), false)
})

test("bewaren en terugkrijgen voor dezelfde dag en scope", () => {
    let s = storage()
    assert.equal(saveBoard(s, entry), true)
    assert.deepEqual(loadBoard(s, {day: DAY, scope: "j9qeq|a"}), {savedAt: entry.savedAt, board: entry.board, absences: entry.absences})
})

test("andere dag, andere portal of vestiging, kapotte gegevens: niets", () => {
    let s = storage()
    saveBoard(s, entry)
    assert.equal(loadBoard(s, {day: new Date(2026, 8, 24).toDateString(), scope: "j9qeq|a"}), null)
    assert.equal(loadBoard(s, {day: DAY, scope: "j9qeq|b"}), null)
    s.setItem("rowizerBoard", "{kapot")
    assert.equal(loadBoard(s, {day: DAY, scope: "j9qeq|a"}), null)
    s.setItem("rowizerBoard", JSON.stringify({...entry, version: 1, board: 5}))
    assert.equal(loadBoard(s, {day: DAY, scope: "j9qeq|a"}), null)
})

test("nooit het token", () => {
    let s = storage()
    saveBoard(s, entry)
    assert.ok(![...s.data.values()].some(v => v.includes("token")))
})

test("vol: bewaren mislukt zonder fout", () => {
    assert.equal(saveBoard({setItem: () => { throw new Error("QuotaExceededError") }}, entry), false)
})

test("status: bewaarde stand en geen Zermelo bij het opstarten: rode balk met de tijd, geen melding", () => {
    let status = computeStatus({
        now: entry.savedAt + 3*60*60*1000, isReady: false,
        loadError: {kind: "network", code: "network"}, restoredAt: entry.savedAt,
    })
    assert.equal(status.boardMessage, null)
    assert.deepEqual(status.bar, {level: "error", text: "Geen verbinding met Zermelo – stand van 09:05"})
})

test("status: basisgegevens wel, wijzigingen nog nooit gelukt: meteen rode balk met de bewaarde tijd", () => {
    let now = entry.savedAt + 60*60*1000
    let status = computeStatus({
        now, isReady: true, health: {state: "down", lastError: {kind: "server", code: "server 500"}},
        changes: {addedAt: now - 60*1000, lastSuccess: null, lastError: {kind: "server"}},
        restoredAt: entry.savedAt,
    })
    assert.equal(status.bar.level, "error")
    assert.match(status.bar.text, /stand van 09:05/)
})

test("status: na een geslaagde ronde telt de bewaarde stand niet meer", () => {
    let now = entry.savedAt + 60*60*1000
    let status = computeStatus({
        now, isReady: true, health: {state: "ok"},
        changes: {addedAt: now - 60*1000, lastSuccess: now - 30*1000, lastError: null},
        restoredAt: entry.savedAt,
    })
    assert.equal(status.bar, null)
})
