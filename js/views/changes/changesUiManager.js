import ChangesUIRecordClass from "./changesUIRecordClass.js";

export class ChangesUiManager {

    constructor(element, connector, manager) {
        this.element = element
        //changesmanager does the change models and so.
        this.changesManager = manager;
        this.connector = connector
        this.setDate(connector.date)
        this.scroller = new ChangesUIScroller()
        this.tableReady = false

    }

    setDate(date) {
        this.date = date
    }

    makeTable() {
        let yearsOfEducation = Object.keys(this.connector.yearsOfEducation).sort()
        let timeslots = Object.values(this.connector.timeslots).sort((a, b) => a.rank - b.rank)

        let container = document.createElement('div')
        container.classList.add("schedule-container", "schedule-flex")
        container.style.setProperty('--years-of-education', yearsOfEducation.at(-1));
        container.style.setProperty('--timeslots', timeslots.length ? timeslots.at(-1).rank : 1);
        //set css variables
        let year_row = document.createElement('div')
        year_row.classList.add("year-row", "schedule-flex", "header")
        let node = document.createElement('div');
        node.classList.add("schedule-flex", "year-header")
        year_row.append(node)
        container.append(year_row)

        let timeslots_box = document.createElement('div')
        timeslots_box.classList.add("schedule-content-container")
        timeslots_box.classList.add("timeslot-container")
        timeslots_box.classList.add("schedule-flex")
        year_row.append(timeslots_box)
        timeslots.forEach(slot => {
            let el = document.createElement('div')
            el.classList.add("timeslot-header")
            el.innerHTML = slot.name
            el.setAttribute('data-timeslot', slot.rank)
            timeslots_box.append(el)
        })

        yearsOfEducation.forEach(year => {
            let el = document.createElement('div')
            el.classList.add("year-row", "schedule-flex")
            let year_cell = document.createElement('div')
            year_cell.classList.add("schedule-flex", "header", "year-header")
            year_cell.innerHTML = year
            el.append(year_cell)

            let content_cell = document.createElement('div')
            content_cell.classList.add("schedule-content", "schedule-flex")
            el.append(content_cell)
            let content_container = document.createElement('div')
            content_container.classList.add("schedule-content-container")
            content_container.id = "schedule-content-year-" + year
            content_cell.append(content_container)
            container.append(el)
        })
        this.element.append(container)
        this.scroller.start()
    }

