import {ZermeloApi} from "./zermelo/zermelo.js";
import {Changes} from "./controllers/changes/changes.js";
import Absences from "./controllers/absences/absences.js";
import {ZermeloAuthorizationError} from "./zermelo/utils/errors.js";
import ZermeloConnector from "./connectors/zermeloConnector.js";
import {ChangesUiManager} from "./views/changes/changesUiManager.js";
import AbsenceEntity from "./controllers/absences/absenceEntity.js";
import {AbsencesUiManager} from "./views/absences/absencesUiManager.js";
import OutOfOffice from "./controllers/outofoffice/outOfOffice.js";
import {OutOfOfficeUiManager} from "./views/outOfOffice/outOfOfficeUiManager.js";
import {VERSION} from "./version.js";
import DayRollover from "./dayRollover.js";
import Scheduler from "./scheduler.js";
import {computeStatus} from "./status.js";
import {checkToken, tokenNote} from "./tokenCheck.js";
import {readSettings} from "./settings.js";
import {missingSettings, showSetupScreen} from "./setupScreen.js";
import {installErrorHandlers, showDebugPanel} from "./debugPanel.js";
import {now as appNow, setClockOffset, clockOffset} from "./appTime.js";
import {measureClockOffset, clockNote} from "./clockCheck.js";
import diagnostics from "./diagnostics.js";

const REFRESH_INTERVAL = 5*60*1000
const RETRY_INTERVAL = 60*1000
const STARTUP_TIMEOUT = 5*60*1000
const MAINTENANCE_HOUR = 3

installErrorHandlers()
console.log("Rowizer loaded, version " + VERSION)
//TODO: remove this
//window.pretendLikeIts = 1717452000000/1000;

// Instellingen uit het fragment (#portal=...&token=..., aanbevolen: gaat niet naar de webserver) of de query.
let params = readSettings(window.location)
let param_debug = params.get("debug") === "1"

// Zonder portal of token kan niets (plan stap 1.4): instelscherm, geen verzoeken naar Zermelo.
// De waakhond (index.html) krijgt een hartslag, want herladen lost dit niet op. De lege belofte
// houdt de rest van deze module tegen.
let missing = missingSettings(params)
if(missing.length){
    console.warn("Rowizer is not configured, missing: " + missing.join(", "))
    showSetupScreen(missing)
    window.rowizerStarted = true
    window.rowizerHeartbeat = Date.now()
    setInterval(() => { window.rowizerHeartbeat = Date.now() }, 60*1000)
    await new Promise(() => {})
}

// Klok controleren voordat we bepalen welke dag het is (plan stap R.6). Hoogstens 5 seconden:
// zonder antwoord gaan we uit van de eigen klok.
let checkClock = async function(){
    let offset = await Promise.race([
        measureClockOffset({url: location.pathname}),
        new Promise(resolve => setTimeout(() => resolve(null), 5000)),
    ])
    if(offset !== null){
        diagnostics.clockOffset = offset
        if(setClockOffset(offset)){
            console.warn("Clock of this screen is off by " + Math.round(offset/1000) + " s, using the web server's time")
        }
    }
}
try {
    await checkClock()
} catch (e) {
    console.warn("Could not check the clock", e)
}

//portal: naam vh portal, token: api-token, branch: branchcode (vestigingscode)

let param_date = params.get("date");
let param_branch = params.get("branch");
let param_ignore = params.get("departmentsIgnore");
let param_merge = params.get("mergeAppointments")
let param_external = params.get("external")
param_external = param_external ? param_external : "extern"

var zapi = new ZermeloApi({
    portal: params.get("portal"),
    token: params.get("token"),
    branch: param_branch
});

let connector = new ZermeloConnector(zapi,param_date ? param_date : undefined, {branch: param_branch? param_branch : undefined, ignore_departments:param_ignore ? param_ignore.split(",") : []})
AbsenceEntity.Connector = connector

var changesManager = new Changes(connector, {
    merge_multiple_hour_span: !(param_merge && param_merge === "false")
});
var changesUiManager = new ChangesUiManager(document.querySelector("#content-container"), connector, changesManager)

