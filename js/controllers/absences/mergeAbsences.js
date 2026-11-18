/**
 * Voegt afwezigheden per docent samen (plan stap 1.1, besluit 6).
 *
 * Een docent die per lesuur is afgemeld stond er eerst acht keer op het bord. Nu één keer, met
 * de lesuren als bereik: "krh (1-3)", met een gat "krh (1-3, 6-8)". Wie de hele lesdag afwezig
 * is, krijgt alleen de naam.
 *
 * @param absences afwezigheden uit Absences.loadAll(): employee, en optioneel startSlot/endSlot
 *        (lesuur met timeSlotName.rank); zonder startSlot vanaf het begin, zonder endSlot tot het einde
 * @param ranks de rangnummers van de lesuren van vandaag, oplopend
 * @return {{employee: string, ranges: number[][], wholeDay: boolean}[]} alfabetisch op docent
 */
export function mergeAbsences(absences, ranks) {
    let byEmployee = new Map()
    absences.filter(abs => abs && abs.employee).forEach(abs => {
        if (!byEmployee.has(abs.employee)) {
            byEmployee.set(abs.employee, [])
        }
        if (!ranks.length) {
            // dag zonder lesuren: geen bereik
            return
        }
        let from = abs.startSlot ? ranks.indexOf(abs.startSlot.timeSlotName.rank) : 0
        let to = abs.endSlot ? ranks.indexOf(abs.endSlot.timeSlotName.rank) : ranks.length - 1
        if (from < 0) from = 0
        if (to < 0) to = ranks.length - 1
        byEmployee.get(abs.employee).push([Math.min(from, to), Math.max(from, to)])
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
            let wholeDay = !merged.length || (merged.length === 1 && merged[0][0] === 0 && merged[0][1] === ranks.length - 1)
            return {
                employee,
                wholeDay,
                ranges: wholeDay ? [] : merged.map(([from, to]) => [ranks[from], ranks[to]]),
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
