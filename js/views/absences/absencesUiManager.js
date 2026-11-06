import AbsenceUiRecord from "./absenceUiRecord.js";
import {ZermeloAuthorizationError} from "../../zermelo/utils/errors.js";

export class AbsencesUiManager {

    constructor(element, connector, manager) {
        this.element = element
        //changesmanager does the change models and so.
        this.absencesManager = manager;
        this.connector = connector
    }

    render() {
        let absences = Object.values(this.absencesManager.absences).filter(abs => abs.employee);
        absences.sort((a, b) => a.employee.localeCompare(b.employee))
        let unique_employees = [...new Set(absences.map(abs=>abs.employee).filter((e, i, a) => a.indexOf(e) !== i))]
        if(unique_employees.length){
            //there are duplicates in the absences
            //console.log(unique_employees)
        }

        let absences_ui_items = absences.map(abs => new AbsenceUiRecord(abs))
        absences_ui_items.forEach(abui => this.element.append(abui.getElement()))
    }

    merge(){

    }


    /**
     * @return {Promise<boolean>} false if the absences could not be loaded or shown
     * @throws ZermeloAuthorizationError if the token has no access to absences
     */
    async refresh() {
        //TODO: this is quick n dirty way to show the new changes
        try{
            if (await this.absencesManager.loadAll()) {
                this.element.innerHTML = ""
                this.render()
            }
            return true
        } catch(e){
            if(e instanceof ZermeloAuthorizationError){
                throw e
            }
            console.error(e)
            return false
        }
    }

}
