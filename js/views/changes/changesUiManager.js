import ChangesUIRecordClass from "./changesUIRecordClass.js";
import {now as appNow} from "../../appTime.js";

/**
 * Wat er nu is (plan stap 2.3): het lopende lesuur en welke lesuren voorbij zijn.
 * @param slots lesuren van vandaag (startDt, endDt, timeSlotName.rank)
 * @param now epoch ms
 * @return {{current: number|null, isPast: (rank: number) => boolean}}
 */
export function timeMarks(slots, now) {
    let current = slots.find(slot => slot.startDt.getTime() <= now && now < slot.endDt.getTime())
    return {
        current: current ? current.timeSlotName.rank : null,
        // een item is voorbij als het lesuur waarin het eindigt voorbij is
        isPast: rank => {
            let upTo = slots.filter(slot => slot.timeSlotName.rank <= rank)
            return upTo.length > 0 && upTo.at(-1).endDt.getTime() <= now
        },
    }
}

const TYPE_ORDER = {activity: 0, exam: 1, lesson: 2}

export const NO_LESSONS_TEXT = "Vandaag geen lessen"
export const NO_CHANGES_TEXT = "Geen roosterwijzigingen"

/**
 * Wat het bord toont als er niets is (plan stap 1.5). Items gaan altijd voor: ontbreekt het
 * weekrooster door een fout in de gegevens, dan mogen echte wijzigingen niet verdwijnen.
 * @param lessonsToday aantal lesuren vandaag
 * @param itemCount aantal items op het bord
 * @return {"no-lessons"|"no-changes"|null}
 */
export function emptyState(lessonsToday, itemCount) {
    if (itemCount) {
        return null
    }
    return lessonsToday ? "no-changes" : "no-lessons"
}

/**
 * De kolommen van het raster (plan stap 2.2): de lesuren van vandaag, zonder lege kolommen aan
 * het eind van de dag (nooit in het midden). Zonder lesuren van vandaag (bv. ontbrekend
 * weekrooster): alle lesuurnamen van het schooljaar, zoals eerder.
 * @param todaySlots connector.getTodayTimeSlots()
 * @param yearNames connector.timeslots (lesuurnamen van het schooljaar)
 * @param lastUsedRank hoogste lesuur met een item, of null als er geen items zijn
 * @return {{rank: number, name: string}[]} oplopend op rangnummer
 */
export function boardColumns(todaySlots, yearNames, lastUsedRank = null) {
    let columns = todaySlots.length
        ? todaySlots.map(slot => ({rank: slot.timeSlotName.rank, name: slot.timeSlotName.name || slot.timeSlotName.code}))
        : Object.values(yearNames || {}).map(name => ({rank: name.rank, name: name.name}))
    columns = columns.filter(c => Number.isFinite(c.rank)).sort((a, b) => a.rank - b.rank)
    if (lastUsedRank !== null) {
        let kept = columns.filter(c => c.rank <= lastUsedRank)
        if (kept.length) {
            columns = kept
        }
    }
    return columns.length ? columns : [{rank: 1, name: ""}]
}

/**
 * De kolom (1, 2, ...) van een lesuur. Werkt ook als de rangnummers niet bij 1 beginnen
 * (een nulde uur) of een gat hebben; een lesuur buiten het raster komt in de dichtstbijzijnde kolom.
 */
