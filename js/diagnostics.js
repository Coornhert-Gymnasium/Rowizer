/**
 * Tellers en meldingen voor de diagnose (plan stap R.13). Alleen bijhouden, niets tonen:
 * de weergave komt later.
 */
const diagnostics = {
    // endpoint -> aantal rijen dat weggelaten is omdat een verplicht veld ontbrak
    droppedRows: {},
    // aantal keren dat een afspraak naar een onbekende groep, afdeling of leerling verwees
    unknownReferences: 0,
    // aantal keren dat een afspraak een lesuur buiten het raster had
    outOfGrid: 0,
}

/**
 * @param info null, of {date, counts: {dagrooster-id: aantal afdelingen}} als afdelingen
 *        die dag verschillende dagroosters gebruiken
 */
export function setDayTables(info) {
    if (info && JSON.stringify(info) !== JSON.stringify(diagnostics.dayTables)) {
        console.warn("Departments use different day timetables on " + info.date + ": " + JSON.stringify(info.counts) + ", showing the most common one")
    }
    diagnostics.dayTables = info
}

export function countOutOfGrid() {
    diagnostics.outOfGrid++
}

const MAX_EVENTS = 50
diagnostics.events = []

/**
 * Bewaart een fout of melding in een ringbuffer van 50 regels, voor het diagnosepaneel.
 */
export function logEvent(level, message) {
    let line = new Date().toLocaleTimeString("nl-NL") + " " + level + " " + String(message).slice(0, 300)
    diagnostics.events.push(line)
    if (diagnostics.events.length > MAX_EVENTS) {
        diagnostics.events.splice(0, diagnostics.events.length - MAX_EVENTS)
    }
}

export function countDroppedRows(endpoint, count) {
    diagnostics.droppedRows[endpoint] = (diagnostics.droppedRows[endpoint] || 0) + count
}

export function countUnknownReference() {
    diagnostics.unknownReferences++
}

export default diagnostics
