// Neemt de Zermelo-gegevens van één dag op als JSON-fixtures voor de tests.
//
//   node scripts/record-fixtures.mjs --portal j9qeq --token <token> --branch a --date 23-9-2026
//
// Per endpoint wordt één bestand geschreven met de rijen die de app kan opvragen. De nep-sessie
// in test/helpers/fakeSession.js past daar zelf de filters op toe, zodat de fixtures blijven
// werken als de app andere combinaties van filters of velden gaat gebruiken.
// Het token wordt nergens opgeslagen.

import {mkdir, writeFile} from "node:fs/promises"
import path from "node:path"
import {fileURLToPath} from "node:url"

process.env.TZ = "Europe/Amsterdam"

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith("--")) pairs.push([arg.slice(2), all[i + 1]])
    return pairs
}, []))

for (const required of ["portal", "token", "branch", "date"]) {
    if (!args[required]) {
        console.error("Missing --" + required)
        process.exit(1)
    }
}

const [day, month, year] = args.date.split("-").map(Number)
const date = new Date(year, month - 1, day)
const start = date.getTime() / 1000
const end = new Date(year, month - 1, day, 23, 59, 59).getTime() / 1000
const schoolYear = month < 8 ? year - 1 : year
const week = isoYearWeek(date)
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures",
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`)

function isoYearWeek(d) {
    let u = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    let dayNum = u.getUTCDay() || 7
    u.setUTCDate(u.getUTCDate() + 4 - dayNum)
    let yearStart = new Date(Date.UTC(u.getUTCFullYear(), 0, 1))
    let w = Math.ceil((((u - yearStart) / 86400000) + 1) / 7)
    return u.getUTCFullYear() + String(w).padStart(2, "0")
}

async function get(endpoint, options = {}) {
    let query = new URLSearchParams(Object.entries(options).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : String(v)]))
    let url = `https://${args.portal}.zportal.nl/api/v3/${endpoint}?${query}`
    let res = await fetch(url, {headers: {Authorization: "Bearer " + args.token}})
    let body = await res.json()
    if (body.response.status !== 200) {
        throw new Error(`${endpoint}: ${body.response.status} ${body.response.message}`)
    }
    console.log(`${endpoint}: ${body.response.data.length} rows`)
    return body.response.data
}

const APPOINTMENT_FIELDS = ["id", "appointmentInstance", "start", "end", "startTimeSlot", "endTimeSlot", "type", "groups",
    "groupsInDepartments", "locations", "locationsOfBranch", "cancelled", "cancelledReason", "modified", "teacherChanged",
    "groupChanged", "locationChanged", "timeChanged", "moved", "hidden", "changeDescription", "schedulerRemark",
    "lastModified", "base", "courses", "appointmentLastModified", "remark", "subjects", "teachers", "valid", "students"]

// Alle categorieën die de app opvraagt (zie js/controllers/changes/changes.js).
const APPOINTMENT_QUERIES = [
    {type: "activity"},
    {type: "exam"},
    {type: "lesson", modified: true},
    {type: "lesson", cancelled: true},
    {type: "lesson", valid: false},
]

const branches = await get("branches")
const branchesOfSchools = await get("branchesofschools", {branch: args.branch})
const branchOfSchool = branchesOfSchools.find(b => b.schoolYear === schoolYear)
if (!branchOfSchool) {
    throw new Error("No branchOfSchool for " + schoolYear)
}
const scope = {branchOfSchool: branchOfSchool.id, schoolInSchoolYear: branchOfSchool.schoolInSchoolYear}

const fixtures = {
    branches,
    branchesofschools: branchesOfSchools,
    departmentsofbranches: await get("departmentsofbranches", {
        branchOfSchool: scope.branchOfSchool,
        fields: ["id", "code", "educationType", "educations", "weekTimeTable", "yearOfEducation"]
    }),
    groupindepartments: await get("groupindepartments", {
        branchOfSchool: scope.branchOfSchool,
        fields: ["id", "departmentOfBranch", "name", "extendedName", "isMainGroup", "isMentorGroup"]
    }),
    studentsindepartments: await get("studentsindepartments", {
        schoolInSchoolYear: scope.schoolInSchoolYear,
        fields: ["student", "departmentOfBranch", "mentorGroup"]
    }),
    timeslotnames: await get("timeslotnames", {schoolInSchoolYear: scope.schoolInSchoolYear}),
    realizedweektimetables: await get("realizedweektimetables", {schoolInSchoolYear: scope.schoolInSchoolYear, week}),
    holidays: await get("holidays", {schoolInSchoolYear: scope.schoolInSchoolYear, fields: ["id", "name", "start", "end", "schoolInSchoolYear"]}),
    employeeabsences: await get("employeeabsences", {
        branchOfSchool: scope.branchOfSchool, startWeek: week, endWeek: week,
        fields: ["id", "start", "end", "absenceType", "employee", "absenceTypeCode", "lastModified"]
    }),
    locationofbranches: await get("locationofbranches", {branchOfSchool: scope.branchOfSchool}),
}

let appointments = new Map()
for (const query of APPOINTMENT_QUERIES) {
    let rows = await get("appointments", {branchOfSchool: scope.branchOfSchool, start, end, fields: APPOINTMENT_FIELDS, ...query})
    rows.forEach(row => appointments.set(row.id, row))
}
fixtures.appointments = [...appointments.values()].sort((a, b) => a.id - b.id)

const meta = {
    portal: args.portal,
    branch: args.branch,
    date: args.date,
    recorded: new Date().toISOString(),
    week,
    ...scope,
    // Filters die de reikwijdte van een fixture bepalen in plaats van een veld in de rijen.
    scopeParams: ["branchOfSchool", "schoolInSchoolYear"],
}

await mkdir(outDir, {recursive: true})
await writeFile(path.join(outDir, "meta.json"), JSON.stringify(meta, null, 2) + "\n")
for (const [endpoint, rows] of Object.entries(fixtures)) {
    // één rij per regel: leesbare diffs bij opnieuw opnemen
    let text = "[\n" + rows.map(row => JSON.stringify(row)).join(",\n") + "\n]\n"
    await writeFile(path.join(outDir, endpoint + ".json"), text)
}
console.log("Written to " + outDir)
