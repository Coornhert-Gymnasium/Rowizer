import "./helpers/tz.js"
import "./helpers/quiet.js"
import test from "node:test"
import assert from "node:assert/strict"
import Session from "../js/zermelo/utils/session.js"
import AppointmentsManager from "../js/zermelo/lib/appointments/appointmentsManager.js"
import GroupInDepartmentsManager from "../js/zermelo/lib/groupInDepartments/groupInDepartmentsManager.js"
import diagnostics from "../js/diagnostics.js"
import {zermeloResponse, scriptedFetch} from "./helpers/fakeFetch.js"

function sessionReturning(body) {
    let fetch = scriptedFetch([() => body()])
    return {fetch, session: new Session("demo", "token", {fetch, retryDelays: [1, 1]})}
}

test("totalRows groter dan het aantal rijen: data-fout, opnieuw geprobeerd", async () => {
    let {session, fetch} = sessionReturning(() => zermeloResponse(200, [{id: 1}], {totalRows: 2}))
    await assert.rejects(session.request("appointments"), e => e.kind === "data" && e.retryable)
    assert.equal(fetch.calls.length, 3)
})

test("data is geen lijst: data-fout", async () => {
    let {session} = sessionReturning(() => zermeloResponse(200, null))
    await assert.rejects(session.request("appointments"), e => e.kind === "data")
})

test("afspraken zonder id, start of end worden weggelaten en geteld", async () => {
    let rows = [
        {id: 1, start: 10, end: 20},
        {id: 2, start: null, end: 20},
        {start: 10, end: 20},
        {id: 4, start: 10, end: "20"},
    ]
    let {session} = sessionReturning(() => zermeloResponse(200, rows))
    let before = diagnostics.droppedRows.appointments || 0
    let result = await new AppointmentsManager(session).get({fields: ["id", "start", "end"]})
    assert.deepEqual(result.map(a => a.id), [1])
    assert.equal(diagnostics.droppedRows.appointments - before, 3)
})

test("alleen opgevraagde velden zijn verplicht", async () => {
    let {session} = sessionReturning(() => zermeloResponse(200, [{id: 1}]))
    let result = await new AppointmentsManager(session).get({fields: ["id"]})
    assert.equal(result.length, 1)
})

test("groep zonder afdeling wordt weggelaten", async () => {
    let {session} = sessionReturning(() => zermeloResponse(200, [{id: 1, departmentOfBranch: 5}, {id: 2}]))
    let result = await new GroupInDepartmentsManager(session).get({fields: ["id", "departmentOfBranch"]})
    assert.deepEqual(Object.keys(result), ["1"])
})
