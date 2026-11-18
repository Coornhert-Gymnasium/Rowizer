/**
 * Zelf bijwerken na een deploy (plan stap 3.5).
 *
 * Elk kwartier js/version.js van de eigen webserver ophalen, langs de cache. Wijkt de versie af van
 * de geladen versie, dan herlaadt het bord. Kwam er na het herladen tóch weer de oude versie
 * (een cache onderweg), dan niet nog eens voor dezelfde versie: geen herlaadlus.
 */

const TRIED_KEY = "rowizerVersionTried"

/** De versie uit de tekst van version.js, of null. */
export function parseVersion(text) {
    let match = typeof text === "string" && text.match(/VERSION\s*=\s*["']([^"']+)["']/)
    return match ? match[1] : null
}

/** @return {Promise<string|null>} de versie op de webserver; null als het bestand niet te lezen is */
export async function fetchVersion({url, fetch = globalThis.fetch}) {
    let response = await fetch(url, {cache: "no-store", credentials: "omit"})
    if (!response.ok) {
        throw new Error("version.js: HTTP " + response.status)
    }
    return parseVersion(await response.text())
}

/**
 * @param input.loaded de versie van deze pagina
 * @param input.remote de versie op de webserver
 * @param input.tried de versie waarvoor al eens herladen is
 */
export function shouldReload({loaded, remote, tried}) {
    return !!remote && remote !== loaded && remote !== tried
}

/** sessionStorage overleeft het herladen; zonder opslag werkt de controle gewoon, alleen zonder rem. */
export const triedStore = {
    get() {
        try { return globalThis.sessionStorage.getItem(TRIED_KEY) } catch (e) { return null }
    },
    set(version) {
        try { globalThis.sessionStorage.setItem(TRIED_KEY, version) } catch (e) { /* geen opslag */ }
    },
}
