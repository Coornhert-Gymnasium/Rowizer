/**
 * Voegt afwezigheden per docent samen (plan stap 1.1, besluit 6).
 *
 * Een docent die per lesuur is afgemeld stond er eerst acht keer op het bord. Nu één keer, met
 * de lesuren als bereik: "krh (1-3)", met een gat "krh (1-3, 6-8)". Wie alle lesuren van de
 * dag afwezig is, krijgt alleen de naam.
 *
 * Een lesuur telt alleen mee als de afwezigheid er echt mee overlapt. Een afwezigheid die geen
 * enkel lesuur raakt (in de pauze, voor of na schooltijd), komt niet op het bord.
 *
 * @param absences afwezigheden met employee, start en end (epoch in seconden)
 * @param slots de lesuren van vandaag (connector.getTodayTimeSlots()): startDt, endDt en
 *        timeSlotName.rank, oplopend
 * @return {{employee: string, ranges: number[][], wholeDay: boolean}[]} alfabetisch op docent
 */
export function mergeAbsences(absences, slots) {
    let byEmployee = new Map()
    absences.filter(abs => abs && abs.employee).forEach(abs => {
        if (!slots.length) {
            // dag zonder lesuren: alleen de naam
            byEmployee.set(abs.employee, byEmployee.get(abs.employee) || [])
            return
        }
        let covered = []
        slots.forEach((slot, index) => {
            if (slot.startDt.getTime()/1000 < abs.end && slot.endDt.getTime()/1000 > abs.start) {
                covered.push(index)
            }
        })
        if (!covered.length) {
            return
        }
        if (!byEmployee.has(abs.employee)) {
            byEmployee.set(abs.employee, [])
        }
        byEmployee.get(abs.employee).push([covered[0], covered[covered.length - 1]])
    })

    return [...byEmployee.entries()]
        .sort(([a], [b]) => a.localeCompare(b, "nl"))
        .map(([employee, spans]) => {
            spans.sort((a, b) => a[0] - b[0] || a[1] - b[1])
            let merged = []
            spans.forEach(([from, to]) => {
                let last = merged[merged.length - 1]
                // overlappend of aansluitend (volgend lesuur): samenvoegen
                if (last && from <= last[1] + 1) {
                    last[1] = Math.max(last[1], to)
                } else {
                    merged.push([from, to])
                }
            })
            let wholeDay = !slots.length || (merged.length === 1 && merged[0][0] === 0 && merged[0][1] === slots.length - 1)
            return {
                employee,
                wholeDay,
                ranges: wholeDay ? [] : merged.map(([from, to]) => [slots[from].timeSlotName.rank, slots[to].timeSlotName.rank]),
            }
        })
}

/** "krh", "krh (3)", "krh (1-3, 6-8)" */
export function absenceText(merged) {
    if (merged.wholeDay) {
        return merged.employee
    }
    return merged.employee + " (" + merged.ranges.map(([from, to]) => from === to ? String(from) : from + "-" + to).join(", ") + ")"
}
