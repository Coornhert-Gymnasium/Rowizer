import "./helpers/tz.js"
import test from "node:test"
import assert from "node:assert/strict"
import {computeStatus, NEUTRAL_TEXT, NO_LESSONS_TEXT} from "../js/status.js"
import {ZermeloError, errorForStatus} from "../js/zermelo/utils/errors.js"

const MINUTE = 60*1000
const t1035 = new Date(2026, 8, 23, 10, 35).getTime()
const network = new ZermeloError("down", {kind: "network"})

function status(overrides = {}) {
    return computeStatus({
        now: t1035,
        isReady: true,
        loadError: undefined,
        health: {state: "ok", lastError: null},
        changes: {addedAt: t1035 - 60*MINUTE, lastSuccess: t1035, lastError: null},
        changesFailure: null,
        absences: {lastSuccess: t1035},
        ...overrides,
    })
}

test("alles actueel: geen balk, 'bijgewerkt' rechtsonder", () => {
    let s = status()
    assert.equal(s.bar, null)
    assert.equal(s.updated, "bijgewerkt 10:35")
    assert.equal(s.code, null)
})

test("korte storing (< 15 min): nog geen balk, wel de code", () => {
    let s = status({now: t1035 + 10*MINUTE, health: {state: "down", lastError: network}, changesFailure: network})
    assert.equal(s.bar, null)
    assert.equal(s.code, "network")
})

test("storing > 15 min: oranje balk met de stand", () => {
    let s = status({now: t1035 + 16*MINUTE, health: {state: "down", lastError: network}, changesFailure: network})
    assert.deepEqual(s.bar, {level: "warn", text: "Geen verbinding met Zermelo – stand van 10:35"})
})

test("storing > 60 min: rode balk", () => {
    let s = status({now: t1035 + 61*MINUTE, health: {state: "down", lastError: network}, changesFailure: network})
    assert.equal(s.bar.level, "error")
})

test("verlopen token: neutrale tekst, code auth 401", () => {
    let auth = errorForStatus(401, {endpoint: "appointments"})
    let s = status({now: t1035 + 20*MINUTE, health: {state: "down", lastError: auth}, changesFailure: auth})
    assert.equal(s.bar.text, NEUTRAL_TEXT + " – stand van 10:35")
    assert.equal(s.code, "auth 401")
})

test("ontbrekend recht op afspraken: neutraal", () => {
    let permission = errorForStatus(403, {endpoint: "appointments"})
    let s = status({now: t1035 + 20*MINUTE, changesFailure: permission})
    assert.equal(s.bar.text.startsWith(NEUTRAL_TEXT), true)
    assert.equal(s.code, "permission 403")
})

test("weergavefout: neutraal, code render", () => {
    let s = status({now: t1035 + 20*MINUTE, changesFailure: "render"})
    assert.equal(s.bar.text.startsWith(NEUTRAL_TEXT), true)
    assert.equal(s.code, "render")
})

test("opstarten mislukt: melding op het bord, geen balk", () => {
    let s = status({isReady: false, loadError: network, changes: undefined})
    assert.equal(s.boardMessage, NEUTRAL_TEXT)
    assert.equal(s.code, "network")
    assert.equal(s.bar, null)
})

test("schooljaar nog niet ingericht: 'Vandaag geen lessen'", () => {
    let config = new ZermeloError("no year", {kind: "config", reason: "school-year-unknown"})
    let s = status({isReady: false, loadError: config, changes: undefined})
    assert.equal(s.boardMessage, NO_LESSONS_TEXT)
})

test("nog aan het opstarten zonder fout: niets", () => {
    let s = status({isReady: false, changes: undefined})
    assert.equal(s.boardMessage, null)
    assert.equal(s.bar, null)
})

test("afwezigen: na 30 min grijs met stand, na 2 uur verbergen", () => {
    assert.equal(status({now: t1035 + 20*MINUTE, changes: {lastSuccess: t1035 + 20*MINUTE}}).absences, "fresh")
    let stale = status({now: t1035 + 31*MINUTE, changes: {lastSuccess: t1035 + 31*MINUTE}})
    assert.equal(stale.absences, "stale")
    assert.equal(stale.absencesNote, "(stand van 10:35)")
    assert.equal(status({now: t1035 + 121*MINUTE, changes: {lastSuccess: t1035 + 121*MINUTE}}).absences, "hidden")
})
