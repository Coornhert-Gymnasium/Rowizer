/**
 * Eén planner voor alle verversloops (plan stap R.10).
 *
 * Per taak: een interval, een korter interval na een mislukte ronde, de laatste geslaagde tijd
 * en de laatste fout. Taken starten met een willekeurige vertraging, zodat schermen niet gelijk
 * lopen. Een ronde begint pas als de vorige van dezelfde taak klaar is. Na elke afgeronde ronde
 * (geslaagd of niet) wordt de hartslag bijgewerkt; de waakhond in index.html kijkt daarnaar.
 */
const EVENT_MIN_INTERVAL = 60*1000

export default class Scheduler {
    #tasks = []
    #started = false

    /**
     * @param options.now, options.random, options.setTimeout, options.clearTimeout voor de tests
     * @param options.startDelay maximale willekeurige startvertraging, standaard 20 s
     * @param options.onRound (task) => void, na elke afgeronde ronde
     */
    constructor(options = {}) {
        this.now = options.now || (() => Date.now())
        this.random = options.random || Math.random
        this.setTimeout = options.setTimeout || ((fn, ms) => setTimeout(fn, ms))
        this.clearTimeout = options.clearTimeout || (id => clearTimeout(id))
        this.startDelay = options.startDelay ?? 20*1000
        this.onRound = options.onRound || (() => {})
        this.heartbeat = null
    }

    /**
     * @param name naam voor de status en de diagnose
     * @param run async () => boolean; true = geslaagd. Een fout telt als mislukt.
     * @param options.interval na een geslaagde ronde, standaard 5 min
     * @param options.retryInterval na een mislukte ronde, standaard 1 min
     */
    add(name, run, options = {}) {
        let task = {
            name,
            run,
            interval: options.interval ?? 5*60*1000,
            retryInterval: options.retryInterval ?? 60*1000,
            addedAt: this.now(),
            lastAttempt: null,
            lastSuccess: null,
            lastError: null,
            failures: 0,
            running: false,
            timer: null,
        }
        this.#tasks.push(task)
        if (this.#started) {
            this.#schedule(task, Math.floor(this.random()*this.startDelay))
        }
        return task
    }

    get tasks() {
        return this.#tasks.map(t => ({
            name: t.name, addedAt: t.addedAt, lastAttempt: t.lastAttempt, lastSuccess: t.lastSuccess,
            lastError: t.lastError, failures: t.failures, running: t.running,
        }))
    }

    task(name) {
        return this.tasks.find(t => t.name === name)
    }

    start() {
        this.#started = true
        this.#tasks.forEach(task => this.#schedule(task, Math.floor(this.random()*this.startDelay)))
    }

    /** Alle taken (of één) direct laten lopen, bv. na een dagwissel of als het netwerk terug is. */
    runNow(name) {
        this.#tasks.filter(t => !name || t.name === name).forEach(task => this.#runTask(task))
    }

    /**
     * Na een gebeurtenis (netwerk terug, scherm weer zichtbaar) direct verversen, maar hoogstens
     * eens per minuut: een scherm dat steeds aan en uit gaat mag het verzoekbudget niet opmaken.
     * @return {boolean} of er ververst wordt
     */
    runAfterEvent() {
        if (this.lastEventRun && this.now() - this.lastEventRun < EVENT_MIN_INTERVAL) {
            return false
        }
        this.lastEventRun = this.now()
        this.runNow()
        return true
    }

    /** Hooks voor de browser: direct verversen als het netwerk terugkomt of het scherm weer zichtbaar wordt. */
    listen(target = globalThis.window, doc = globalThis.document) {
        if (target && target.addEventListener) {
            target.addEventListener("online", () => this.runAfterEvent())
        }
        if (doc && doc.addEventListener) {
            doc.addEventListener("visibilitychange", () => {
                if (doc.visibilityState === "visible") {
                    this.runAfterEvent()
                }
            })
        }
    }

    #schedule(task, delay) {
        this.clearTimeout(task.timer)
        task.timer = this.setTimeout(() => this.#runTask(task), delay)
    }

    async #runTask(task) {
        this.clearTimeout(task.timer)
        if (task.running) {
            return
        }
        task.running = true
        task.lastAttempt = this.now()
        let ok = false
        try {
            ok = await task.run()
            if (ok) {
                task.lastError = null
            }
        } catch (e) {
            console.error("Task " + task.name + " failed", e)
            task.lastError = e
        }
        task.running = false
        if (ok) {
            task.lastSuccess = this.now()
            task.failures = 0
        } else {
            task.failures++
        }
        this.heartbeat = this.now()
        if (globalThis.window) {
            window.rowizerHeartbeat = this.heartbeat
        }
        this.#schedule(task, ok ? task.interval : task.retryInterval)
        try {
            this.onRound(task)
        } catch (e) {
            console.error(e)
        }
    }
}
