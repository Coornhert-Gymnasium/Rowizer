import "./helpers/tz.js"
import "./helpers/quiet.js"
import test from "node:test"
import assert from "node:assert/strict"
import {emptyState} from "../js/views/changes/changesUiManager.js"
import {buildBoard} from "./helpers/board.js"

test("lege toestand", () => {
    assert.equal(emptyState(0, 0), "no-lessons")
    assert.equal(emptyState(0, 3), null, "geen lesuren maar wel items: items tonen")
    assert.equal(emptyState(10, 0), "no-changes")
    assert.equal(emptyState(10, 62), null)
})

test("lesdag zonder weekrooster maar met wijzigingen: wijzigingen blijven zichtbaar", async () => {
    let {connector, changes, ui} = await buildBoard("2026-09-23", {intercept: e => e === "realizedweektimetables" ? [] : undefined})
    await changes.loadData()
    let items = ui.collectChanges().length
    assert.equal(connector.getTodayTimeSlots().length, 0)
    assert.equal(items, 62)
    assert.equal(emptyState(0, items), null)
})

test("zaterdag 26-9-2026: geen lessen", async () => {
    let {connector} = await buildBoard()
    await connector.setDate(new Date(2026, 8, 26))
    assert.equal(emptyState(connector.getTodayTimeSlots().length, 0), "no-lessons")
})
