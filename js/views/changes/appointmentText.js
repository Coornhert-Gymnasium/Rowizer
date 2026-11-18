import {slotText} from "../../controllers/changes/movedLessons.js"

/**
 * De tekst van één item op het bord, zonder DOM: zo is hij te testen.
 * @param entity de groep (of de nepgroep voor keuzelessen en toetsen) waarvoor het item getoond wordt
 * @param appointment de afspraak
 * @return {string}
 */
export function appointmentText(entity, appointment) {
    let str = ""
    // Vakken en docenten alfabetisch, zoals het bord altijd toonde (dat kwam eerder doordat een
    // vergelijking de lijsten ongemerkt sorteerde). Op kopieën: de afspraak blijft ongewijzigd.
    const subjects = Array.isArray(appointment.subjects) ? [...appointment.subjects].sort() : []
    const teachers = [...appointment.teachers].sort()
    const firstSubject = typeof subjects[0] === "string" ? subjects[0] : ""

    if (entity.isMainGroup) {
        str += entity.name + " "
    } else {
        str += entity.extendedName + " "
    }


    if(appointment.type === "activity"){
        if (firstSubject) {
            str += firstSubject.replace("_", " ") + " "
        }

    } else {
        if (entity.isMainGroup) {
            if (firstSubject) {
                str += firstSubject.substring(0, 6)
            } else {
                console.log("appointment with no subjects: " + appointment.type);
                console.log(appointment);
                str += appointment.remark || ""
            }
            if (subjects.length > 1) {
                str += "+" + (subjects.length - 1).toString()
            }
            str += " "
        }
    }

    str += teachers.slice(0, 2).join(",")
    if (teachers.length > 2) {
        // het aantal docenten dat niet getoond wordt
        str += "+" + (teachers.length - 2).toString()
    }
    str += " "

    if (!appointment.valid && appointment.movedTo) {
        // oude versie van een verplaatste les (plan stap 3.3)
        str += "verplaatst naar " + slotText(appointment.movedTo)
    } else if (!appointment.cancelled && appointment.valid) {
        // dit gaat door: kortste lokaalnaam (op een kopie: de afspraak zelf blijft ongewijzigd),
        // +n bij meer lokalen, en de tijd voor afspraken zonder lesuur
        let locations = [...appointment.locations].sort((a,b)=>a.length-b.length)
        let location = locations.length ? locations[0] + (locations.length > 1 ? "+" + (locations.length - 1) : "") : ""
        str += [location, appointment.timeLabel].filter(Boolean).join(" ")
    } else {
        // dit vervalt
        if (appointment.type === 'exam') {
            str += " toets vervalt"
        } else {
            str += " vervalt"
        }
    }
    return str
}