var absences = new Absences(connector)
var absencesUiManager = new AbsencesUiManager(document.querySelector("#absences-container>div"),connector,absences);


var outofoffice = new OutOfOffice(connector)
var outOfOfficeUiManager = new OutOfOfficeUiManager(document.querySelector("#outofoffice-inner-container"),connector,outofoffice)

window.cm = changesUiManager
window.zc = connector

// Eén planner voor alle verversloops (plan stap R.10): elke 5 minuten, na een mislukte ronde
// na een minuut, met een willekeurige start zodat schermen niet gelijk lopen.
let scheduler = new Scheduler({onRound: task => {
    // een geslaagde ronde haalt de rem van de waakhond (index.html)
    if(task.failures === 0 && window.rowizerReloadOk){
        window.rowizerReloadOk()
    }
    updateStatus()
}})
scheduler.listen()
window.rowizerScheduler = scheduler

let absences_allowed = true
let token_info = null

// Laat op het scherm zien hoe actueel de gegevens zijn (besluit 9: neutrale tekst, de oorzaak
// als korte code rechtsonder).
let updateStatus = function(){
    let status = computeStatus({
        now: Date.now(),
        isReady: connector.isReady,
        loadError: connector.loadError,
        health: zapi.session.health,
        changes: scheduler.task("changes"),
        changesFailure: changesUiManager.lastFailure,
        absences: absences_allowed ? scheduler.task("absences") : undefined,
        clockOffset: clockOffset(),
    })

    let bar = document.querySelector("#status")
    bar.textContent = status.bar ? status.bar.text : ""
    bar.style.display = status.bar ? null : "none"
    bar.classList.toggle("error", !!status.bar && status.bar.level === "error")

    if(status.boardMessage && !connector.isReady){
        changesUiManager.showMessage(status.boardMessage)
    }

    document.querySelector("#footer").textContent = [status.code, tokenNote(token_info), clockNote(clockOffset()), status.updated, VERSION].filter(Boolean).join(" · ")

    let absences_container = document.querySelector("#absences-container")
    absences_container.classList.toggle("stale", status.absences === "stale")
    document.querySelector("#absences-note").textContent = status.absencesNote || ""
    if(status.absences === "hidden"){
        absences_container.style.display = "none"
    }

    if(param_debug){
        showDebugPanel({scheduler, session: zapi.session, connector, version: VERSION})
    }
}

let showTitle = function(){
    document.querySelector("#title").textContent = "Roosterwijzigingen " + connector.date.toLocaleString("nl-NL", {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    })
}

// Nieuwe dag (plan stap R.7): gisteren weghalen, basisgegevens van vandaag laden en verversen,
// zonder de pagina te herladen. Zolang de basisgegevens niet geladen zijn, toont het bord een melding.
let switchDay = async function(date){
    console.info("New day: " + date.toDateString())
    let loading = connector.switchDay(date)
    showTitle()
    changesManager.reset()
    changesUiManager.showMessage("Rooster van " + date.toLocaleDateString("nl-NL", {weekday: "long", day: "numeric", month: "long"}) + " wordt geladen")
    absences.reset()
    absencesUiManager.element.replaceChildren()
    document.querySelector("#absences-container").style.display = "none"
    outofoffice.reset()
    outOfOfficeUiManager.element.replaceChildren()
    document.querySelector("#outofoffice-container").style.display = "none"
    try {
        await loading
    } catch (e) {
        // de verversronde probeert het opnieuw (zie ChangesUiManager.refreshTable)
    }
    scheduler.runNow()
}
window.dc = switchDay

let rollover = new DayRollover({
    currentDate: () => connector.date,
    fixedDate: !!param_date,
    onNewDay: switchDay,
    now: appNow,
})

