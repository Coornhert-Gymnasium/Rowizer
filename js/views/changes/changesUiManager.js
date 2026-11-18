import ChangesUIRecordClass from "./changesUIRecordClass.js";

const TYPE_ORDER = {activity: 0, exam: 1, lesson: 2}

export const NO_LESSONS_TEXT = "Vandaag geen lessen"
export const NO_CHANGES_TEXT = "Geen roosterwijzigingen"

/**
 * Wat het bord toont als er niets is (plan stap 1.5).
 * @param lessonsToday aantal lesuren vandaag
 * @param itemCount aantal items op het bord
 * @return {"no-lessons"|"no-changes"|null}
 */
export function emptyState(lessonsToday, itemCount) {
    if (!lessonsToday) {
        return "no-lessons"
    }
    return itemCount ? null : "no-changes"
}

/**
 * Eén volgorde voor de items op het bord (plan stap 1.7): activiteiten, toetsen, lessen; daarbinnen
 * op groepsnaam (h3 voor h10), dan op lesuur. Altijd dezelfde uitkomst, in elke browser.
 */
export function compareChanges(a, b) {
    let type = (TYPE_ORDER[a.appointment.type] ?? 3) - (TYPE_ORDER[b.appointment.type] ?? 3)
    if (type) {
        return type
    }
    let name = String(a.entity.extendedName || "").localeCompare(String(b.entity.extendedName || ""), "nl", {numeric: true})
    return name
        || a.period_start - b.period_start
        || a.period_end - b.period_end
        || a.appointment.id - b.appointment.id
}

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

    /**
     * Bouwt het lege raster, los van de pagina.
     * @return {HTMLElement}
     */
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
            el.textContent = slot.name
            el.setAttribute('data-timeslot', slot.rank)
            timeslots_box.append(el)
        })

        yearsOfEducation.forEach(year => {
            let el = document.createElement('div')
            el.classList.add("year-row", "schedule-flex")
            let year_cell = document.createElement('div')
            year_cell.classList.add("schedule-flex", "header", "year-header")
            year_cell.textContent = year
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
        return container
    }

    /**
     * Zet de items in het raster van makeTable().
     * @param table het raster, nog niet op de pagina
     */
    fillTable(table) {
        let placed = 0
        this.collectChanges().forEach(change => {
            let container = table.querySelector("#schedule-content-year-" + change.departmentOfBranch.yearOfEducation)
            if (!container) {
                // geen rij voor deze jaarlaag, bv. een genegeerde afdeling of een afdeling zonder leerjaar
                return
            }
            try {
                container.append(change.getElement())
                placed++
            } catch (e) {
                console.warn("Could not show appointment " + change.appointment.id, e, change.appointment)
            }

        })
        return placed
    }

    /**
     * Bepaalt welke items op het bord komen, in welke volgorde. Raakt de DOM niet aan.
     * @return {ChangesUIRecordClass[]}
     */
    collectChanges() {
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
                            // alfabetisch eerste vak, zoals het bord altijd toonde (zie appointmentText.js)
                            let subject = [...appointment.subjects].sort()[0]
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

        return changes.sort(compareChanges)
    }

    /**
     * @return {Promise<boolean>} false if the data could not be loaded or shown
     */
    async refreshTable() {
        // Na een dagwissel: eerst de basisgegevens van de nieuwe dag, anders klopt het raster niet.
        if (!this.connector.isCurrent) {
            this.showMessage("Rooster van " + this.connector.date.toLocaleDateString("nl-NL", {weekday: "long", day: "numeric", month: "long"}) + " wordt geladen")
            try {
                await this.connector.reload()
            } catch (e) {
                console.error(e)
                this.lastFailure = e
                return false
            }
        }

        try{
            var changed = await this.changesManager.loadData()
        }
        catch (e){
            console.error(e)
            this.lastFailure = e
            return false;

        }
        // Na een mislukte eerste keer moet de tabel ook opgebouwd worden als er niets gewijzigd is,
        // en na nieuwe basisgegevens (bv. een groep die vandaag is aangemaakt).
        let snapshot = this.connector.snapshot
        if (!this.tableReady || changed || snapshot !== this.drawnSnapshot) {
            // Eerst los opbouwen, dan in één keer plaatsen: een fout laat het vorige beeld staan
            // (plan stap R.9).
            let table
            let state
            try {
                table = this.makeTable()
                state = emptyState(this.connector.getTodayTimeSlots().length, this.fillTable(table))
            }
            catch (e){
                console.error("Could not draw the board, keeping the previous one", e)
                this.lastFailure = "render"
                return false
            }
            if (state === "no-lessons") {
                // weekend of vrije dag: geen leeg raster
                this.showMessage(NO_LESSONS_TEXT)
                this.drawnSnapshot = snapshot
                this.lastFailure = null
                this.tableReady = true
                return true
            }
            if (state === "no-changes") {
                let message = document.createElement("div")
                message.classList.add("board-empty")
                message.textContent = NO_CHANGES_TEXT
                table.append(message)
            }
            let scrolled = this.scroller.position()
            this.scroller.stop()
            this.element.replaceChildren(table)
            this.tableReady = true
            this.drawnSnapshot = snapshot
            this.scroller.start(scrolled)
        }
        this.lastFailure = null
        return true
    }

    /**
     * Toont een melding in plaats van het raster, bv. bij een dagwissel.
     */
    showMessage(text) {
        this.scroller.stop()
        this.tableReady = false
        let message = document.createElement("div")
        message.classList.add("board-message")
        message.textContent = text
        this.element.replaceChildren(message)
    }
}

class ChangesUIScroller{
    #timeout;
    #frame;

    /**
     * @param from scrollpositie om verder te gaan (na opnieuw tekenen); wordt 0 als de inhoud
     *        nu korter is
     */
    start(from = 0){
        this.stop()
        this.#scrollDown(from)
    }

    /** De huidige scrollpositie van de rijen. */
    position(){
        let rows = [...document.querySelectorAll(".schedule-content")]
        return Math.max(0, ...rows.map(row => row.scrollTop))
    }

    stop(){
        clearTimeout(this.#timeout)
        cancelAnimationFrame(this.#frame)
    }

    #scrollDown(from = 0){
        // Elke ronde opnieuw meten: de rij met de meeste inhoud bepaalt hoe ver alle rijen meescrollen.
        let rows = [...document.querySelectorAll(".schedule-content")]
        let overflow = Math.max(0, ...rows.map(row => row.scrollHeight - row.clientHeight))
        if(overflow <= 0){
            this.#timeout = setTimeout(() => this.#scrollDown(), 1000)
            return
        }
        // verder waar we waren, tenzij de inhoud korter is geworden
        from = from > overflow ? 0 : from
        this.#animate(rows, from, overflow, (overflow - from)*150, () => {
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
