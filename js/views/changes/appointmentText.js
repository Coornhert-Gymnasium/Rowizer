/**
 * De tekst van één item op het bord, zonder DOM: zo is hij te testen.
 * @param entity de groep (of de nepgroep voor keuzelessen en toetsen) waarvoor het item getoond wordt
 * @param appointment de afspraak
 * @return {string}
 */
export function appointmentText(entity, appointment) {
    let str = ""
    const subjects = Array.isArray(appointment.subjects) ? appointment.subjects : []
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

    str += appointment.teachers.slice(0, 2).join(",")
    if (appointment.teachers.length > 2) {
        str += "+" + (appointment.teachers.length - 1).toString()
    }
    str += " "

    if (!appointment.cancelled && appointment.valid) {
        // dit gaat door: zet de locatie erbij
        if (appointment.locations.length) {
            str += appointment.locations.sort((a,b)=>a.length-b.length)[0]
        }
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
