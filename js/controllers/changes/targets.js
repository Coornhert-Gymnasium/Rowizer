/**
 * Voor wie staat een afspraak op het bord (plan stap 4.3)? Eerst deed de view dit; nu de controller.
 *
 * - Afspraak met groepen: elke groep met haar afdeling.
 * - Afspraak zonder groepen maar met leerlingen (keuzelessen, toetsen): per afdeling van die
 *   leerlingen een nepgroep. De naam is het alfabetisch eerste vak (6 tekens); bij toetsen of
 *   zonder vak komt de opmerking van de roostermaker erbij.
 *
 * Onbekende groepen slaat dit over (Changes telt en meldt ze al); onbekende leerlingen worden gemeld.
 *
 * @param appointment
 * @param connector met getGroupInDepartment, getDepartmentOfBranch, getStudentInDepartment
 * @return {{group: object, department: object, fake?: boolean}[]} fake = nepgroep
 */
export function appointmentTargets(appointment, connector) {
    let targets = []
    if (appointment.groupsInDepartments && appointment.groupsInDepartments.length) {
        appointment.groupsInDepartments.forEach(group_id => {
            let group = connector.getGroupInDepartment(group_id)
            let department = group && connector.getDepartmentOfBranch(group.departmentOfBranch)
            if (department) {
                targets.push({group, department})
            }
        })
        return targets
    }

    if (!appointment.students || !appointment.students.length) {
        return targets
    }
    let departments = new Set()
    let unknown_students = 0
    appointment.students.forEach(student => {
        let student_in_department = connector.getStudentInDepartment(student)
        if (student_in_department) {
            departments.add(student_in_department.departmentOfBranch)
        } else {
            unknown_students++
        }
    })
    if (unknown_students) {
        console.warn("Appointment " + appointment.id + ": " + unknown_students + " unknown student(s)")
    }
    departments.forEach(department_id => {
        let department = connector.getDepartmentOfBranch(department_id)
        if (!department) {
            console.warn("Appointment " + appointment.id + ": unknown department " + department_id)
            return
        }
        // alfabetisch eerste vak, zoals het bord altijd toonde (zie appointmentText.js)
        let subject = [...(appointment.subjects || [])].sort()[0]
        let name = subject ? subject.substring(0, 6) : ""
        if (appointment.type === "exam" || !subject) {
            name = (name + " " + (appointment.remark || "")).trim()
        }
        let group = {id: appointment.id, departmentOfBranch: department_id, name, extendedName: name, isMainGroup: false, isMentorGroup: false}
        targets.push({group, department, fake: true})
    })
    return targets
}
