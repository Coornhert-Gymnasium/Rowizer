/**
 * Instelscherm als portal of token ontbreekt (plan stap 1.4). Zonder die twee kan de app niets:
 * dan geen verzoeken naar Zermelo (eerder: naar "null.zportal.nl", elke minuut opnieuw), maar
 * een scherm dat zegt wat er mist.
 */

export const REQUIRED = ["portal", "token"]

/** @return {string[]} de ontbrekende verplichte instellingen */
export function missingSettings(params) {
    return REQUIRED.filter(key => !(params.get(key) || "").trim())
}

export function showSetupScreen(missing, doc = document) {
    doc.querySelector("#title").textContent = "Rowizer"
    let box = doc.createElement("div")
    box.classList.add("board-message", "setup")

    let heading = doc.createElement("div")
    heading.textContent = "Rowizer is nog niet ingesteld"
    let detail = doc.createElement("div")
    detail.classList.add("setup-detail")
    detail.textContent = "Ontbreekt in het adres: " + missing.join(" en ") + ". Voorbeeld: …/Rowizer/#portal=<portalnaam>&token=<API-token>"

    box.append(heading, detail)
    doc.querySelector("#content-container").replaceChildren(box)
}
