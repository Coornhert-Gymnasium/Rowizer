export class ChangesUIRecord {
    constructor(entity, department, period_start, period_end, appointment) {
        this.entity = entity;
        this.period_start = period_start;
        this.period_end = period_end
        this.departmentOfBranch = department

        this.appointment = appointment;

        this.element = null;
    }

    getElement() {
        if (this.element) {
            return this.element
        }
        return this.#createElement()

    }

    /**
     * De CSS-klassen van dit item, zonder DOM: zo is het te testen.
     * @return {string[]}
     */
    getClassNames() {
        let classes = ["appointment", this.appointment.type]
        let this_morning = new Date(this.appointment.start * 1000)
        this_morning.setHours(1, 0, 0)

        if (this_morning.getTime() < (this.appointment.lastModified * 1000)) {
            classes.push("new")
        }
        if(!this.appointment.valid) {
            classes.push('invalid');
        }
        if(this.appointment.cancelled) {
            classes.push('cancelled');
        }
        return classes
    }

    #createElement() {
        let el = document.createElement("div");
        el.classList.add(...this.getClassNames())

        //for activities use real times
        // kolommen uit ChangesUiManager.fillTable (plan stap 2.2), anders het lesuur zelf
        el.style.setProperty('--start-hour', this.columnStart ?? this.period_start);
        el.style.setProperty('--end-hour', this.columnEnd ?? this.period_end);
        el.setAttribute('data-appointment-id', this.appointment.id);
        // voor het dimmen van voorbije items (plan stap 2.3)
        el.dataset.endRank = this.period_end;
        let text = this.getInnerText()
        // "vervalt" apart, zodat het opvalt (plan stap 2.5); de tekst zelf blijft gelijk
        let cancelled = text.match(/^(.*?)((?:toets )?vervalt)$/s)
        if (cancelled) {
            let word = document.createElement("span")
            word.classList.add("cancelled-word")
            word.textContent = cancelled[2]
            el.append(document.createTextNode(cancelled[1]), word)
        } else {
            el.innerText = text
        }

        this.element = el
        return this.element
    }

    getInnerText() {

    }


}
