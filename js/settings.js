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
