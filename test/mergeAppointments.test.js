import "./helpers/tz.js"
import test from "node:test"
import assert from "node:assert/strict"
import {mergeSubsequentAppointments, arraysEqual} from "../js/zermelo/utils/mergeAppointments.js"

function lesson(id, start, end, overrides = {}) {
    return {
        id, startTimeSlot: start, endTimeSlot: end, courses: [], subjects: ["fa"], groupsInDepartments: [1],
        teachers: ["cir"], appointmentLastModified: 100, valid: true, cancelled: false, ...overrides
    }
}

test("aaneengesloten uren worden één afspraak", () => {
    let result = mergeSubsequentAppointments([lesson(1, 4, 4), lesson(2, 5, 5), lesson(3, 6, 6)])
    assert.equal(result.length, 1)
    assert.equal(result[0].startTimeSlot, 4)
    assert.equal(result[0].endTimeSlot, 6)
    assert.deepEqual(result[0].combinedWith.map(a => a.id), [2, 3])
})

test("volgorde van binnenkomst maakt niet uit", () => {
    let result = mergeSubsequentAppointments([lesson(3, 6, 6), lesson(1, 4, 4), lesson(2, 5, 5)])
    assert.equal(result.length, 1)
    assert.equal(result[0].startTimeSlot, 4)
    assert.equal(result[0].endTimeSlot, 6)
})

test("een gat tussen de uren: niet samenvoegen", () => {
    let result = mergeSubsequentAppointments([lesson(1, 2, 2), lesson(2, 4, 4)])
    assert.equal(result.length, 2)
})

test("andere docent of uitval: niet samenvoegen", () => {
    assert.equal(mergeSubsequentAppointments([lesson(1, 2, 2), lesson(2, 3, 3, {teachers: ["dro"]})]).length, 2)
    assert.equal(mergeSubsequentAppointments([lesson(1, 2, 2), lesson(2, 3, 3, {cancelled: true})]).length, 2)
})

test("arraysEqual negeert volgorde en verandert de lijsten niet", () => {
    let a = ["men04", "huu"]
    assert.equal(arraysEqual(a, ["huu", "men04"]), true)
    assert.deepEqual(a, ["men04", "huu"])
    assert.equal(arraysEqual(["a"], ["a", "b"]), false)
})

// review van de PR-reeks: movedTo (plan stap 3.3) telt mee bij het samenvoegen
test("oude versies met en zonder verplaatsing worden niet samengevoegd", async () => {
    let {mergeSubsequentAppointments} = await import("../js/zermelo/utils/mergeAppointments.js")
    let base = {courses: ["wi"], subjects: ["wi"], groupsInDepartments: [1], teachers: ["vos"], appointmentLastModified: 5, valid: false, cancelled: false}
    let onlyRoom = {...base, id: 1, startTimeSlot: 6, endTimeSlot: 6}
    let moved = {...base, id: 2, startTimeSlot: 7, endTimeSlot: 7, movedTo: {startTimeSlot: 4, endTimeSlot: 4}}
    let merged = mergeSubsequentAppointments([onlyRoom, moved])
    assert.equal(merged.length, 2)
    assert.deepEqual(merged.find(a => a.id === 2).movedTo, {startTimeSlot: 4, endTimeSlot: 4})

    // gelijke movedTo (zelfde verplaatsing, oude stijl in losse uren): wel samen
    let a = {...base, id: 3, startTimeSlot: 7, endTimeSlot: 7, movedTo: {startTimeSlot: 4, endTimeSlot: 5}}
    let b = {...base, id: 4, startTimeSlot: 8, endTimeSlot: 8, movedTo: {startTimeSlot: 4, endTimeSlot: 5}}
    assert.equal(mergeSubsequentAppointments([a, b]).length, 1)
})
