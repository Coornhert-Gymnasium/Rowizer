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

test("arraysEqual negeert volgorde", () => {
    assert.equal(arraysEqual(["b", "a"], ["a", "b"]), true)
    assert.equal(arraysEqual(["a"], ["a", "b"]), false)
})
