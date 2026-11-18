import "./helpers/tz.js"
import "./helpers/quiet.js"
import test from "node:test"
import assert from "node:assert/strict"
import {boardColumns, columnOf} from "../js/views/changes/changesUiManager.js"
import {boardSnapshot} from "./helpers/board.js"

const slots = ranks => ranks.map(rank => ({timeSlotName: {rank, name: "u" + String(rank).padStart(2, "0")}}))

test("kolommen: lesuren van vandaag, lege kolommen aan het eind weg", () => {
    let cols = boardColumns(slots([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), {}, 9)
    assert.deepEqual(cols.map(c => c.name), ["u01", "u02", "u03", "u04", "u05", "u06", "u07", "u08", "u09"])
})

test("kolommen: lege kolommen in het midden blijven", () => {
    let cols = boardColumns(slots([1, 2, 3, 4, 5]), {}, 5)
    assert.equal(cols.length, 5)
})

test("kolommen: zonder items alle lesuren van vandaag", () => {
    assert.equal(boardColumns(slots([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), {}, null).length, 10)
})

test("kolommen: zonder lesuren van vandaag de lesuurnamen van het jaar", () => {
    let names = {11: {rank: 2, name: "u02"}, 10: {rank: 1, name: "u01"}}
    assert.deepEqual(boardColumns([], names, null).map(c => c.name), ["u01", "u02"])
})

test("nulde uur: rangnummer 0 is kolom 1", () => {
    let cols = boardColumns(slots([0, 1, 2, 3]), {}, null)
    assert.deepEqual([0, 1, 2, 3].map(rank => columnOf(cols, rank)), [1, 2, 3, 4])
})

test("gat in de rangnummers (geen 5e uur)", () => {
    let cols = boardColumns(slots([1, 2, 3, 4, 6, 7]), {}, null)
    assert.deepEqual([4, 6, 7].map(rank => columnOf(cols, rank)), [4, 5, 6])
    assert.equal(columnOf(cols, 5), 4, "onbekend lesuur: de kolom ervoor")
})

test("lesuur buiten het raster: binnen de kolommen", () => {
    let cols = boardColumns(slots([1, 2, 3]), {}, null)
    assert.equal(columnOf(cols, 0), 1)
    assert.equal(columnOf(cols, 14), 3)
})

test("demodag: 9 kolommen (u10 is leeg), items op hun lesuur", async () => {
    let {connector, ui} = await boardSnapshot()
    let changes = ui.collectChanges()
    let cols = boardColumns(connector.getTodayTimeSlots(), connector.timeslots, Math.max(...changes.map(c => c.period_end)))
    assert.equal(cols.length, 9)
    assert.ok(changes.every(c => columnOf(cols, c.period_start) === c.period_start), "rangnummers 1..9 zijn kolommen 1..9")
})
