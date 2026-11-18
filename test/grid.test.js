import "./helpers/tz.js"
import "./helpers/quiet.js"
import test from "node:test"
import assert from "node:assert/strict"
import {boardSnapshot} from "./helpers/board.js"
import diagnostics from "../js/diagnostics.js"
import {loadFixtures} from "./helpers/fakeSession.js"

// De vier mutaties uit de meting in docs/VERBETERPLAN.md §2.5 (R2, R5).
function mutate(rows) {
    rows[0].startTimeSlot = 14; rows[0].endTimeSlot = 15
    rows[1].groupsInDepartments = [99999999]
    rows[2].startTimeSlot = 6; rows[2].endTimeSlot = 3
    rows[3].startTimeSlot = 0; rows[3].endTimeSlot = 0
    return rows
}

test("afspraken met lesuren buiten het raster blijven binnen het raster", async () => {
    let fixtures = loadFixtures("2026-09-23")
    let cancelled = fixtures.data.appointments.filter(a => a.type === "lesson" && a.cancelled)
    let outBefore = diagnostics.outOfGrid
    let unknownBefore = diagnostics.unknownReferences

    let {ui, lines} = await boardSnapshot("2026-09-23", {
        intercept: (endpoint, options) => endpoint === "appointments" && String(options.cancelled) === "true"
            ? mutate(structuredClone(cancelled)).map(row => Object.fromEntries(options.fields.filter(f => f in row).map(f => [f, row[f]])))
            : undefined
    })

    for (const record of ui.collectChanges()) {
        assert.ok(record.period_start >= 1 && record.period_end <= 10 && record.period_start <= record.period_end,
            `${record.appointment.id}: ${record.period_start}-${record.period_end}`)
    }
    assert.ok(diagnostics.outOfGrid - outBefore >= 3)
    assert.ok(diagnostics.unknownReferences - unknownBefore >= 1)
    // de rest van het bord blijft zichtbaar: één afspraak met een onbekende groep valt weg
    assert.ok(lines.length >= 60)
})
