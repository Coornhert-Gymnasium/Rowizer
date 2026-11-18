import "./helpers/tz.js"
import "./helpers/quiet.js"
import test from "node:test"
import assert from "node:assert/strict"
import {appointmentText} from "../js/views/changes/appointmentText.js"

const mainGroup = {name: "hv1c", extendedName: "hv1c", isMainGroup: true}
const cluster = {name: "fa5", extendedName: "h3.fa5", isMainGroup: false}

function appointment(overrides = {}) {
    return {type: "lesson", subjects: ["fa"], teachers: ["cir"], locations: ["a268"], valid: true, cancelled: false, ...overrides}
}

test("les van een klas: klas, vak, docent, lokaal", () => {
    assert.equal(appointmentText(mainGroup, appointment()), "hv1c fa cir a268")
})

test("les van een cluster: geen vak", () => {
    assert.equal(appointmentText(cluster, appointment()), "h3.fa5 cir a268")
})

test("uitval", () => {
    assert.equal(appointmentText(mainGroup, appointment({cancelled: true})), "hv1c fa cir  vervalt")
    assert.equal(appointmentText(mainGroup, appointment({valid: false})), "hv1c fa cir  vervalt")
})

test("toets vervalt", () => {
    assert.equal(appointmentText(cluster, appointment({type: "exam", cancelled: true})), "h3.fa5 cir  toets vervalt")
})

test("activiteit: onderwerp met spatie in plaats van _", () => {
    assert.equal(appointmentText(mainGroup, appointment({type: "activity", subjects: ["Act_huu"], teachers: ["men04"]})),
        "hv1c Act huu men04 a268")
})

test("vak afgekort tot 6 tekens, meer vakken als +n", () => {
    assert.equal(appointmentText(mainGroup, appointment({subjects: ["natuurkunde", "sk"]})), "hv1c natuur+1 cir a268")
})

test("geen vak: opmerking van de roostermaker", () => {
    assert.equal(appointmentText(mainGroup, appointment({subjects: [], remark: "mentor"})), "hv1c mentor cir a268")
})

test("kortste lokaalnaam wordt getoond", () => {
    assert.equal(appointmentText(mainGroup, appointment({locations: ["leerplein a", "a030"]})), "hv1c fa cir a030")
})

test("meer dan twee docenten: twee namen en het aantal dat niet getoond wordt", () => {
    assert.equal(appointmentText(mainGroup, appointment({teachers: ["a", "b", "c"]})), "hv1c fa a,b+1 a268")
    assert.equal(appointmentText(mainGroup, appointment({teachers: ["a", "b", "c", "d", "e"]})), "hv1c fa a,b+3 a268")
    assert.equal(appointmentText(mainGroup, appointment({teachers: ["a", "b"]})), "hv1c fa a,b a268")
})
