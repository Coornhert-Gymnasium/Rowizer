import "./helpers/tz.js"
import "./helpers/quiet.js"
import test from "node:test"
import assert from "node:assert/strict"
import {boardSnapshot, boardLines} from "./helpers/board.js"
import {matchSnapshot} from "./helpers/snapshot.js"
import {compareChanges} from "../js/views/changes/changesUiManager.js"

// test/snapshots/board-2026-09-23.txt is op 18-11-2026 regel voor regel vergeleken met wat de
// browser toont voor dezelfde dag (SHA-256 gelijk). Verandert dit bestand, dan verandert het bord.
test("bord van 23-9-2026 blijft gelijk", async () => {
    let {lines} = await boardSnapshot("2026-09-23")
    assert.equal(lines.length, 62)
    matchSnapshot("board-2026-09-23", lines)
})

test("opnieuw tekenen geeft dezelfde volgorde", async () => {
    let {connector, ui, lines} = await boardSnapshot("2026-09-23")
    assert.deepEqual(boardLines(connector, ui.collectChanges()), lines)
})

test("volgorde hangt niet af van de volgorde van binnenkomst", async () => {
    let {connector, ui, lines} = await boardSnapshot("2026-09-23")
    let records = ui.collectChanges()
    for (let i = 0; i < 5; i++) {
        let shuffled = [...records].sort(() => Math.random() - 0.5).sort(compareChanges)
        assert.deepEqual(boardLines(connector, shuffled), lines)
    }
})

test("opnieuw laden zonder wijzigingen meldt 'niet gewijzigd'", async () => {
    let {changes} = await boardSnapshot("2026-09-23")
    assert.equal(await changes.loadData(), false)
})

test("zonder samenvoegen van lesuren komen er meer losse items", async () => {
    let {lines} = await boardSnapshot("2026-09-23", {merge: false})
    assert.ok(lines.length >= 62)
})