    fillTable() {
        let changes = []
        // Hier wordt normaal gefilterd op of er een lesgroep gekoppeld is aan een afspraak. 
        // laat nu alles zien: exams en keuzelessen hebben geen afspraak
        let app_filtered = Object.values(this.changesManager.appointments)

        let do_app = function (apps, cm) {
            apps.forEach(appointment => {
                try {
                                    if(appointment.groupsInDepartments.length != 0){
                        appointment.groupsInDepartments.forEach(group_id => {

                            let group = cm.connector.getGroupInDepartment(group_id)
                            let branch = group && cm.connector.getDepartmentOfBranch(group.departmentOfBranch)
                            if (!branch) {
                                console.warn("Appointment " + appointment.id + ": unknown group or department for group " + group_id)
                                return;
                            }
                            let i = appointment.startTimeSlot


                            if(appointment.type === "activity" || appointment.type === "exam") {
                                if (appointment.cancelled && changes.find(c => c.entity.id === group.id && c.period_start <= appointment.startTimeSlot && c.period_end >= appointment.endTimeSlot)){
                                    return;
                                }
                                changes.push(new ChangesUIRecordClass(group, branch, appointment.startTimeSlot, appointment.endTimeSlot, appointment))
                            } else {
                                while (i <= appointment.endTimeSlot) {
                                    //filteren van dingen die tegelijk met activiteiten uitvallen
                                    if (changes.find(c => c.entity.id === group.id && c.period_start <= i && c.period_end >= i)) {
                                        return;
                                    }

                                    i++;
                                }
                                changes.push(new ChangesUIRecordClass(group, branch, appointment.startTimeSlot, appointment.endTimeSlot, appointment));
                            }
                        })
                    } else if (appointment.students.length != 0 ) {
                        //
                        // HELP DIT IS EEN STOMME HACK
                        // DIT MOET NIET HIER
                        //
                        // Model-view-controller... -> dit moet in de connector::changes. 
                        //
                        //console.log("appointment with students but no group in department: " + appointment.type);
                        //console.log(appointment)
                        // loop alle studenten langs, en haal hun afdeling (klas) op.
                        let depts = new Set()
                        let unknown_students = 0
                        appointment.students.forEach(student => {
                            let student_in_department = cm.connector.getStudentInDepartment(student)
                            if (student_in_department) {
                                depts.add(student_in_department.departmentOfBranch);
                            } else {
                                unknown_students++
                            }
                        })
                        if (unknown_students) {
                            console.warn("Appointment " + appointment.id + ": " + unknown_students + " unknown student(s)")
                        }
                        // maak voor alle afdelingen een fake groep aan, en voeg die toe aan de changes.
                        //  De naam van de groep is de opmerking van de roostermaker "remark / schedulerremake" in zermelo
                        depts.forEach(dept => {
                            let branch = cm.connector.getDepartmentOfBranch(dept)
                            if (!branch) {
                                console.warn("Appointment " + appointment.id + ": unknown department " + dept)
                                return;
                            }
                            // Maak een fake group, met naam uit "subject" van de afspraak, en extended name uit "remark" van de afspraak. 
                            // Niet elke afspraak heeft een vak: gebruik dan alleen de opmerking als naam.
                            let subject = appointment.subjects[0]
                            let remark = subject ? subject.substring(0, 6) : ""
                            if (appointment.type === "exam" || !subject) {
                                // toetsen krijgen uitgebreide beschrijving:
                                remark = (remark + " " + (appointment.remark || "")).trim();
                            }
                            let group = {'id': appointment.id, 'departmentOfBranch': dept, 'name': remark, 'extendedName': remark, "isMainGroup": false, "isMentorGroup": false}
                            changes.push(new ChangesUIRecordClass(group, branch, appointment.startTimeSlot, appointment.endTimeSlot, appointment));
                        })
                    } else {
                        console.log("Skipping: " + appointment.type + " " + appointment.subjects);
                        console.log(appointment)
                    }
                } catch (e) {
                    // Eén afspraak met onverwachte gegevens mag nooit het hele bord leeg laten.
                    console.warn("Skipping appointment " + appointment.id, e, appointment)
                }
            })

        }

        do_app(app_filtered.filter(app => app.type === 'activity' && app.valid && !app.cancelled), this)
        do_app(app_filtered.filter(app => app.type === 'activity' && app.valid && app.cancelled), this)
        do_app(app_filtered.filter(app => app.type === 'exam' && app.valid && !app.cancelled), this)
        do_app(app_filtered.filter(app => app.type === 'exam' && app.valid && app.cancelled), this)

        do_app(app_filtered.filter(app => app.type === 'lesson' && app.valid && !app.cancelled), this)
        do_app(app_filtered.filter(app => app.type === 'lesson' && app.valid && app.cancelled), this)

        // als onderstaand AAN staat, dan staat bij docent wijziging de les twee keer op het bord, de oude gewijzigde les is !valid
        //  dis komt anders als "vervalt" met de oude docent op het bord.
        //do_app(app_filtered.filter(app => app.type === "lesson" && !app.valid), this)

        changes.sort((a, b) => {
            if (a.appointment.type !== b.appointment.type) {
                if (a.appointment.type === 'lesson') {
                    //activities voor lessen
                    return 1
                } else {
                    return -1
                }
            } else if (a.entity !== b.entity) {
                if (a.entity.extendedName > b.entity.extendedName) {
                    return 1
                } else {
                    return -1
                }
            }
            return 0
        }).forEach(change => {
            let container = document.querySelector("#schedule-content-year-" + change.departmentOfBranch.yearOfEducation)
            if (!container) {
                // geen rij voor deze jaarlaag, bv. een genegeerde afdeling of een afdeling zonder leerjaar
                return
            }
            try {
                container.append(change.getElement())
            } catch (e) {
                console.warn("Could not show appointment " + change.appointment.id, e, change.appointment)
            }

        })
    }

    /**
     * @return {Promise<boolean>} false if the data could not be loaded or shown
     */
    async refreshTable() {
        //TODO: this is quick n dirty way to show the new changes

        try{
            var changed = await this.changesManager.loadData()
        }
        catch (e){
            console.error(e)
            return false;

        }
        // Na een mislukte eerste keer moet de tabel ook opgebouwd worden als er niets gewijzigd is.
        if (!this.tableReady || changed) {
            this.tableReady = false
            try {
                this.scroller.stop()
                this.element.innerHTML = ""
                this.makeTable()
                this.fillTable()
                this.tableReady = true
            }
            catch (e){
                console.error(e)
                return false
            }
        }
        return true
    }
}

class ChangesUIScroller{
    #timeout;
    #frame;

    start(){
        this.stop()
        this.#scrollDown()
    }

    stop(){
        clearTimeout(this.#timeout)
        cancelAnimationFrame(this.#frame)
    }

    #scrollDown(){
        // Elke ronde opnieuw meten: de rij met de meeste inhoud bepaalt hoe ver alle rijen meescrollen.
        let rows = [...document.querySelectorAll(".schedule-content")]
        let overflow = Math.max(0, ...rows.map(row => row.scrollHeight - row.clientHeight))
        if(overflow <= 0){
            this.#timeout = setTimeout(() => this.#scrollDown(), 1000)
            return
        }
        this.#animate(rows, 0, overflow, overflow*150, () => {
            this.#timeout = setTimeout(() => {
                this.#animate(rows, overflow, 0, 300, () => this.#scrollDown())
            }, 1000)
        })
    }

    #animate(rows, from, to, duration, done){
        let started
        let step = now => {
            started = started ?? now
            let progress = Math.min((now - started)/duration, 1)
            rows.forEach(row => row.scrollTop = from + (to - from)*progress)
            if(progress < 1){
                this.#frame = requestAnimationFrame(step)
            }
            else{
                done()
            }
        }
        this.#frame = requestAnimationFrame(step)
    }
}
