import "./helpers/tz.js"
import "./helpers/quiet.js"
import test from "node:test"
import assert from "node:assert/strict"
import {mergeAbsences, absenceText} from "../js/controllers/absences/mergeAbsences.js"
import {buildBoard} from "./helpers/board.js"
import Absences from "../js/controllers/absences/absences.js"

// Lesuren van de demodag (woensdag 23-9-2026), met een pauze tussen 3 en 4 en tussen 5 en 6.
const TIMES = [["08:00", "08:50"], ["08:50", "09:40"], ["09:40", "10:30"], ["10:50", "11:40"], ["11:40", "12:30"],
    ["12:55", "13:45"], ["13:45", "14:35"], ["14:50", "15:40"], ["15:40", "16:30"], ["16:30", "17:20"]]

function at(hhmm) {
    let [h, m] = hhmm.split(":").map(Number)
    return new Date(2026, 8, 23, h, m)
}
const SLOTS = TIMES.map(([start, end], i) => ({startDt: at(start), endDt: at(end), timeSlotName: {rank: i + 1}}))

// afwezig van het begin van lesuur `from` tot het einde van lesuur `to`
function abs(employee, from, to) {
    return {employee, start: at(TIMES[from - 1][0]).getTime()/1000, end: at(TIMES[to - 1][1]).getTime()/1000}
}
function between(employee, start, end) {
    return {employee, start: at(start).getTime()/1000, end: at(end).getTime()/1000}
}
const wholeDay = employee => ({employee, start: new Date(2026, 8, 23).getTime()/1000, end: new Date(2026, 8, 24).getTime()/1000})

function texts(absences, slots = SLOTS) {
    return mergeAbsences(absences, slots).map(absenceText)
}

test("losse uren achter elkaar worden één bereik", () => {
    assert.deepEqual(texts([abs("krh", 3, 3), abs("krh", 1, 1), abs("krh", 2, 2)]), ["krh (1-3)"])
})

test("aansluitend over een pauze heen is ook één bereik", () => {
    assert.deepEqual(texts([abs("krh", 3, 3), abs("krh", 4, 4)]), ["krh (3-4)"])
})

test("met een gat: twee bereiken", () => {
    assert.deepEqual(texts([abs("krh", 1, 3), abs("krh", 6, 8)]), ["krh (1-3, 6-8)"])
})

test("één lesuur", () => {
    assert.deepEqual(texts([abs("dro", 4, 4)]), ["dro (4)"])
})

test("hele dag of alle lesuren: alleen de naam", () => {
    assert.deepEqual(texts([wholeDay("bee")]), ["bee"])
    assert.deepEqual(texts([abs("krh", 1, 5), abs("krh", 6, 10)]), ["krh"])
    assert.deepEqual(texts([wholeDay("krh"), abs("krh", 4, 4)]), ["krh"])
})

test("overlappende meldingen", () => {
    assert.deepEqual(texts([abs("a", 2, 5), abs("a", 4, 7)]), ["a (2-7)"])
})

test("deel van een lesuur telt als dat lesuur", () => {
    assert.deepEqual(texts([between("a", "09:00", "09:20")]), ["a (2)"])
    assert.deepEqual(texts([between("a", "10:00", "11:00")]), ["a (3-4)"])
})

// gevonden bij de review van PR #4: deze kwamen als "(5-6)", "(1)" en de hele dag op het bord
test("geen enkel lesuur geraakt (pauze, voor of na school): niet op het bord", () => {
    assert.deepEqual(texts([between("tst", "12:30", "12:55")]), [])
    assert.deepEqual(texts([between("tst", "07:00", "07:30")]), [])
    assert.deepEqual(texts([between("tst", "17:30", "18:00")]), [])
    assert.deepEqual(texts([between("tst", "12:30", "12:55"), abs("tst", 2, 2)]), ["tst (2)"])
})

test("precies aansluitend telt niet als overlap", () => {
    // 08:00-08:50 is lesuur 1, niet ook lesuur 2 dat om 08:50 begint
    assert.deepEqual(texts([between("a", "08:00", "08:50")]), ["a (1)"])
})

test("alfabetisch op docent, zonder naam weggelaten", () => {
    assert.deepEqual(texts([abs("wro", 1, 1), wholeDay("bee"), {start: 0, end: 1}]), ["bee", "wro (1)"])
})

test("dag zonder lesuren: alleen namen", () => {
    assert.deepEqual(texts([abs("krh", 1, 1)], []), ["krh"])
})

test("demodag 23-9-2026: bee de hele dag, krh uur 1 t/m 8", async () => {
    let {connector} = await buildBoard()
    let absences = new Absences(connector)
    await absences.loadAll()
    assert.deepEqual(mergeAbsences(Object.values(absences.absences), connector.getTodayTimeSlots()).map(absenceText), ["bee", "krh (1-8)"])
})
