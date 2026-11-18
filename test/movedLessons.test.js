import "./helpers/tz.js"
import "./helpers/quiet.js"
import test from "node:test"
import assert from "node:assert/strict"
import {linkMovedLessons, slotText} from "../js/controllers/changes/movedLessons.js"
import {appointmentText} from "../js/views/changes/appointmentText.js"
import {boardSnapshot} from "./helpers/board.js"

let nextId = 1
function lesson(instance, from, to, extra = {}) {
    return {id: nextId++, appointmentInstance: instance, type: "lesson", startTimeSlot: from, endTimeSlot: to,
        valid: true, cancelled: false, ...extra}
}

test("oude versie op een ander uur krijgt movedTo", () => {
    let old = lesson(1, 7, 7, {valid: false})
    let moved = lesson(1, 4, 4)
    assert.equal(linkMovedLessons([old, moved]), 1)
    assert.deepEqual(old.movedTo, {startTimeSlot: 4, endTimeSlot: 4})
    assert.equal(moved.movedTo, undefined)
})

test("ander lokaal of andere docent (zelfde uur): geen verplaatsing", () => {
    let old = lesson(2, 3, 3, {valid: false})
    assert.equal(linkMovedLessons([old, lesson(2, 3, 3)]), 0)
    assert.equal(old.movedTo, undefined)
})

test("geldige versie raakt het oude uur nog (bv. ingekort): geen verplaatsing", () => {
    let old = lesson(3, 3, 4, {valid: false})
    assert.equal(linkMovedLessons([old, lesson(3, 4, 5)]), 0)
})

test("nieuwe versie vervalt, oude vervalt, of geen nieuwe versie vandaag: niets", () => {
    assert.equal(linkMovedLessons([lesson(4, 7, 7, {valid: false}), lesson(4, 2, 2, {cancelled: true})]), 0)
    assert.equal(linkMovedLessons([lesson(5, 7, 7, {valid: false, cancelled: true}), lesson(5, 2, 2)]), 0)
    assert.equal(linkMovedLessons([lesson(6, 7, 7, {valid: false})]), 0)
    assert.equal(linkMovedLessons([lesson(null, 7, 7, {valid: false}), lesson(null, 2, 2)]), 0)
})

test("vervallen versie op het oude uur: blijft 'vervalt', geen verplaatsing", () => {
    assert.equal(linkMovedLessons([lesson(7, 7, 7, {valid: false}), lesson(7, 7, 7, {cancelled: true}), lesson(7, 2, 2)]), 0)
})

test("opnieuw koppelen ruimt een oude movedTo op", () => {
    let old = lesson(8, 7, 7, {valid: false})
    linkMovedLessons([old, lesson(8, 4, 4)])
    linkMovedLessons([old, lesson(8, 7, 7)])
    assert.equal(old.movedTo, undefined)
})

test("tekst", () => {
    assert.equal(slotText({startTimeSlot: 4, endTimeSlot: 4}), "u4")
    assert.equal(slotText({startTimeSlot: 4, endTimeSlot: 5}), "u4-5")
    let group = {name: "hv1g", isMainGroup: true}
    let old = {type: "lesson", subjects: ["wi"], teachers: ["vos"], locations: ["a254"], valid: false, cancelled: false,
        movedTo: {startTimeSlot: 4, endTimeSlot: 4}}
    assert.equal(appointmentText(group, old), "hv1g wi vos verplaatst naar u4")
})

test("demodag 23-9-2026: hv1g wi vos van u7 naar u4", async () => {
    let {lines} = await boardSnapshot("2026-09-23")
    assert.deepEqual(lines.filter(l => l.includes("verplaatst")), ["1 | 7-7 | lesson moved | hv1g wi vos verplaatst naar u4"])
})
