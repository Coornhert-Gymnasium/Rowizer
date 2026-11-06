import {ChangesUIRecord} from "./changesUIRecord.js";

export default class ChangesUIRecordClass extends ChangesUIRecord {
    constructor(group, department, period, period_end, appointment) {
        super(group, department, period, period_end, appointment);
    }

    getInnerText() {
        let str = ""
        if (this.entity.isMainGroup) {
            str += this.entity.name + " "
        } else {
            str += this.entity.extendedName + " "
        }


        if(this.appointment.type === "activity"){
            if (this.appointment.subjects.length) {
                str += this.appointment.subjects[0].replace("_", " ")
                str += " "
            }

        } else {
            if (this.entity.isMainGroup) {
                if (this.appointment.subjects.length) {
                    str += this.appointment.subjects[0].substring(0, 6)
                } else {
                    console.log("appointment with no subjects: " + this.appointment.type);
                    console.log(this.appointment);
                    str += this.appointment.remark || "" 
                }
                if (this.appointment.subjects.length > 1) {
                    str += "+" + (this.appointment.subjects.length - 1).toString()
                }
                str += " "
            }
        }

        str += this.appointment.teachers.slice(0, 2).join(",")
        if (this.appointment.teachers.length > 2) {
            str += "+" + (this.appointment.teachers.length - 1).toString()
        }
        str += " "
        
        if (!this.appointment.cancelled && this.appointment.valid) {
            // dit gaat door: zet de locatie erbij
            if (this.appointment.locations.length) {
                str += this.appointment.locations.sort((a,b)=>a.length-b.length)[0]
            }
        } else {
            // dit vervalt
            if (this.appointment.type === 'exam') {
                str += " toets vervalt"
            } else {
                str += " vervalt"
            }
        }
        return str
    }
}
