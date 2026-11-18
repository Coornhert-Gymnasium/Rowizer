import test from "node:test"
import assert from "node:assert/strict"
import {readSettings} from "../js/settings.js"

test("query (oude vorm) blijft werken", () => {
    let s = readSettings({search: "?portal=abc&token=t1&branch=a", hash: ""})
    assert.equal(s.get("portal"), "abc")
    assert.equal(s.get("token"), "t1")
})

test("fragment (aanbevolen vorm)", () => {
    let s = readSettings({search: "", hash: "#portal=abc&token=t2&date=23-9-2026"})
    assert.equal(s.get("token"), "t2")
    assert.equal(s.get("date"), "23-9-2026")
})

test("fragment wint van de query", () => {
    let s = readSettings({search: "?token=oud&branch=a", hash: "#token=nieuw"})
    assert.equal(s.get("token"), "nieuw")
    assert.equal(s.get("branch"), "a")
})

test("lege URL", () => {
    let s = readSettings({search: "", hash: ""})
    assert.equal(s.get("portal"), null)
})
