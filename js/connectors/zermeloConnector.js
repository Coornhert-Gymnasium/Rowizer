import {ZermeloError} from "../zermelo/utils/errors.js";

const STARTUP_RETRY_DELAY = 60*1000
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
    #stopped = false

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
        let today = new Date()
        today.setHours(0, 0, 0, 0)
        return today
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
     * Laadt een nieuwe momentopname en neemt die over als het lukt. Gelijktijdige aanroepen
     * delen één laadronde.
     * @return {Promise<object>} de nieuwe momentopname
     */
    reload(date = this.#date){
        if(this.#loading){
            return this.#loading
        }
        this.#loading = (async () => {
            try {
                let snapshot = await this.loadBaseData(date)
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
        let timeslots = await api.timeslots.get({schoolInSchoolYear: branchOfSchool.schoolInSchoolYear})
        Object.values(timeslots).forEach(timeslot => {
            timeslot.timeSlotName = timeslotNames[timeslot.timeSlotName]
        })

        let realizedWeekTimeTables = await api.realizedweektimetables.get({schoolInSchoolYear: branchOfSchool.schoolInSchoolYear, week: week})
        let dayTimeTables = await api.daytimetables.get({schoolInSchoolYear: branchOfSchool.schoolInSchoolYear})

        return Object.freeze({
            loadedAt: Date.now(),
            schoolYear,
            week,
            branch,
            branchOfSchool,
            departments,
            yearsOfEducation,
            groupsInDepartment,
            studentsInDepartments,
            timeslotNames,
            timeslots,
            realizedWeekTimeTables,
            dayTimeTables,
        })
    }

    /**
     * returns timeslots with the startDt and endDt set for today
     * @return {*}
     */
    getTodayTimeSlots(){
        //FIXME: multiple departmensOfBranch can have different timetables
        let current = this.#current
        if(!current){
            return []
        }

        let week_table = Object.values(current.realizedWeekTimeTables)[0]
        let realized_table = week_table && current.dayTimeTables[week_table[WEEKDAYS[this.#date.getDay()]]]
        if(!realized_table){
            // geen rooster voor deze dag (bv. weekend)
            return []
        }
        return (realized_table.timeSlots || []).filter(slot_id=> {
            let slot = current.timeslots[slot_id]
            if(!slot || !slot.timeSlotName || !slot.start || !slot.end){
                console.warn("Skipping timeslot with missing data: " + slot_id)
                return false
            }
            return true
        }).map(slot_id=> {
            // een kopie: de momentopname zelf blijft ongewijzigd
            let slot = {...current.timeslots[slot_id]}
            slot.startDt = new Date(this.#date.getTime())
            slot.startDt.setHours(slot.start.slice(0,2), slot.start.slice(2,4), 0)
            slot.endDt = new Date(this.#date.getTime())
            slot.endDt.setHours(slot.end.slice(0,2), slot.end.slice(2,4), 0)

            return slot

        }).sort((a,b) => a.timeSlotName.rank - b.timeSlotName.rank)


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
