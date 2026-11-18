import test from "node:test"
import assert from "node:assert/strict"
import {readSettings, rememberToken, urlWithoutToken} from "../js/settings.js"

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

function memory() {
    let data = new Map()
    return {getItem: k => data.has(k) ? data.get(k) : null, setItem: (k, v) => data.set(k, String(v)), data}
}

test("rememberToken=1: token bewaren, daarna zonder token in het adres", () => {
    let storage = memory()
    let first = readSettings({search: "", hash: "#portal=abc&token=t1&rememberToken=1"})
    assert.equal(rememberToken(first, storage), true, "uit de adresbalk halen")
    let later = readSettings({search: "", hash: "#portal=abc&rememberToken=1"})
    assert.equal(rememberToken(later, storage), false)
    assert.equal(later.get("token"), "t1")
})

test("nieuw token in het adres vervangt het bewaarde", () => {
    let storage = memory()
    rememberToken(readSettings({hash: "#token=t1&rememberToken=1"}), storage)
    rememberToken(readSettings({hash: "#token=t2&rememberToken=1"}), storage)
    let s = readSettings({hash: "#rememberToken=1"})
    rememberToken(s, storage)
    assert.equal(s.get("token"), "t2")
})

test("zonder rememberToken=1 niets bewaren of invullen", () => {
    let storage = memory()
    storage.setItem("rowizerToken", "oud")
    let s = readSettings({hash: "#portal=abc&token=t1"})
    assert.equal(rememberToken(s, storage), false)
    assert.equal(storage.getItem("rowizerToken"), "oud")
    let s2 = readSettings({hash: "#portal=abc"})
    rememberToken(s2, storage)
    assert.equal(s2.get("token"), null)
})

test("opslag werkt niet: token blijft in het adres, geen fout", () => {
    let broken = {getItem: () => { throw new Error("blocked") }, setItem: () => { throw new Error("blocked") }}
    let s = readSettings({hash: "#token=t1&rememberToken=1"})
    assert.equal(rememberToken(s, broken), false)
    assert.equal(s.get("token"), "t1")
    let lost = {getItem: () => null, setItem: () => {}}
    assert.equal(rememberToken(readSettings({hash: "#token=t1&rememberToken=1"}), lost), false, "niet bewaard: niet weghalen")
})

test("token uit query en fragment halen, de rest blijft", () => {
    assert.equal(urlWithoutToken("https://x.nl/Rowizer/#portal=abc&token=t1&branch=a&rememberToken=1"),
        "https://x.nl/Rowizer/#portal=abc&branch=a&rememberToken=1")
    assert.equal(urlWithoutToken("https://x.nl/Rowizer/?portal=abc&token=t1&rememberToken=1"),
        "https://x.nl/Rowizer/?portal=abc&rememberToken=1")
})