export function columnOf(columns, rank) {
    return Math.min(Math.max(1, columns.filter(c => c.rank <= rank).length), columns.length)
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
    makeTable(columns = boardColumns(this.connector.getTodayTimeSlots(), this.connector.timeslots)) {
        let yearsOfEducation = Object.keys(this.connector.yearsOfEducation).sort()
        let timeslots = columns

        let container = document.createElement('div')
        container.classList.add("schedule-container", "schedule-flex")
        container.style.setProperty('--years-of-education', yearsOfEducation.at(-1));
        container.style.setProperty('--timeslots', timeslots.length);
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
    fillTable(table, changes = this.collectChanges(), columns = boardColumns(this.connector.getTodayTimeSlots(), this.connector.timeslots)) {
        let placed = 0
        changes.forEach(change => {
            // lesuur -> kolom (plan stap 2.2)
            change.columnStart = columnOf(columns, change.period_start)
            change.columnEnd = Math.max(change.columnStart, columnOf(columns, change.period_end))
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

        let do_app = function (apps) {
            apps.forEach(appointment => {
                try {
                    // voor wie dit item is, bepaalt de controller (plan stap 4.3)
                    let targets = appointment.targets || []
                    if (!targets.length) {
                        console.debug("Skipping appointment " + appointment.id + " (" + appointment.type + "): no groups or students")
                    }
                    targets.forEach(({group, department, fake}) => {
                        let overlaps = (from, to) => changes.find(c => c.entity.id === group.id && c.period_start <= from && c.period_end >= to)
                        if (!fake) {
                            if (appointment.type === "activity" || appointment.type === "exam") {
                                // vervallen activiteit of toets weglaten als er voor die groep al iets op dat uur staat
                                if (appointment.cancelled && overlaps(appointment.startTimeSlot, appointment.endTimeSlot)) {
                                    return
                                }
                            } else {
                                // filteren van dingen die tegelijk met activiteiten uitvallen
                                for (let i = appointment.startTimeSlot; i <= appointment.endTimeSlot; i++) {
                                    if (overlaps(i, i)) {
                                        return
                                    }
                                }
                            }
                        }
                        changes.push(new ChangesUIRecordClass(group, department, appointment.startTimeSlot, appointment.endTimeSlot, appointment))
                    })
                } catch (e) {
                    // Eén afspraak met onverwachte gegevens mag nooit het hele bord leeg laten.
                    console.warn("Skipping appointment " + appointment.id, e, appointment)
                }
            })
        }

        do_app(app_filtered.filter(app => app.type === 'activity' && app.valid && !app.cancelled))
        do_app(app_filtered.filter(app => app.type === 'activity' && app.valid && app.cancelled))
        do_app(app_filtered.filter(app => app.type === 'exam' && app.valid && !app.cancelled))
        do_app(app_filtered.filter(app => app.type === 'exam' && app.valid && app.cancelled))

        do_app(app_filtered.filter(app => app.type === 'lesson' && app.valid && !app.cancelled))
        do_app(app_filtered.filter(app => app.type === 'lesson' && app.valid && app.cancelled))

        // Oude versies (!valid) alleen als de les naar een ander uur verplaatst is (plan stap 3.3); als
        // laatste, zodat ze wegvallen als de groep op dat uur al iets anders op het bord heeft. Andere
        // oude versies (alleen een ander lokaal of een andere docent) zouden er als "vervalt" bij komen.
        do_app(app_filtered.filter(app => app.type === "lesson" && !app.valid && app.movedTo))

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
                let changes = this.collectChanges()
                let years = this.connector.yearsOfEducation
                let shown = changes.filter(c => c.departmentOfBranch.yearOfEducation in years)
                let lastUsed = shown.length ? Math.max(...shown.map(c => c.period_end)) : null
                let columns = boardColumns(this.connector.getTodayTimeSlots(), this.connector.timeslots, lastUsed)
                table = this.makeTable(columns)
                state = emptyState(this.connector.getTodayTimeSlots().length, this.fillTable(table, changes, columns))
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
            this.markTime()
        }
        this.lastFailure = null
        return true
    }

    /**
     * Markeert het lopende lesuur en dimt voorbije items (plan stap 2.3). Alleen als het bord
     * vandaag toont; verandert alleen klassen, de tabel wordt niet opnieuw opgebouwd.
     */
    markTime(now = appNow()) {
        let today = new Date(now)
        today.setHours(0, 0, 0, 0)
        let isToday = this.connector.date.getTime() === today.getTime()
        let marks = isToday ? timeMarks(this.connector.getTodayTimeSlots(), now) : {current: null, isPast: () => false}
        this.element.querySelectorAll(".timeslot-header").forEach(el => {
            el.classList.toggle("current", Number(el.dataset.timeslot) === marks.current)
        })
        this.element.querySelectorAll(".appointment").forEach(el => {
            el.classList.toggle("past", marks.isPast(Number(el.dataset.endRank)))
        })
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
