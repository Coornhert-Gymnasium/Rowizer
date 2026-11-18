import "./helpers/tz.js"
import test from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import vm from "node:vm"

// Het inline script uit index.html, zoals de browser het draait.
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8")
const source = html.match(/<script id="watchdog">([\s\S]*?)<\/script>/)[1]
const MINUTE = 60*1000

/**
 * Een "pagina": een eigen context met window.name als enige gedeelde toestand, zoals in de browser.
 */
function page(world) {
    let ctx = {
        console: {warn() {}, log() {}},
        JSON,
        Date: class extends Date { static now() { return world.t } },
        location: {pathname: "/Rowizer/", reload() { world.reloads.push(world.t); world.page = page(world) }},
        fetch: async (url, options) => {
            world.fetches.push({url, method: options.method})
            if (world.siteDown) throw new TypeError("Failed to fetch")
            return {status: world.status || 200}
        },
        setInterval(fn) { ctx.tick = fn },
    }
    ctx.window = ctx
    Object.defineProperty(ctx, "name", {get: () => world.name, set: v => { world.name = v }})
    vm.createContext(ctx)
    vm.runInContext(source, ctx)
    return ctx
}

function world() {
    let w = {t: new Date(2026, 8, 23, 8, 0).getTime(), name: "", reloads: [], fetches: []}
    w.page = page(w)
    w.minute = async () => {
        w.t += MINUTE
        w.page.tick()
        await new Promise(resolve => setImmediate(resolve))
    }
    return w
}

test("niet gestart na een minuut: herladen, HEAD zonder query", async () => {
    let w = world()
    await w.minute()
    await w.minute()
    assert.equal(w.reloads.length, 1)
    assert.deepEqual(w.fetches[0], {url: "/Rowizer/", method: "HEAD"})
})

test("rem: in een uur hoogstens 7 herladingen", async () => {
    let w = world()
    for (let i = 0; i < 60; i++) {
        await w.minute()
    }
    assert.ok(w.reloads.length <= 7, "reloads: " + w.reloads.length)
    let gaps = w.reloads.slice(1).map((t, i) => (t - w.reloads[i]) / MINUTE)
    // steeds langer wachten
    assert.ok(gaps.every((gap, i) => i === 0 || gap >= gaps[i - 1]), JSON.stringify(gaps))
})

test("geslaagde ronde haalt de rem eraf", async () => {
    let w = world()
    for (let i = 0; i < 10; i++) {
        await w.minute()
    }
    let before = w.reloads.length
    assert.ok(before >= 3)
    w.page.rowizerReloadOk()
    assert.equal(JSON.parse(w.name).rowizerReloads.count, 0)
    w.page.rowizerStarted = false
    await w.minute()
    await w.minute()
    assert.equal(w.reloads.length, before + 1, "direct weer toegestaan")
})

test("hartslag: verse hartslag geen herlading, stilstaande wel", async () => {
    let w = world()
    w.page.rowizerStarted = true
    for (let i = 0; i < 10; i++) {
        w.page.rowizerHeartbeat = w.t
        await w.minute()
    }
    assert.equal(w.reloads.length, 0)
    for (let i = 0; i < 16; i++) {
        await w.minute()
    }
    assert.equal(w.reloads.length, 1)
})

test("site onbereikbaar of 5xx: niet herladen en de teller loopt niet op", async () => {
    let w = world()
    w.siteDown = true
    await w.minute()
    await w.minute()
    w.siteDown = false
    w.status = 503
    await w.minute()
    assert.equal(w.reloads.length, 0)
    assert.equal(w.name, "")
})

test("budget en waakhond delen window.name zonder elkaar te overschrijven", async () => {
    let w = world()
    w.name = JSON.stringify({rowizerBudget: {recent: [1], dayCount: 1}})
    await w.minute()
    await w.minute()
    let saved = JSON.parse(w.name)
    assert.deepEqual(saved.rowizerBudget, {recent: [1], dayCount: 1})
    assert.equal(saved.rowizerReloads.count, 1)
})
