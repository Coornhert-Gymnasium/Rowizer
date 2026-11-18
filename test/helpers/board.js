// Draait de hele keten (API -> connector -> controller -> view-logica) op fixtures, zonder browser.
import "./tz.js"
import {ZermeloApi} from "../../js/zermelo/zermelo.js"
import ZermeloConnector from "../../js/connectors/zermeloConnector.js"
import {Changes} from "../../js/controllers/changes/changes.js"
import {ChangesUiManager} from "../../js/views/changes/changesUiManager.js"
import FakeSession, {loadFixtures} from "./fakeSession.js"

/**
 * @param name map in test/fixtures
 * @param options.intercept zie FakeSession
 * @param options.merge merge_multiple_hour_span
 */
export async function buildBoard(name = "2026-09-23", options = {}) {
    let fixtures = loadFixtures(name)
    let session = new FakeSession(fixtures, {intercept: options.intercept})
    let api = new ZermeloApi({portal: fixtures.meta.portal, token: "test", session})
    let connector = new ZermeloConnector(api, fixtures.meta.date, {
        branch: fixtures.meta.branch,
        ignore_departments: options.ignoreDepartments || [],
        now: options.now,
    })
    await connector.waitUntilReady()
    let changes = new Changes(connector, {merge_multiple_hour_span: options.merge ?? true})
    let ui = new ChangesUiManager(null, connector, changes)
    return {fixtures, session, api, connector, changes, ui}
}

/**
 * Eén regel per item, in de volgorde waarin ze op het bord staan:
 * "jaarlaag | beginuur-einduur | klassen | tekst"
 */
export function boardLines(connector, records) {
    let years = Object.keys(connector.yearsOfEducation).sort()
    let lines = []
    years.forEach(year => {
        records.filter(r => String(r.departmentOfBranch.yearOfEducation) === year).forEach(r => {
            lines.push([year, r.period_start + "-" + r.period_end, r.getClassNames().slice(1).join(" "), r.getInnerText()].join(" | "))
        })
    })
    return lines
}

export async function boardSnapshot(name = "2026-09-23", options = {}) {
    let board = await buildBoard(name, options)
    await board.changes.loadData()
    return {...board, lines: boardLines(board.connector, board.ui.collectChanges())}
}
