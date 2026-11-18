import {mergeAbsences, absenceText} from "../../controllers/absences/mergeAbsences.js";
import {ZermeloAuthorizationError} from "../../zermelo/utils/errors.js";

export class AbsencesUiManager {

    constructor(element, connector, manager) {
        this.element = element
        //changesmanager does the change models and so.
        this.absencesManager = manager;
        this.connector = connector
    }

    render() {
        // Eén regel per docent, met de lesuren als bereik (plan stap 1.1).
        let ranks = this.connector.getTodayTimeSlots().map(slot => slot.timeSlotName.rank)
        let merged = mergeAbsences(Object.values(this.absencesManager.absences), ranks)

        // eerst alles opbouwen, dan in één keer plaatsen: een fout laat de vorige lijst staan
        let elements = merged.map(item => {
            let el = document.createElement("div")
            el.classList.add("absence")
            el.textContent = absenceText(item)
            return el
        })
        this.element.replaceChildren(...elements)
    }


    /**
     * @return {Promise<boolean>} false if the absences could not be loaded or shown
     * @throws ZermeloAuthorizationError if the token has no access to absences
     */
    async refresh() {
        //TODO: this is quick n dirty way to show the new changes
        try{
            if (await this.absencesManager.loadAll()) {
                this.render()
            }
            return true
        } catch(e){
            if(e instanceof ZermeloAuthorizationError && e.kind === "permission"){
                throw e
            }
            console.error(e)
            return false
        }
    }

}
