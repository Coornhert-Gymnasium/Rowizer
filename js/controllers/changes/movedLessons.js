/**
 * Verplaatste lessen ook op het oude uur tonen (plan stap 3.3, besluit 1).
 *
 * Zermelo maakt bij een wijziging een nieuwe, geldige afspraak; de oude blijft bestaan met
 * valid=false. Beide hebben hetzelfde `appointmentInstance`. Op de opgenomen demodag gold dat voor
 * 58 van de 59 ongeldige lessen; bij 57 stond de nieuwe versie op hetzelfde uur (alleen een ander
 * lokaal of een andere docent), bij één op een ander uur: dat is een verplaatste les.
 *
 * Deze functie zet bij zo'n oude les `movedTo` ({startTimeSlot, endTimeSlot} van de nieuwe). Wat
 * geen `movedTo` krijgt, blijft van het bord, zoals voorheen.
 *
 * Voorzichtig: alleen als de oude les zelf niet vervalt, er een geldige, niet vervallen nieuwe
 * versie vandaag is, en geen enkele geldige versie het oude uur nog raakt.
 *
 * @param appointments alle afspraken van vandaag, met startTimeSlot en endTimeSlot ingevuld
 * @return {number} het aantal gekoppelde verplaatste lessen
 */
export function linkMovedLessons(appointments) {
    let validByInstance = new Map()
    appointments.forEach(app => {
        if (app.valid && app.appointmentInstance != null) {
            if (!validByInstance.has(app.appointmentInstance)) {
                validByInstance.set(app.appointmentInstance, [])
            }
            validByInstance.get(app.appointmentInstance).push(app)
        }
    })

    let linked = 0
    appointments.forEach(old => {
        delete old.movedTo
        if (old.valid || old.cancelled || old.type !== "lesson" || old.appointmentInstance == null) {
            return
        }
        let versions = validByInstance.get(old.appointmentInstance) || []
        if (!versions.length) {
            return
        }
        // raakt een geldige versie (ook een vervallen) het oude uur, dan is dit geen verplaatsing
        if (versions.some(v => v.startTimeSlot <= old.endTimeSlot && v.endTimeSlot >= old.startTimeSlot)) {
            return
        }
        let target = versions
            .filter(v => !v.cancelled)
            .sort((a, b) => a.startTimeSlot - b.startTimeSlot)[0]
        if (!target) {
            return
        }
        old.movedTo = {startTimeSlot: target.startTimeSlot, endTimeSlot: target.endTimeSlot}
        linked++
    })
    return linked
}

/** "u4", "u4-5" */
export function slotText(movedTo) {
    let {startTimeSlot: from, endTimeSlot: to} = movedTo
    return "u" + (from === to ? from : from + "-" + to)
}
