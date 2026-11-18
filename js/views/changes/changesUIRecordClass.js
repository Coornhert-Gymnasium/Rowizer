import {ChangesUIRecord} from "./changesUIRecord.js";
import {appointmentText} from "./appointmentText.js";

export default class ChangesUIRecordClass extends ChangesUIRecord {
    constructor(group, department, period, period_end, appointment) {
        super(group, department, period, period_end, appointment);
    }

    getInnerText() {
        return appointmentText(this.entity, this.appointment)
    }
}
