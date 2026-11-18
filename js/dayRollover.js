/**
 * Dagwissel zonder paginaherlading (plan stap R.7).
 *
 * check() wordt elke minuut aangeroepen. Is het een nieuwe dag, dan kiest elk scherm een
 * willekeurig moment in de eerste `spread` milliseconden, zodat niet alle schermen van een
 * school in dezelfde minuut Zermelo bevragen. Op dat moment wordt onNewDay(datum) aangeroepen.
 */
export default class DayRollover {
    #pending = null
    #running = false

    /**
     * @param options.currentDate () => Date, de getoonde dag
     * @param options.onNewDay async (Date) => void
     * @param options.fixedDate true als de datum vastligt (URL-parameter date): nooit wisselen
     * @param options.spread spreiding in ms, standaard 10 minuten
     * @param options.now, options.random voor de tests
     */
    constructor(options) {
        this.currentDate = options.currentDate
        this.onNewDay = options.onNewDay
        this.fixedDate = !!options.fixedDate
        this.spread = options.spread ?? 10*60*1000
        this.now = options.now || (() => Date.now())
        this.random = options.random || Math.random
    }

    /** Het moment waarop de volgende wissel gepland staat, of null. */
    get pendingAt() {
        return this.#pending ? this.#pending.at : null
    }

    check() {
        if (this.fixedDate || this.#running) {
            return false
        }
        let today = new Date(this.now())
        today.setHours(0, 0, 0, 0)
        if (today.getTime() === this.currentDate().getTime()) {
            this.#pending = null
            return false
        }
        if (!this.#pending || this.#pending.day !== today.getTime()) {
            this.#pending = {day: today.getTime(), at: this.now() + Math.floor(this.random()*this.spread)}
        }
        if (this.now() < this.#pending.at) {
            return false
        }
        this.#pending = null
        this.#running = true
        Promise.resolve()
            .then(() => this.onNewDay(today))
            .catch(e => console.error("Day switch failed", e))
            .finally(() => { this.#running = false })
        return true
    }
}
