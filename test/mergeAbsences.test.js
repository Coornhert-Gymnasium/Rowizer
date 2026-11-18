import "./helpers/tz.js"
import "./helpers/quiet.js"
import test from "node:test"
import assert from "node:assert/strict"
import {mergeAbsences, absenceText} from "../js/controllers/absences/mergeAbsences.js"
import {buildBoard} from "./helpers/board.js"
import Absences from "../js/controllers/absences/absences.js"

const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const slot = rank => ({timeSlotName: {rank}})
const abs = (employee, start, end) => ({employee, startSlot: start && slot(start), endSlot: end && slot(end)})

function texts(absences, ranks = RANKS) {
    return mergeAbsences(absences, ranks).map(absenceText)
}

test("losse uren achter elkaar worden één bereik", () => {
    assert.deepEqual(texts([abs("krh", 3, 3), abs("krh", 1, 1), abs("krh", 2, 2)]), ["krh (1-3)"])
})

test("met een gat: twee bereiken", () => {
    assert.deepEqual(texts([abs("krh", 1, 3), abs("krh", 6, 8)]), ["krh (1-3, 6-8)"])
})

test("één lesuur", () => {
    assert.deepEqual(texts([abs("dro", 4, 4)]), ["dro (4)"])
})

test("hele lesdag: alleen de naam", () => {
    assert.deepEqual(texts([abs("bee")]), ["bee"])
    assert.deepEqual(texts([abs("krh", null, 5), abs("krh", 6, null)]), ["krh"])
})

test("vanaf of tot en met", () => {
    assert.deepEqual(texts([abs("a", 6, null)]), ["a (6-10)"])
    assert.deepEqual(texts([abs("a", null, 2)]), ["a (1-2)"])
})

test("hele dag plus een los uur: hele dag", () => {
    assert.deepEqual(texts([abs("krh"), abs("krh", 4, 4)]), ["krh"])
})

test("overlappende meldingen", () => {
    assert.deepEqual(texts([abs("a", 2, 5), abs("a", 4, 7)]), ["a (2-7)"])
})

test("alfabetisch op docent, zonder naam weggelaten", () => {
    assert.deepEqual(texts([abs("wro", 1, 1), abs("bee"), {startSlot: slot(1)}]), ["bee", "wro (1)"])
})

test("dag zonder lesuren: alleen namen", () => {
    assert.deepEqual(texts([abs("krh", 1, 1)], []), ["krh"])
})

test("rangnummers met een gat (bv. geen 5e uur)", () => {
    assert.deepEqual(texts([abs("a", 4, 4), abs("a", 6, 6)], [1, 2, 3, 4, 6, 7]), ["a (4-6)"])
})

test("demodag 23-9-2026: bee de hele dag, krh uur 1 t/m 8", async () => {
    let {connector} = await buildBoard()
    let absences = new Absences(connector)
    await absences.loadAll()
    let ranks = connector.getTodayTimeSlots().map(s => s.timeSlotName.rank)
    assert.deepEqual(mergeAbsences(Object.values(absences.absences), ranks).map(absenceText), ["bee", "krh (1-8)"])
})
