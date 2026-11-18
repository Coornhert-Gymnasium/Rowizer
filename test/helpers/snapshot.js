import {readFileSync, writeFileSync, existsSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"
import assert from "node:assert/strict"

const SNAPSHOT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "snapshots")

/**
 * Vergelijkt regels met test/snapshots/<name>.txt. Met UPDATE_SNAPSHOTS=1 wordt het bestand
 * (opnieuw) geschreven; controleer de diff daarna altijd met de hand.
 */
export function matchSnapshot(name, lines) {
    let file = path.join(SNAPSHOT_ROOT, name + ".txt")
    let text = lines.join("\n") + "\n"
    if (process.env.UPDATE_SNAPSHOTS === "1" || !existsSync(file)) {
        writeFileSync(file, text)
        return
    }
    assert.equal(text, readFileSync(file, "utf8").replace(/\r\n/g, "\n"))
}
