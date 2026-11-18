import "./helpers/tz.js"
import "./helpers/quiet.js"
import test from "node:test"
import assert from "node:assert/strict"
import {buildBoard} from "./helpers/board.js"
import Absences from "../js/controllers/absences/absences.js"
import {matchSnapshot} from "./helpers/snapshot.js"

function describe(abs) {
    let when = ""
    if (abs.startSlot && abs.endSlot) when = abs.startSlot.timeSlotName.rank + "-" + abs.endSlot.timeSlotName.rank
    else if (abs.endSlot) when = "t/m " + abs.endSlot.timeSlotName.rank
    else if (abs.startSlot) when = "va " + abs.startSlot.timeSlotName.rank
    return abs.employee + (when ? " (" + when + ")" : "")
}

test("afwezigen van 23-9-2026 naar lesuren", async () => {
    let {connector} = await buildBoard("2026-09-23")
    let absences = new Absences(connector)
    assert.equal(await absences.loadAll(), true)
    let lines = Object.values(absences.absences).sort((a, b) => a.id - b.id).map(describe)
    // Huidig gedrag: per lesuur een losse regel voor krh (plan stap 1.1 voegt samen).
    matchSnapshot("absences-2026-09-23", lines)
    assert.equal(await absences.loadAll(), false, "tweede keer zonder wijziging")
})
