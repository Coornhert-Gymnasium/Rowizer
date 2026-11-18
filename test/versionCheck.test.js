import "./helpers/quiet.js"
import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {parseVersion, fetchVersion, shouldReload} from "../js/versionCheck.js"

test("versie uit version.js lezen", () => {
    assert.equal(parseVersion('// x\nexport const VERSION = "7d73d03";\n'), "7d73d03")
    assert.equal(parseVersion("export const VERSION = 'abc-dirty'"), "abc-dirty")
    assert.equal(parseVersion("<html>404</html>"), null)
    assert.equal(parseVersion(undefined), null)
})

test("het echte version.js is te lezen", () => {
    assert.ok(parseVersion(readFileSync(new URL("../js/version.js", import.meta.url), "utf8")))
})

test("herladen alleen bij een andere versie, en hoogstens eens per versie", () => {
    assert.equal(shouldReload({loaded: "a", remote: "a", tried: null}), false)
    assert.equal(shouldReload({loaded: "a", remote: "b", tried: null}), true)
    assert.equal(shouldReload({loaded: "a", remote: "b", tried: "b"}), false, "na herladen nog steeds a: cache, geen lus")
    assert.equal(shouldReload({loaded: "a", remote: "c", tried: "b"}), true)
    assert.equal(shouldReload({loaded: "a", remote: null, tried: null}), false)
})

test("ophalen zonder cache en zonder cookies; een fout gooit", async () => {
    let seen
    let fetch = async (url, options) => { seen = {url, options}; return {ok: true, text: async () => 'export const VERSION = "b";'} }
    assert.equal(await fetchVersion({url: "js/version.js", fetch}), "b")
    assert.deepEqual(seen.options, {cache: "no-store", credentials: "omit"})
    await assert.rejects(fetchVersion({url: "x", fetch: async () => ({ok: false, status: 404})}))
})
