import "./helpers/tz.js"
import "./helpers/quiet.js"
import test from "node:test"
import assert from "node:assert/strict"
import {buildBoard, boardLines} from "./helpers/board.js"
import {ZermeloApi} from "../js/zermelo/zermelo.js"
import ZermeloConnector from "../js/connectors/zermeloConnector.js"
import FakeSession, {loadFixtures} from "./helpers/fakeSession.js"
import {ZermeloNetworkError} from "../js/zermelo/utils/errors.js"

function connectorWith(intercept, options = {}) {
    let fixtures = loadFixtures("2026-09-23")
    let session = new FakeSession(fixtures, {intercept})
    let api = new ZermeloApi({portal: "demo", token: "test", session})
    let connector = new ZermeloConnector(api, fixtures.meta.date, {branch: fixtures.meta.branch, ...options})
    return {connector, session}
}

test("momentopname is bevroren en compleet", async () => {
    let {connector} = await buildBoard()
    let snapshot = connector.snapshot
    assert.ok(Object.isFrozen(snapshot))
    assert.equal(snapshot.week, "202639")
    assert.equal(snapshot.schoolYear, 2026)
    assert.deepEqual(Object.keys(connector.yearsOfEducation).sort(), ["1", "2", "3", "4", "5", "6"])
    assert.equal(connector.getTodayTimeSlots().length, 10)
})

test("mislukt herladen halverwege: vorige momentopname blijft, bord ongewijzigd", async () => {
    let fail = false
    let board = await buildBoard("2026-09-23", {
        intercept: endpoint => fail && endpoint === "groupindepartments" ? new ZermeloNetworkError("down", {kind: "network"}) : undefined
    })
    await board.changes.loadData()
    let before = boardLines(board.connector, board.ui.collectChanges())
    let snapshot = board.connector.snapshot

    fail = true
    await assert.rejects(board.connector.reload(), e => e.kind === "network")
    assert.equal(board.connector.snapshot, snapshot, "zelfde object")
    assert.equal(board.connector.isReady, true)
    assert.equal(board.connector.loadError.kind, "network")

    await board.changes.loadData()
    assert.deepEqual(boardLines(board.connector, board.ui.collectChanges()), before)
})

test("geslaagd herladen vervangt de momentopname in één keer", async () => {
    let {connector} = await buildBoard()
    let old = connector.snapshot
    await connector.reload()
    assert.notEqual(connector.snapshot, old)
    assert.equal(connector.loadError, undefined)
})

test("gelijktijdig herladen deelt één laadronde", async () => {
    let {connector, session} = await buildBoard()
    let before = session.requests.length
    await Promise.all([connector.reload(), connector.reload(), connector.reload()])
    let branchRequests = session.requests.slice(before).filter(r => r.endpoint === "branches")
    assert.equal(branchRequests.length, 1)
})

test("opstarten blijft opnieuw proberen zonder paginaherlading", async () => {
    let attempts = 0
    let sleeps = []
    let {connector} = connectorWith(endpoint => {
        if (endpoint === "branches" && ++attempts < 3) {
            return new ZermeloNetworkError("down", {kind: "network"})
        }
    }, {sleep: async ms => { sleeps.push(ms) }})
    await connector.waitUntilReady()
    assert.equal(attempts, 3)
    assert.deepEqual(sleeps, [60000, 60000])
    assert.equal(connector.isReady, true)
})

test("onbekend schooljaar: config-fout, opnieuw na 30 minuten", async () => {
    let sleeps = []
    let {connector} = connectorWith(endpoint => endpoint === "branchesofschools" ? [] : undefined,
        {sleep: async ms => { sleeps.push(ms); connector.stop() }})
    await new Promise(resolve => setTimeout(resolve, 50))
    assert.equal(connector.isReady, false)
    assert.equal(connector.loadError.kind, "config")
    assert.equal(connector.loadError.reason, "school-year-unknown")
    assert.deepEqual(sleeps, [30*60*1000])
})

test("onbekende vestiging: config-fout", async () => {
    let fixtures = loadFixtures("2026-09-23")
    let api = new ZermeloApi({portal: "demo", token: "test", session: new FakeSession(fixtures)})
    let connector = new ZermeloConnector(api, fixtures.meta.date, {branch: "zz", autoStart: false})
    await assert.rejects(connector.loadBaseData(), e => e.kind === "config" && e.reason === "branch-unknown")
})

test("andere week: setDate laadt een nieuwe momentopname", async () => {
    let {connector, session} = await buildBoard()
    let before = session.requests.length
    await connector.setDate(new Date(2026, 8, 24))
    assert.equal(session.requests.length, before, "zelfde week: niets laden")
    await connector.setDate(new Date(2026, 8, 30))
    assert.ok(session.requests.length > before)
    assert.equal(connector.snapshot.week, "202640")
})

test("getTodayTimeSlots verandert de momentopname niet", async () => {
    let {connector} = await buildBoard()
    let slots = connector.getTodayTimeSlots()
    assert.ok(slots[0].startDt instanceof Date)
    assert.equal(Object.values(connector.snapshot.timeslots).some(slot => "startDt" in slot), false)
})
