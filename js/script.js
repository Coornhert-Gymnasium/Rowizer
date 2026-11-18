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
import {readSettings, rememberToken, urlWithoutToken} from "./settings.js";
import {missingSettings, showSetupScreen} from "./setupScreen.js";
import {installErrorHandlers, showDebugPanel} from "./debugPanel.js";
import {now as appNow, setClockOffset, clockOffset} from "./appTime.js";
import {measureClockOffset, clockNote, timeZoneNote} from "./clockCheck.js";
import diagnostics from "./diagnostics.js";
import {parseWindow, isResting} from "./activeWindow.js";
import {fetchVersion, shouldReload, triedStore} from "./versionCheck.js";
import {storageWorks, saveBoard, loadBoard, sanitize} from "./boardCache.js";

const REFRESH_INTERVAL = 5*60*1000
const RETRY_INTERVAL = 60*1000
const STARTUP_TIMEOUT = 5*60*1000
const MAINTENANCE_HOUR = 3

installErrorHandlers()
console.log("Rowizer loaded, version " + VERSION)

// Instellingen uit het fragment (#portal=...&token=..., aanbevolen: gaat niet naar de webserver) of de query.
let params = readSettings(window.location)
// rememberToken=1 (plan stap 3.6): token bewaren en uit de adresbalk halen
let local_storage = null
try { local_storage = window.localStorage } catch (e) { /* geen opslag */ }
if(local_storage && rememberToken(params, local_storage)){
    history.replaceState(null, "", urlWithoutToken(window.location.href))
}
let param_debug = params.get("debug") === "1"
// Met debug=1 en pretend=<epoch in seconden> negeert het bord wijzigingen van na dat moment.
if(param_debug && Number(params.get("pretend"))){
    window.pretendLikeIts = Number(params.get("pretend"))
}

// Grootte van alles op het scherm bijstellen zonder browserzoom (plan stap 2.1), bv. scale=1.2.
let param_scale = parseFloat(params.get("scale"))
if(Number.isFinite(param_scale) && param_scale >= 0.5 && param_scale <= 3){
    document.documentElement.style.setProperty("--scale", param_scale)
}

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

