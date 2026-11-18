import {ZermeloError} from "../zermelo/utils/errors.js";
import {setDayTables} from "../diagnostics.js";
import {today as appToday} from "../appTime.js";

const STARTUP_RETRY_DELAY = 60*1000
// Basisgegevens (groepen, leerlingen) kunnen overdag veranderen.
const MAX_SNAPSHOT_AGE = 60*60*1000
// Verwijst een afspraak naar iets onbekends, dan eerder verversen, maar niet vaker dan dit.
const MIN_REFRESH_INTERVAL = 10*60*1000
// Instellingen die niet kloppen (bv. schooljaar nog niet ingericht) lossen zich niet binnen een minuut op.
const CONFIG_RETRY_DELAY = 30*60*1000

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

/**
 *  Common data like timeslots, schools, branches, date
 *
 *  De basisgegevens zijn één momentopname (plan stap R.4): een nieuwe vervangt de oude pas als
 *  alles geladen is. Mislukt het laden, dan blijft de vorige gelden. Zo horen afdelingen,
 *  groepen en lesuren altijd bij elkaar, ook als het laden halverwege misgaat.
 */
export default class ZermeloConnector {
    #options
    #date
    #current = null
    #loading = null
    #loadError
    #resolveReady
    #ready
    #sleep
    #now
    #stopped = false
    #lastAttempt = 0

    /**
     * @param zapi ZermeloApi
     * @param date string DD-MM-YYYY, vandaag als leeg of ongeldig
     * @param options.branch vestigingscode, nodig bij meer dan één vestiging
     * @param options.ignore_departments afdelingscodes die niet meetellen voor hele jaarlagen
     * @param options.sleep eigen wachtfunctie (tests)
     * @param options.autoStart false om het laden niet in de constructor te starten (tests)
     */
    constructor(zapi, date, options = {}){
        this.api = zapi
        this.#options = {
            branch: options.branch || undefined,
            ignoreDepartmentCodes: options.ignore_departments || [],
        }
        this.#sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)))
        this.#now = options.now || (() => Date.now())
        this.#date = ZermeloConnector.#parseDate(date)
        this.#ready = new Promise(resolve => this.#resolveReady = resolve)

