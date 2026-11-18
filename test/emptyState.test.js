import "./helpers/tz.js"
import "./helpers/quiet.js"
import test from "node:test"
import assert from "node:assert/strict"
import {emptyState} from "../js/views/changes/changesUiManager.js"
import {buildBoard} from "./helpers/board.js"

test("lege toestand", () => {
    assert.equal(emptyState(0, 0), "no-lessons")
    assert.equal(emptyState(0, 3), "no-lessons", "geen lesuren: ook niet tonen wat er toch is")
    assert.equal(emptyState(10, 0), "no-changes")
    assert.equal(emptyState(10, 62), null)
})

test("zaterdag 26-9-2026: geen lessen", async () => {
    let {connector} = await buildBoard()
    await connector.setDate(new Date(2026, 8, 26))
    assert.equal(emptyState(connector.getTodayTimeSlots().length, 0), "no-lessons")
})
