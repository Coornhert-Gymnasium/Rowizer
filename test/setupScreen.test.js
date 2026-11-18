import test from "node:test"
import assert from "node:assert/strict"
import {missingSettings} from "../js/setupScreen.js"

test("portal en token zijn verplicht", () => {
    assert.deepEqual(missingSettings(new URLSearchParams("")), ["portal", "token"])
    assert.deepEqual(missingSettings(new URLSearchParams("portal=abc")), ["token"])
    assert.deepEqual(missingSettings(new URLSearchParams("portal=abc&token=%20")), ["token"], "alleen spaties telt als leeg")
    assert.deepEqual(missingSettings(new URLSearchParams("portal=abc&token=t")), [])
})