// Eens per nacht de pagina herladen, zodat een nieuwe versie op het scherm komt; alleen als
// Zermelo bereikbaar is, anders later opnieuw. Vervalt zodra stap 3.5 (versiecontrole) er is.
let nextMaintenance = function(){
    let at = new Date(appNow())
    at.setHours(MAINTENANCE_HOUR, 0, 0, 0)
    if(at.getTime() <= appNow()){
        at.setDate(at.getDate() + 1)
    }
    return at.getTime() + Math.floor(Math.random()*60*60*1000)
}
let maintenance_at = nextMaintenance()

// Elke minuut: dagwissel, basisgegevens verversen als ze ouder zijn dan een uur, de
// onderhoudsherlading en de status. Staat los van het laden van data, zodat het ook werkt als dat faalt.
let started_at = Date.now()
setInterval(()=> {
    rollover.check()
    connector.refreshIfStale()

    if(appNow() >= maintenance_at){
        let last_success = scheduler.task("changes")?.lastSuccess
        let healthy = zapi.session.health.state === "ok" && last_success && Date.now() - last_success < 15*60*1000
        if(healthy){
            window.rowizerReload("nightly maintenance")
        } else {
            maintenance_at = appNow() + 10*60*1000
        }
    }

    // Zonder basisgegevens kan niets laden. Heeft de connector een fout, dan probeert hij het zelf
    // opnieuw (herladen helpt dan niet) en is er dus leven: hartslag voor de waakhond. Is er na
    // STARTUP_TIMEOUT nog geen enkele laadpoging afgerond, dan hangt er iets: herladen.
    if(!connector.isReady){
        if(connector.loadError){
            window.rowizerHeartbeat = Date.now()
        } else if(Date.now() - started_at > STARTUP_TIMEOUT){
            window.rowizerReload("startup stuck")
        }
    }
    updateStatus()
}, RETRY_INTERVAL)

connector.waitUntilReady().then(()=>{
    scheduler.add("changes", () => changesUiManager.refreshTable(), {interval: REFRESH_INTERVAL, retryInterval: RETRY_INTERVAL})

    scheduler.add("absences", async ()=>{
        if(!absences_allowed){
            return true
        }
        try {
            let ok = await absencesUiManager.refresh()
            if(ok){
                // alleen een afwezigenregel als er afwezigen zijn (plan stap 1.5): geen leeg
                // "Afwezig:" in het weekend of op een dag zonder afwezigen
                document.querySelector("#absences-container").style.display = absencesUiManager.element.children.length ? null : "none"
            }
            return ok
        }
        catch(err){
            // Alleen een ontbrekend recht zet de afwezigen uit; een verlopen token (auth) niet.
            if(err instanceof ZermeloAuthorizationError && err.kind === "permission"){
                console.log("No authorization for absences")
                absences_allowed = false
                return true
            }
            throw err
        }
    }, {interval: REFRESH_INTERVAL, retryInterval: RETRY_INTERVAL})

    let external_location_known = false
    scheduler.add("outofoffice", async ()=>{
        if(!external_location_known){
            await outofoffice.setExternalLocationName(param_external)
            external_location_known = true
        }
        await outOfOfficeUiManager.refresh()
        document.querySelector("#outofoffice-container").style.display = outofoffice.outOfOffices.length ? null : "none"
        return true
    }, {interval: REFRESH_INTERVAL, retryInterval: RETRY_INTERVAL})

    // Zelfcontrole van het token (plan stap R.12): eens per dag, na een fout over een uur opnieuw.
    scheduler.add("token", async ()=>{
        token_info = await checkToken(zapi.session)
        return true
    }, {interval: 24*60*60*1000, retryInterval: 60*60*1000})

    // Klok elk uur opnieuw controleren; na een correctie ziet de dagwissel een andere dag.
    scheduler.add("clock", async ()=>{
        await checkClock()
        rollover.check()
        return true
    }, {interval: 60*60*1000, retryInterval: 15*60*1000})

    // Willekeurige start tussen 0 en 20 s: schermen die tegelijk opstarten (bv. na een
    // stroomstoring) lopen daarna niet gelijk.
    scheduler.start()
})

connector.onLoad = () => updateStatus()

showTitle()
updateStatus()

window.rowizerStarted = true
