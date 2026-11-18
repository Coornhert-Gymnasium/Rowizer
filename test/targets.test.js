import "./helpers/tz.js"
import "./helpers/quiet.js"
import test from "node:test"
import assert from "node:assert/strict"
import {appointmentTargets} from "../js/controllers/changes/targets.js"
import {buildBoard} from "./helpers/board.js"

const connector = {
    getGroupInDepartment: id => ({1: {id: 1, name: "hv1a", departmentOfBranch: 10}, 2: {id: 2, name: "x", departmentOfBranch: 99}})[id],
    getDepartmentOfBranch: id => ({10: {id: 10, yearOfEducation: 1}, 20: {id: 20, yearOfEducation: 4}})[id],
    getStudentInDepartment: s => ({s1: {departmentOfBranch: 20}, s2: {departmentOfBranch: 20}, s3: {departmentOfBranch: 10}})[s],
}

test("groepen: elke bekende groep met haar afdeling", () => {
    let targets = appointmentTargets({id: 5, groupsInDepartments: [1, 2, 3], students: ["s1"]}, connector)
    assert.deepEqual(targets.map(t => [t.group.name, t.department.id, !!t.fake]), [["hv1a", 10, false]])
})

test("alleen leerlingen: één nepgroep per afdeling, met het eerste vak", () => {
    let targets = appointmentTargets({id: 6, type: "lesson", groupsInDepartments: [], students: ["s1", "s2", "s3", "onbekend"], subjects: ["netl", "entl"]}, connector)
    assert.deepEqual(targets.map(t => [t.group.name, t.department.id, t.fake]), [["entl", 20, true], ["entl", 10, true]])
    assert.equal(targets[0].group.id, 6)
})

test("toets of geen vak: opmerking erbij", () => {
    let exam = appointmentTargets({id: 7, type: "exam", groupsInDepartments: [], students: ["s1"], subjects: ["wiskunde"], remark: "SE 2"}, connector)
    assert.equal(exam[0].group.name, "wiskun SE 2")
    let none = appointmentTargets({id: 8, type: "lesson", groupsInDepartments: [], students: ["s1"], subjects: [], remark: "excursie"}, connector)
    assert.equal(none[0].group.name, "excursie")
})

test("geen groepen en geen leerlingen: niets", () => {
    assert.deepEqual(appointmentTargets({id: 9, groupsInDepartments: [], students: []}, connector), [])
})

test("demodag: elke afspraak heeft targets, ook de keuzelessen", async () => {
    let {changes} = await buildBoard()
    await changes.loadData()
    let apps = Object.values(changes.appointments)
    assert.ok(apps.every(a => Array.isArray(a.targets)))
    assert.ok(apps.some(a => a.targets.some(t => t.fake)), "keuzelessen of toetsen met alleen leerlingen")
})
