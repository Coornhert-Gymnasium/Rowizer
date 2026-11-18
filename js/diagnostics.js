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

export function countOutOfGrid() {
    diagnostics.outOfGrid++
}

export function countDroppedRows(endpoint, count) {
    diagnostics.droppedRows[endpoint] = (diagnostics.droppedRows[endpoint] || 0) + count
}

export function countUnknownReference() {
    diagnostics.unknownReferences++
}

export default diagnostics
