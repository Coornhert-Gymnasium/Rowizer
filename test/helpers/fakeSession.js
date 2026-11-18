// Nep-sessie: zelfde interface als js/zermelo/utils/session.js, maar leest uit de fixtures
// van scripts/record-fixtures.mjs en past de filters zelf toe.
import {readFileSync, readdirSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"

const FIXTURE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures")

// Filters die de app meestuurt maar die geen veld in de rijen zijn.
const IGNORED_PARAMS = {
    employeeabsences: ["startWeek", "endWeek"],
}

export function loadFixtures(name) {
    let dir = path.join(FIXTURE_ROOT, name)
    let data = {}
    for (const file of readdirSync(dir)) {
        if (file.endsWith(".json")) {
            data[file.slice(0, -5)] = JSON.parse(readFileSync(path.join(dir, file), "utf8"))
        }
    }
    let meta = data.meta
    delete data.meta
    return {meta, data}
}

function sameValue(a, b) {
    return String(a) === String(b)
}

export default class FakeSession {
    /**
     * @param fixtures resultaat van loadFixtures()
     * @param options.intercept optioneel (path, options, attempt) => undefined | Error | rows;
     *        een Error wordt gegooid, rijen worden teruggegeven in plaats van de fixture.
     */
    constructor(fixtures, options = {}) {
        this.meta = fixtures.meta
        this.data = fixtures.data
        this.intercept = options.intercept
        this.requests = []
    }

    async request(endpoint, options = {}) {
        this.requests.push({endpoint, options: {...options}})
        if (this.intercept) {
            let result = await this.intercept(endpoint, options, this.requests.length)
            if (result instanceof Error) {
                throw result
            }
            if (result !== undefined) {
                return structuredClone(result)
            }
        }

        let rows = this.data[endpoint]
        if (!rows) {
            throw new Error("fake session: no fixture for " + endpoint)
        }
        let ignored = IGNORED_PARAMS[endpoint] || []
        let fields = options.fields

        for (const [key, value] of Object.entries(options)) {
            if (key === "fields" || ignored.includes(key)) {
                continue
            }
            if (this.meta.scopeParams.includes(key)) {
                if (!sameValue(this.meta[key], value)) {
                    return []
                }
                continue
            }
            if (endpoint === "appointments" && key === "start") {
                rows = rows.filter(row => row.end > Number(value))
            } else if (endpoint === "appointments" && key === "end") {
                rows = rows.filter(row => row.start < Number(value))
            } else if (key === "modifiedSince") {
                rows = rows.filter(row => row.lastModified >= Number(value))
            } else {
                if (rows.length && !(key in rows[0])) {
                    throw new Error(`fake session: cannot filter ${endpoint} on ${key}`)
                }
                rows = rows.filter(row => {
                    let field = row[key]
                    return Array.isArray(field) ? field.some(v => sameValue(v, value)) : sameValue(field, value)
                })
            }
        }

        if (fields) {
            let list = Array.isArray(fields) ? fields : String(fields).split(",")
            rows = rows.map(row => Object.fromEntries(list.filter(f => f in row).map(f => [f, row[f]])))
        }
        return structuredClone(rows)
    }
}
