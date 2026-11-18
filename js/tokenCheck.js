import {ZermeloError} from "./zermelo/utils/errors.js";
import diagnostics from "./diagnostics.js";

export const WARN_DAYS = 30

/**
 * Zelfcontrole van het token (plan stap R.12): wie is het en wanneer verloopt het.
 * Vraagt alleen gebruiker en vervaldatum op, nooit het token zelf.
 *
 * @param session Session
 * @param now epoch ms
 * @return {Promise<null|{user: string, expires: number|null, daysLeft: number|null, expiresSoon: boolean}>}
 *         null als het token geen recht heeft om zichzelf te bekijken
 */
export async function checkToken(session, now = Date.now()) {
    let rows
    try {
        rows = await session.request("tokens/~current", {fields: ["user", "expires"]})
    } catch (e) {
        if (e instanceof ZermeloError && e.kind === "permission") {
            // geen recht: overslaan zonder melding
            return null
        }
        throw e
    }
    let row = rows && rows[0]
    if (!row) {
        return null
    }
    // expires is een epoch in seconden; 0 of leeg betekent: verloopt niet
    let expires = row.expires ? row.expires*1000 : null
    let daysLeft = expires ? Math.floor((expires - now) / (24*60*60*1000)) : null
    let result = {user: row.user, expires, daysLeft, expiresSoon: daysLeft !== null && daysLeft <= WARN_DAYS}
    diagnostics.token = result
    if (result.expiresSoon) {
        console.warn("Zermelo token expires in " + daysLeft + " day(s), on " + new Date(expires).toLocaleDateString("nl-NL"))
    }
    return result
}

/** Korte code voor rechtsonder, bv. "token 13-9-2030", of null. */
export function tokenNote(result) {
    if (!result || !result.expiresSoon) {
        return null
    }
    let d = new Date(result.expires)
    return "token " + d.getDate() + "-" + (d.getMonth() + 1) + "-" + d.getFullYear()
}
