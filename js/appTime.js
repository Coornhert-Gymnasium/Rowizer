/**
 * De tijd volgens de app (plan stap R.6).
 *
 * Een Raspberry Pi heeft geen klok met batterij: zonder NTP blijft hij op een verkeerde tijd
 * staan. De app meet de afwijking met de Date-header van de eigen webserver (clockCheck.js) en
 * corrigeert alleen beslissingen over de kalender: welke dag het is, de dagwissel, het nachtelijke
 * onderhoud en de klok op het scherm. Tijdsduren (time-outs, intervallen) rekenen gewoon met de
 * eigen klok; die blijven kloppen, ook als de klok verkeerd staat.
 */

// Kleine afwijkingen negeren: de Date-header heeft een resolutie van een seconde.
export const CLOCK_THRESHOLD = 2*60*1000

let offset = 0

/** @param ms gemeten afwijking (server min lokaal); onder de drempel telt als 0 */
export function setClockOffset(ms) {
    offset = typeof ms === "number" && Math.abs(ms) > CLOCK_THRESHOLD ? ms : 0
    return offset
}

export function clockOffset() {
    return offset
}

/** Nu, gecorrigeerd, in epoch ms. */
export function now() {
    return Date.now() + offset
}

/** Begin van vandaag (lokale tijdzone), gecorrigeerd. */
export function today() {
    let d = new Date(now())
    d.setHours(0, 0, 0, 0)
    return d
}