// Tijdzone van dit scherm (plan stap R.6): alleen melden, rechtsonder en in de diagnose.
let time_zone_note = timeZoneNote()
if(time_zone_note){
    console.warn("This screen is not on Europe/Amsterdam time (" + time_zone_note + "): today and the current period may be wrong")
    diagnostics.timeZone = time_zone_note
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
// verversvenster (plan stap 3.2), bv. active=07:00-17:00, of active=off voor altijd
let active_window = parseWindow(params.get("active"))

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

// Bewaarde stand van vandaag meteen tonen (plan stap R.16): bij een start zonder Zermelo is dat
// beter dan een leeg bord. Komen er verse gegevens, dan vervangen die de bewaarde stand.
let board_storage = local_storage && storageWorks(local_storage) ? local_storage : null
let board_scope = params.get("portal") + "|" + (param_branch || "")
let restored_at = null
if(board_storage){
    let cached = loadBoard(board_storage, {day: connector.date.toDateString(), scope: board_scope})
    if(cached){
        try {
            document.querySelector("#content-container").replaceChildren(sanitize(cached.board))
            absencesUiManager.element.replaceChildren(sanitize(cached.absences))
            document.querySelector("#absences-container").style.display = absencesUiManager.element.children.length ? null : "none"
            restored_at = cached.savedAt
            console.info("Showing the saved board of " + new Date(cached.savedAt).toLocaleTimeString("nl-NL") + " until fresh data arrives")
        } catch (e) {
            console.warn("Could not show the saved board", e)
        }
    }
}
let saveShownBoard = function(){
    // De stand is die van de laatste geslaagde wijzigingenronde, ook als dit na de afwezigen gebeurt.
    // Zelfde klok als de status (Date.now): die telt de klokcorrectie er bij het tonen zelf bij.
    let changes_success = scheduler.task("changes")?.lastSuccess
    if(!board_storage || !changes_success || !changesUiManager.tableReady || !connector.isCurrent){
        return
    }
    saveBoard(board_storage, {
        day: connector.date.toDateString(),
        scope: board_scope,
        savedAt: changes_success,
        board: document.querySelector("#content-container").innerHTML,
        absences: absencesUiManager.element.innerHTML,
    })
}

// Hulpmiddelen in de console, alleen met debug=1 (plan stap 4.2)
if(param_debug){
    window.cm = changesUiManager
    window.zc = connector
    window.ad = () => changesManager.appointments
}

// Rusttijd (plan stap 3.2): buiten het venster of op een dag zonder lessen niet verversen.
let resting = () => isResting({
    window: active_window,
    now: appNow(),
    isReady: connector.isReady && connector.isCurrent,
    lessons: connector.isReady ? connector.getTodayTimeSlots().length : 0,
    holiday: connector.isReady ? connector.holiday : null,
})
let was_resting = false

// Eén planner voor alle verversloops (plan stap R.10): elke 5 minuten, na een mislukte ronde
// na een minuut, met een willekeurige start zodat schermen niet gelijk lopen.
let scheduler = new Scheduler({isResting: resting, onRound: task => {
    // een geslaagde ronde haalt de rem van de waakhond (index.html)
    if(task.failures === 0 && window.rowizerReloadOk){
        window.rowizerReloadOk()
    }
    // wat er nu staat bewaren voor een start zonder Zermelo (plan stap R.16)
    if(task.failures === 0 && (task.name === "changes" || task.name === "absences")){
        saveShownBoard()
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
        // alleen als de laatste ronde slaagde: een storing blijft ook in rusttijd zichtbaar
        restoredAt: restored_at,
        resting: resting() && scheduler.task("changes")?.failures === 0 && !!scheduler.task("changes")?.lastSuccess,
    })

    let bar = document.querySelector("#status")
    bar.textContent = status.bar ? status.bar.text : ""
    bar.style.display = status.bar ? null : "none"
    bar.classList.toggle("error", !!status.bar && status.bar.level === "error")
    bar.classList.toggle("info", !!status.bar && status.bar.level === "info")

    if(status.boardMessage && !connector.isReady){
        changesUiManager.showMessage(status.boardMessage)
    }

    document.querySelector("#footer").textContent = [status.code, tokenNote(token_info), clockNote(clockOffset()), time_zone_note, status.updated, VERSION].filter(Boolean).join(" · ")

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
    restored_at = null
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
if(param_debug){
    window.dc = switchDay
}

let rollover = new DayRollover({
    currentDate: () => connector.date,
    fixedDate: !!param_date,
    onNewDay: switchDay,
    now: appNow,
})
// Scherm weer aan na een nacht (S14): eerst de dag controleren, dan pas verversen.
scheduler.beforeEvent = () => rollover.check()

// Eens per nacht de pagina herladen, zodat een nieuwe versie op het scherm komt; alleen als
// Zermelo bereikbaar is, anders later opnieuw. Een nieuwe versie komt sinds stap 3.5 al binnen een
// kwartier; dit blijft voor een schone start per dag (geheugen) op een scherm dat dag en nacht aan staat.
let nextMaintenance = function(){
    let at = new Date(appNow())
    at.setHours(MAINTENANCE_HOUR, 0, 0, 0)
    if(at.getTime() <= appNow()){
        at.setDate(at.getDate() + 1)
    }
    return at.getTime() + Math.floor(Math.random()*60*60*1000)
}
let maintenance_at = nextMaintenance()

// Alleen herladen (onderhoud, nieuwe versie) als Zermelo bereikbaar is en het bord actueel:
// anders staat er na het herladen niets meer op.
let healthy = function(){
    let changes_task = scheduler.task("changes")
    let last_success = changes_task?.lastSuccess
    // in rusttijd is de laatste ronde vanzelf ouder dan een kwartier
    let recent = last_success && (Date.now() - last_success < 15*60*1000 || (resting() && changes_task.failures === 0))
    return zapi.session.health.state === "ok" && !!recent
}

// Elke minuut: dagwissel, basisgegevens verversen als ze ouder zijn dan een uur, de
// onderhoudsherlading en de status. Staat los van het laden van data, zodat het ook werkt als dat faalt.
let started_at = Date.now()
setInterval(()=> {
    rollover.check()
    changesUiManager.markTime()

    // Begin van het verversvenster: direct verversen, niet pas na de volgende geplande ronde.
    let rest = resting()
    if(was_resting && !rest){
        console.info("Active window started, refreshing")
        connector.refreshIfStale()
        scheduler.runNow()
    } else if(!rest){
        connector.refreshIfStale()
    }
    was_resting = rest

    if(appNow() >= maintenance_at){
        if(healthy()){
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
    scheduler.add("changes", () => changesUiManager.refreshTable(), {interval: REFRESH_INTERVAL, retryInterval: RETRY_INTERVAL, rest: true})

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
    }, {interval: REFRESH_INTERVAL, retryInterval: RETRY_INTERVAL, rest: true})

    let external_location_known = false
    scheduler.add("outofoffice", async ()=>{
        if(!external_location_known){
            await outofoffice.setExternalLocationName(param_external)
            external_location_known = true
        }
        await outOfOfficeUiManager.refresh()
        document.querySelector("#outofoffice-container").style.display = outofoffice.outOfOffices.length ? null : "none"
        return true
    }, {interval: REFRESH_INTERVAL, retryInterval: RETRY_INTERVAL, rest: true})

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

    // Nieuwe versie op de webserver (plan stap 3.5): herladen. Gaat naar de eigen webserver, niet
    // naar Zermelo. Is het bord niet gezond, dan het volgende kwartier opnieuw.
    scheduler.add("version", async ()=>{
        let remote = await fetchVersion({url: new URL("./version.js", import.meta.url)})
        if(shouldReload({loaded: VERSION, remote, tried: triedStore.get()})){
            if(!healthy()){
                console.info("New version " + remote + " available, waiting until the board is up to date")
                return true
            }
            triedStore.set(remote)
            window.rowizerReload("new version " + remote)
        } else if(remote && remote !== VERSION){
            console.warn("Version " + remote + " is on the server, but " + VERSION + " was loaded again (cache?)")
        }
        return true
    }, {interval: 15*60*1000, retryInterval: 15*60*1000})

    // Start binnen 2 s; de latere rondes krijgen ±10% spreiding, zodat schermen die tegelijk
    // opstarten (bv. na een stroomstoring) daarna niet gelijk lopen.
    scheduler.start()
})

connector.onLoad = () => updateStatus()

showTitle()
updateStatus()

window.rowizerStarted = true
