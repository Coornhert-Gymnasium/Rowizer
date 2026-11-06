export default class Absences {
    #absences;
    #lastValidAbsences;

    constructor(connector, options={}) {
        this.connector = connector
        this.#absences = {}
        this.#lastValidAbsences = ""
    }
    get absences(){
        return this.#absences
    }
    reset(){
        this.#absences = {};
        this.#lastValidAbsences = ""
    }

    /**
     * @return {Promise<boolean>} true if the absences changed since the last time
     */
    async loadAll(){
        if(!this.connector.date.isWeekDay()){
            return false
        }
        let weekyear = this.connector.date.getYearWeek()
        let absences = await this.connector.api.employeeAbsences.get({
            branchOfSchool: this.connector.branch.id,
            startWeek: weekyear,
            endWeek: weekyear,
            fields: ["id","start","end","absenceType","employee","absenceTypeCode","lastModified"]
        })

        let start = this.connector.date.getStartOfDayTime()/1000
        let end = this.connector.date.getEndOfDayTime()/1000

        // Altijd alles ophalen en vergelijken: zo vallen ook verwijderde afwezigheden op.
        let valid_absences= Object.values(absences).filter(abs=> abs.start < end && abs.end > start)
        let absencesToCheck = JSON.stringify(valid_absences.sort((a,b)=> a.id - b.id))
        if(this.#lastValidAbsences === absencesToCheck){
            return false
        }

        let timeslots = this.connector.getTodayTimeSlots()
        let new_absences = {}

        valid_absences.forEach(abs=>{
            // op een dag zonder rooster zijn er geen lesuren om de afwezigheid aan te koppelen
            if(timeslots.length){
                if(abs.start > timeslots[0].startDt.getTime()/1000){
                   abs.startSlot = timeslots.find(slot=> abs.start <= slot.startDt.getTime()/1000)
                    //console.log("starts after first hour", abs.startSlot, new Date(abs.start*1000))
                }
                if(abs.end < timeslots.at(-1).endDt.getTime()/1000){
                    let endSlot = timeslots.find((slot, index, slots)=> {
                        let to_return = abs.end <= slot.endDt.getTime()/1000
                        if(!to_return){
                            to_return = slots[index+1] ? slots[index+1].startDt.getTime()/1000 >= abs.end : false
                        }
                        return to_return
                    })
                    if(endSlot !== timeslots.at(-1)){
                        //if absence ends during the last timeslot assume until end of day
                        abs.endSlot = endSlot
                    }

                }
            }

            new_absences[abs.id] = abs
        })

        this.#absences = new_absences
        this.#lastValidAbsences = absencesToCheck
        return true
    }

}
