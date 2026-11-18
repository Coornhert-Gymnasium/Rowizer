import "./helpers/tz.js"
import "./helpers/quiet.js"
import test from "node:test"
import assert from "node:assert/strict"
import {buildBoard} from "./helpers/board.js"
import {isResting, parseWindow} from "../js/activeWindow.js"
import {ZermeloAuthorizationError} from "../js/zermelo/utils/errors.js"

test("demodag 23-9-2026 is geen vakantie", async () => {
    let {connector} = await buildBoard()
    assert.equal(connector.holiday, null)
    assert.equal(connector.snapshot.holidays.length, 10)
})

test("herfstvakantie: eerste en laatste dag tellen mee", async () => {
    let {connector} = await buildBoard()
    for (const [day, expected] of [[16, null], [17, "Herfstvakantie"], [21, "Herfstvakantie"], [25, "Herfstvakantie"], [26, null]]) {
        await connector.setDate(new Date(2026, 9, day))
        assert.equal(connector.holiday, expected, "oktober " + day)
    }
})

test("vakantie: het bord toont de naam en haalt geen wijzigingen op", async () => {
    let {connector, ui, session} = await buildBoard()
    await connector.setDate(new Date(2026, 9, 21))
    let messages = []
    ui.showMessage = text => messages.push(text)
    let before = session.requests.filter(r => r.endpoint === "appointments").length
    assert.equal(await ui.refreshTable(), true)
    assert.deepEqual(messages.slice(-1), ["Vandaag geen lessen – Herfstvakantie"])
    assert.equal(session.requests.filter(r => r.endpoint === "appointments").length, before)
})

test("geen recht op vakanties: basisgegevens laden gewoon", async () => {
    let {connector} = await buildBoard("2026-09-23", {
        intercept: e => e === "holidays" ? new ZermeloAuthorizationError("holidays: 403", {kind: "permission", status: 403, endpoint: "holidays"}) : undefined,
    })
    assert.equal(connector.isReady, true)
    assert.equal(connector.holiday, null)
})

test("vakantie: rusten, ook binnen het venster en met een dagrooster", () => {
    let now = new Date(2026, 9, 21, 10).getTime()
    assert.equal(isResting({window: parseWindow(), now, isReady: true, lessons: 10, holiday: "Herfstvakantie"}), true)
    assert.equal(isResting({window: parseWindow(), now, isReady: true, lessons: 10, holiday: null}), false)
})
