import Interface from "../interface.js";

// Zermelo kan deze velden leeg (null) of helemaal niet meesturen; de rest van de code rekent op lijsten.
const LIST_FIELDS = ["subjects", "teachers", "locations", "students", "groups", "groupsInDepartments", "courses"]

export default class AppointmentInterface extends Interface {
    constructor(options) {
        super(options);
        LIST_FIELDS.forEach(field => {
            if (!Array.isArray(this[field])) {
                this[field] = []
            }
        })
    }
}
