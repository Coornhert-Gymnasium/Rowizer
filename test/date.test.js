import "./helpers/tz.js"
import test from "node:test"
import assert from "node:assert/strict"
import "../js/zermelo/utils/date.js"

test("weeknummer rond de jaarwisseling", () => {
    assert.equal(new Date(2024, 11, 30).getYearWeek(), "202501")
    assert.equal(new Date(2027, 0, 1).getYearWeek(), "202653")
    assert.equal(new Date(2026, 8, 23).getYearWeek(), "202639")
    assert.equal(new Date(2026, 0, 5).getPaddedWeekNumber(), "02")
})

test("schooljaar wisselt op 1 augustus", () => {
    assert.equal(new Date(2026, 6, 31).getSchoolYear(), 2025)
    assert.equal(new Date(2026, 7, 1).getSchoolYear(), 2026)
    assert.equal(new Date(2027, 0, 15).getSchoolYear(), 2026)
})

test("begin en einde van de dag in lokale tijd", () => {
    let d = new Date(2026, 8, 23, 14, 30)
    assert.equal(new Date(d.getStartOfDayTime()).toString(), new Date(2026, 8, 23, 0, 0, 0).toString())
    assert.equal(new Date(d.getEndOfDayTime()).getHours(), 23)
})

test("weekdag", () => {
    assert.equal(new Date(2026, 8, 23).isWeekDay(), true)  // woensdag
    assert.equal(new Date(2026, 8, 26).isWeekDay(), false) // zaterdag
    assert.equal(new Date(2026, 8, 27).isWeekDay(), false) // zondag
})

test("tijdzone van de tests staat op Amsterdam", () => {
    // 23-9-2026 00:00 lokaal is 22-9 22:00 UTC (zomertijd)
    assert.equal(new Date(2026, 8, 23).getTime() / 1000, 1790114400)
})
