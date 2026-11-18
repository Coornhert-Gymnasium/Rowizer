import diagnostics, {logEvent} from "./diagnostics.js";

/**
 * Vangt fouten op die nergens anders afgehandeld worden, en zet ze in de ringbuffer
 * van de diagnose (plan stap R.13).
 */
export function installErrorHandlers(target = window) {
    target.addEventListener("error", event => {
        logEvent("error", event.message + (event.filename ? " (" + event.filename.split("/").pop() + ":" + event.lineno + ")" : ""))
    })
    target.addEventListener("unhandledrejection", event => {
        let reason = event.reason
        logEvent("unhandled", reason && reason.message ? reason.message : String(reason))
    })
    // waarschuwingen en fouten uit de app zelf ook bewaren
    for (const level of ["warn", "error"]) {
        let original = console[level].bind(console)
        console[level] = (...args) => {
            logEvent(level, args.map(a => a && a.message ? a.message : typeof a === "object" ? safeJson(a) : String(a)).join(" "))
            original(...args)
        }
    }
}

function safeJson(value) {
    try {
        return JSON.stringify(value).slice(0, 200)
    } catch (e) {
        return String(value)
    }
}

function time(ms) {
    return ms ? new Date(ms).toLocaleTimeString("nl-NL") : "-"
}

/**
 * De tekst van het diagnosepaneel (alleen met debug=1). Bedoeld om met een foto van het
 * scherm een storing te kunnen beoordelen.
 */
export function debugText({scheduler, session, connector, version}) {
    let lines = []
    lines.push("Rowizer " + version + " · " + new Date().toLocaleString("nl-NL"))
    let health = session.health
    lines.push("Zermelo: " + health.state + (health.lastError ? " (" + (health.lastError.code || health.lastError.kind) + ": " + health.lastError.message + ")" : "")
        + (health.state === "down" ? ", volgende poging " + time(health.nextProbeAt) : ""))
    let budget = session.budget
    lines.push("Verzoeken: " + budget.lastWindow + "/" + budget.limits.windowMax + " in 10 min, " + budget.today + "/" + budget.limits.dayMax + " vandaag, budget bereikt: " + budget.hits + "x")
    lines.push("Basisgegevens: " + (connector.snapshot ? "geladen " + time(connector.snapshot.loadedAt) + " voor " + connector.snapshot.forDate : "niet geladen")
        + (connector.loadError ? ", laatste fout: " + (connector.loadError.code || connector.loadError.kind) : ""))
    scheduler.tasks.forEach(task => {
        lines.push("Taak " + task.name + ": laatst gelukt " + time(task.lastSuccess) + ", poging " + time(task.lastAttempt)
            + (task.failures ? ", " + task.failures + "x mislukt" : "") + (task.lastError ? " (" + (task.lastError.code || task.lastError.message) + ")" : ""))
    })
    let dropped = Object.entries(diagnostics.droppedRows).map(([k, v]) => k + " " + v).join(", ")
    lines.push("Weggelaten rijen: " + (dropped || "geen") + " · onbekende verwijzingen: " + diagnostics.unknownReferences + " · buiten raster: " + diagnostics.outOfGrid)
    if (diagnostics.dayTables) {
        lines.push("Dagroosters " + diagnostics.dayTables.date + ": " + JSON.stringify(diagnostics.dayTables.counts))
    }
    if (diagnostics.token) {
        lines.push("Token: " + diagnostics.token.user + ", verloopt " + (diagnostics.token.expires ? new Date(diagnostics.token.expires).toLocaleDateString("nl-NL") : "nooit"))
    }
    if (diagnostics.timeZone) {
        lines.push("Let op: " + diagnostics.timeZone + " (verwacht Europe/Amsterdam)")
    }
    if (diagnostics.clockOffset !== undefined) {
        lines.push("Klokafwijking: " + Math.round(diagnostics.clockOffset/1000) + " s")
    }
    lines.push("--- laatste meldingen ---")
    diagnostics.events.slice(-15).forEach(line => lines.push(line))
    return lines.join("\n")
}

export function showDebugPanel(context) {
    let panel = document.querySelector("#debug")
    if (!panel) {
        panel = document.createElement("pre")
        panel.id = "debug"
        document.body.append(panel)
    }
    panel.textContent = debugText(context)
}