        if(options.autoStart !== false){
            this.#startup()
        }
    }

    /**
     * @param date string with format DD-MM-YYYY, today if empty or invalid
     */
    static #parseDate(date){
        if(date){
            let date_parts = date.split("-");
            let date_obj = new Date(date_parts[2], date_parts[1] - 1, date_parts[0], 0, 0)
            if(!isNaN(date_obj.getTime())){
                return date_obj
            }
            console.warn("Invalid date '" + date + "', showing today")
        }
        // vandaag volgens de gecorrigeerde klok (plan stap R.6)
        return appToday()
    }

    // Opstarten: blijven proberen tot de eerste momentopname er is, zonder de pagina te herladen.
    async #startup(){
        while(!this.#stopped && !this.#current){
            try {
                await this.reload()
            }
            catch (e){
                let delay = e instanceof ZermeloError && e.kind === "config" ? CONFIG_RETRY_DELAY : STARTUP_RETRY_DELAY
                await this.#sleep(delay)
            }
        }
    }

    /** Stopt het opnieuw proberen bij het opstarten (tests). */
    stop(){
        this.#stopped = true
    }

    get isReady(){
        return this.#current !== null
    }
    get loadError(){
        return this.#loadError
    }
    /** De huidige momentopname, of null. */
    get snapshot(){
        return this.#current
    }
    get groupsInDepartment(){
        return this.#current?.groupsInDepartment
    }
    get yearsOfEducation(){
        return this.#current ? this.#current.yearsOfEducation : {}
    }
    get timeslots(){
        return this.#current ? this.#current.timeslotNames : []
    }
    get branch(){
        return this.#current?.branchOfSchool
    }
    get date(){
        return this.#date
    }
    get departments(){
        return this.#current?.departments
    }
    /** Naam van de vakantie of vrije dag van de getoonde dag, of null (plan §5 bij stap 3.2). */
    get holiday(){
        let holidays = this.#current?.holidays || []
        let d = this.#date
        let key = String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0")
        let found = holidays.find(h => h.start <= key && key <= h.end)
        return found ? found.name : null
    }

    getGroupInDepartment(id){
        return this.#current?.groupsInDepartment[id]
    }

    getStudentInDepartment(id){
        return this.#current?.studentsInDepartments[id]
    }

    getDepartmentOfBranch(id){
        return this.#current?.departments[id]
    }

    /**
     * Zet de getoonde datum. Hoort die bij een ander schooljaar of een andere week dan de
     * momentopname, dan wordt een nieuwe geladen.
     */
    async setDate(date){
        if(!(date instanceof Date)){
            throw new TypeError("Invalid date format must be a valid date.")
        }
        this.#date = date
        let current = this.#current
        if(current && (current.schoolYear !== date.getSchoolYear() || current.week !== date.getYearWeek())){
            await this.reload(date)
        }
    }

    /**
     * Nieuwe dag: zet de datum en laad altijd een nieuwe momentopname. Tot dat gelukt is, is
     * isCurrent false en blijft de vorige momentopname beschikbaar.
     */
    async switchDay(date){
        if(!(date instanceof Date)){
            throw new TypeError("Invalid date format must be a valid date.")
        }
        this.#date = date
        return this.reload(date)
    }

    /** Hoort de momentopname bij de getoonde dag? */
    get isCurrent(){
        return !!this.#current && this.#current.forDate === this.#date.toDateString()
    }

    /** Ververs als de momentopname ouder is dan een uur. */
    refreshIfStale(maxAge = MAX_SNAPSHOT_AGE){
        if(this.#current && this.#now() - this.#current.loadedAt > maxAge && this.#now() - this.#lastAttempt > MIN_REFRESH_INTERVAL){
            return this.reload().catch(() => undefined)
        }
        return Promise.resolve(undefined)
    }

    /**
     * Een afspraak verwees naar een onbekende groep, afdeling of leerling: ververs, maar
     * hoogstens eens per 10 minuten.
     */
    requestRefresh(){
        if(this.#loading || this.#now() - this.#lastAttempt < MIN_REFRESH_INTERVAL){
            return Promise.resolve(undefined)
        }
        console.info("Unknown group, department or student: refreshing base data")
        return this.reload().catch(() => undefined)
    }

    /**
     * Laadt een nieuwe momentopname en neemt die over als het lukt. Gelijktijdige aanroepen
     * delen één laadronde.
     * @return {Promise<object>} de nieuwe momentopname
     */
    reload(date = this.#date){
        if(this.#loading){
            return this.#loading
        }
        this.#lastAttempt = this.#now()
        this.#loading = (async () => {
            try {
                let snapshot = await this.loadBaseData(date)
                if(date !== this.#date && date.toDateString() !== this.#date.toDateString()){
                    // intussen is de dag gewisseld: deze momentopname is al verouderd
                    console.warn("Date changed while loading base data")
                }
                this.#current = snapshot
                this.#loadError = undefined
                this.#resolveReady(this)
                return snapshot
            }
            catch (e){
                this.#loadError = e
                console.error(e)
                throw e
            }
            finally {
                this.#loading = null
                // bv. de status op het scherm bijwerken
                try {
                    this.onLoad?.()
                } catch (e) {
                    console.error(e)
                }
            }
        })()
        return this.#loading
    }

    /**
     * Haalt alle basisgegevens op voor een datum. Verandert niets aan de connector.
     * @return {Promise<object>} bevroren momentopname
     */
    async loadBaseData(date = this.#date){
        let api = this.api
        let schoolYear = date.getSchoolYear()
        let week = date.getYearWeek()
        let code = this.#options.branch

        let branches = code ? await api.branches.get({code: code}) : await api.branches.get()
        if(code && !branches.length){
            throw new ZermeloError("Branch " + code + " is unknown", {kind: "config", reason: "branch-unknown"})
        }
        if(!code && branches.length !== 1){
            throw new ZermeloError("More than one branch, need to set branch", {kind: "config", reason: "branch-ambiguous"})
        }
        if(branches.length > 1){
            console.warn("There's more than one branch with this id?")
        }
        let branch = branches[0]

        let branchesOfSchools = await api.branchesOfSchools.get({
            schoolYear: schoolYear,
            branch: branch.code
        })
        let branches_keys = Object.keys(branchesOfSchools)
        if (!branches_keys.length) {
            throw new ZermeloError("BranchesOfSchools is unknown for " + schoolYear, {kind: "config", reason: "school-year-unknown"})
        } else if (branches_keys.length > 1) {
            console.warn("There's more than one branch with this id for this year?")
        }
        let branchOfSchool = branchesOfSchools[branches_keys[0]]

        let departments = await api.departmentsOfBranches.get({
            branchOfSchool: branchOfSchool.id,
            fields: ['id', 'code', 'educationType', 'educations', 'weekTimeTable', 'yearOfEducation']
        })
        let yearsOfEducation = {}
        Object.values(departments).forEach(department => {
            department.mainGroupsInDepartment = []
            department.groupsInDepartment = []
            if (department.yearOfEducation && !this.#options.ignoreDepartmentCodes.includes(department.code)) {
                let year = department.yearOfEducation
                if (!yearsOfEducation[year]) {
                    yearsOfEducation[year] = []
                }
                yearsOfEducation[year].push(department.id)
            }
        })

        let groupsInDepartment = await api.groupInDepartments.get({
            branchOfSchool: branchOfSchool.id,
            fields: ['id', 'departmentOfBranch', 'name', 'extendedName', "isMainGroup", "isMentorGroup"]
        })
        Object.values(groupsInDepartment).forEach(group => {
            if (group.isMentorGroup) {
                group.students = []
            }
            let department = departments[group.departmentOfBranch]
            if (!department) {
                console.warn("Group " + group.id + " has unknown department " + group.departmentOfBranch)
                return
            }
            if (group.isMainGroup) {
                department.mainGroupsInDepartment.push(group.id)
            }
            department.groupsInDepartment.push(group.id)
        })

        let studentsInDepartments = await api.studentsInDepartments.get({
            schoolInSchoolYear: branchOfSchool.schoolInSchoolYear,
            fields: ['student', 'departmentOfBranch', 'mentorGroup']
        })
        Object.values(studentsInDepartments).forEach(student => {
            // de mentorgroep kan bij een andere vestiging horen
            let mentor_group = groupsInDepartment[student.mentorGroup]
            if (mentor_group && mentor_group.students) {
                mentor_group.students.push(student.student)
            }
        })

        let timeslotNames = await api.timeslotNames.get({schoolInSchoolYear: branchOfSchool.schoolInSchoolYear})

        // Eén rij per afdeling, met per dag de lesuren erin (code, start, end, rank); de aparte
        // verzoeken naar timeslots en daytimetables zijn daardoor niet meer nodig (plan stap R.5).
        let realizedWeekTimeTables = (await api.realizedweektimetables.get({schoolInSchoolYear: branchOfSchool.schoolInSchoolYear, week: week}))
            .filter(row => {
                let department = departments[row.departmentOfBranch]
                return department && !this.#options.ignoreDepartmentCodes.includes(department.code)
            })

        // Vakanties en vrije dagen (plan §5 bij stap 3.2). Niet nodig voor het bord: een fout,
        // bv. een token zonder dit recht, blokkeert niets.
        let holidays = []
        try {
            holidays = (await api.session.request("holidays", {
                schoolInSchoolYear: branchOfSchool.schoolInSchoolYear,
                fields: ["id", "name", "start", "end"],
            }))
                .filter(h => h && typeof h.name === "string" && /^\d{8}$/.test(h.start) && /^\d{8}$/.test(h.end))
                .map(h => Object.freeze({name: h.name, start: h.start, end: h.end}))
        } catch (e) {
            console.warn("Holidays not available, continuing without", e)
        }

        return Object.freeze({
            loadedAt: this.#now(),
            forDate: date.toDateString(),
            holidays,
            schoolYear,
            week,
            branch,
            branchOfSchool,
            departments,
            yearsOfEducation,
            groupsInDepartment,
            studentsInDepartments,
            timeslotNames,
            realizedWeekTimeTables,
        })
    }

    /**
     * Het dagrooster van de getoonde dag: het rooster dat de meeste afdelingen gebruiken
     * (besluit 8: het Coornhert heeft er één). Gebruiken afdelingen verschillende roosters, dan
     * komt dat in de diagnose; op het scherm verandert niets.
     * @return {{table: *, row: object|undefined, counts: object}}
     */
    #dayTable(){
        let current = this.#current
        let day = WEEKDAYS[this.#date.getDay()]
        let counts = {}
        let rowFor = {}
        current.realizedWeekTimeTables.forEach(row => {
            let table = row[day]
            if(table === undefined || table === null){
                return
            }
            counts[table] = (counts[table] || 0) + 1
            rowFor[table] = rowFor[table] || row
        })
        let tables = Object.keys(counts)
        let table = tables.sort((a, b) => counts[b] - counts[a] || Number(a) - Number(b))[0]
        setDayTables(tables.length > 1 ? {date: this.#date.toDateString(), counts} : null)
        return {table, row: table === undefined ? undefined : rowFor[table], day}
    }

    /**
     * De lesuren van de getoonde dag voor een afdeling, met startDt en endDt.
     * Nu geldt voor elke afdeling hetzelfde dagrooster (zie #dayTable); de parameter is er zodat
     * een school met verschillende roosters dit later kan uitbreiden zonder de aanroepers te wijzigen.
     * @param departmentId
     * @return {object[]} kopieën; de momentopname blijft ongewijzigd
     */
    getTimeSlots(departmentId){
        let current = this.#current
        if(!current){
            return []
        }
        let {row, day} = this.#dayTable()
        if(!row){
            // geen rooster voor deze dag (bv. weekend)
            return []
        }
        let embedded = row["timeSlots" + day[0].toUpperCase() + day.slice(1)] || []
        let names = Object.values(current.timeslotNames)

        return embedded.filter(slot => {
            if(!slot || !slot.start || !slot.end || !Number.isFinite(slot.rank)){
                console.warn("Skipping timeslot with missing data: " + JSON.stringify(slot))
                return false
            }
            return true
        }).map(slot => {
            let name = names.find(n => n.rank === slot.rank && (!slot.code || n.code === slot.code)) || {rank: slot.rank, name: slot.code, code: slot.code}
            let result = {id: slot.id, start: slot.start, end: slot.end, timeSlotName: name}
            result.startDt = new Date(this.#date.getTime())
            result.startDt.setHours(slot.start.slice(0,2), slot.start.slice(2,4), 0)
            result.endDt = new Date(this.#date.getTime())
            result.endDt.setHours(slot.end.slice(0,2), slot.end.slice(2,4), 0)
            return result
        }).sort((a,b) => a.timeSlotName.rank - b.timeSlotName.rank)
    }

    /**
     * returns timeslots with the startDt and endDt set for today
     * @return {*}
     */
    getTodayTimeSlots(){
        return this.getTimeSlots()
    }
    /**
     * Wacht tot de eerste momentopname er is. Wordt nooit afgewezen: het opstarten blijft
     * opnieuw proberen; zie loadError voor de laatste fout.
     * @return {Promise<ZermeloConnector>}
     */
    waitUntilReady() {
        return this.#ready
    }
}
