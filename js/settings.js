/**
 * Instellingen uit de URL (plan stap R.13).
 *
 * Aanbevolen vorm: alles in het fragment, bv.
 *   https://.../Rowizer/#portal=abc&token=...&branch=a
 * Het fragment wordt door de browser nooit naar de webserver gestuurd, de query wel. De oude
 * vorm met ?portal=...&token=... blijft werken. Staat een instelling in beide, dan wint het fragment.
 *
 * @param location window.location (of iets met search en hash)
 * @return {URLSearchParams}
 */
export function readSettings(location) {
    let settings = new URLSearchParams(location.search || "")
    let hash = (location.hash || "").replace(/^#/, "")
    new URLSearchParams(hash).forEach((value, key) => settings.set(key, value))
    return settings
}

const TOKEN_KEY = "rowizerToken"

/**
 * Token onthouden (plan stap 3.6, optioneel): met rememberToken=1 bewaart het bord het token in
 * localStorage en haalt het uit de adresbalk. Daarna is het adres zonder token genoeg. Een nieuw
 * token in het adres vervangt het bewaarde. Niet standaard: of de speler opslag bewaart, is onbekend;
 * zonder opslag verschijnt het instelscherm.
 *
 * @param settings uitkomst van readSettings (wordt aangevuld met het bewaarde token)
 * @param storage localStorage, of iets met getItem/setItem
 * @return {boolean} true als het token uit de adresbalk gehaald moet worden
 */
export function rememberToken(settings, storage) {
    if (settings.get("rememberToken") !== "1") {
        return false
    }
    let token = (settings.get("token") || "").trim()
    try {
        if (token) {
            storage.setItem(TOKEN_KEY, token)
            // alleen weghalen als het echt bewaard is
            return storage.getItem(TOKEN_KEY) === token
        }
        let saved = storage.getItem(TOKEN_KEY)
        if (saved) {
            settings.set("token", saved)
        }
    } catch (e) {
        console.warn("Could not use storage for the token", e)
    }
    return false
}

/** Het adres zonder token, in query en fragment; de rest blijft staan. */
export function urlWithoutToken(href) {
    let url = new URL(href)
    url.searchParams.delete("token")
    let hash = new URLSearchParams(url.hash.replace(/^#/, ""))
    hash.delete("token")
    url.hash = hash.toString()
    return url.toString()
}
