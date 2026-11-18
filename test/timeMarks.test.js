import "./helpers/tz.js"
import "./helpers/quiet.js"
import test from "node:test"
import assert from "node:assert/strict"
import {timeMarks} from "../js/views/changes/changesUiManager.js"
import {buildBoard} from "./helpers/board.js"

const at = (h, m) => new Date(2026, 8, 23, h, m).getTime()

test("lopend lesuur en voorbije lesuren op de demodag", async () => {
    let {connector} = await buildBoard()
    let slots = connector.getTodayTimeSlots()
    let marks = timeMarks(slots, at(10, 0))   // 3e uur: 09:40-10:30
    assert.equal(marks.current, 3)
    assert.equal(marks.isPast(2), true)
    assert.equal(marks.isPast(3), false)
    assert.equal(marks.isPast(9), false)
})

test("in de pauze: geen lopend lesuur", async () => {
    let {connector} = await buildBoard()
    let marks = timeMarks(connector.getTodayTimeSlots(), at(10, 40))   // pauze 10:30-10:50
    assert.equal(marks.current, null)
    assert.equal(marks.isPast(3), true)
    assert.equal(marks.isPast(4), false)
})

test("voor en na schooltijd", async () => {
    let {connector} = await buildBoard()
    let slots = connector.getTodayTimeSlots()
    assert.equal(timeMarks(slots, at(7, 0)).current, null)
    assert.equal(timeMarks(slots, at(7, 0)).isPast(1), false)
    assert.equal(timeMarks(slots, at(18, 0)).isPast(10), true)
})

test("einde van een lesuur telt als voorbij, begin als lopend", async () => {
    let {connector} = await buildBoard()
    let slots = connector.getTodayTimeSlots()
    let marks = timeMarks(slots, at(8, 50))
    assert.equal(marks.current, 2)
    assert.equal(marks.isPast(1), true)
})

test("geen lesuren: niets", () => {
    let marks = timeMarks([], at(10, 0))
    assert.equal(marks.current, null)
    assert.equal(marks.isPast(5), false)
})
