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

const REFRESH_INTERVAL = 5*60*1000
const RETRY_INTERVAL = 60*1000
const STARTUP_TIMEOUT = 5*60*1000
const MAINTENANCE_HOUR = 3

console.log("Rowizer loaded, version " + VERSION)
//TODO: remove this
//window.pretendLikeIts = 1717452000000/1000;

let params = new URLSearchParams(window.location.search)

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
let scheduler = new Scheduler({onRound: () => updateStatus()})
scheduler.listen()
window.rowizerScheduler = scheduler

let absences_allowed = true

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
    })

    let bar = document.querySelector("#status")
    bar.textContent = status.bar ? status.bar.text : ""
    bar.style.display = status.bar ? null : "none"
    bar.classList.toggle("error", !!status.bar && status.bar.level === "error")

    if(status.boardMessage && !connector.isReady){
        changesUiManager.showMessage(status.boardMessage)
    }

    document.querySelector("#footer").textContent = [status.code, status.updated, VERSION].filter(Boolean).join(" · ")

    let absences_container = document.querySelector("#absences-container")
    absences_container.classList.toggle("stale", status.absences === "stale")
    document.querySelector("#absences-note").textContent = status.absencesNote || ""
    if(status.absences === "hidden"){
        absences_container.style.display = "none"
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
})

// Eens per nacht de pagina herladen, zodat een nieuwe versie op het scherm komt; alleen als
// Zermelo bereikbaar is, anders later opnieuw. Vervalt zodra stap 3.5 (versiecontrole) er is.
let nextMaintenance = function(){
    let at = new Date()
    at.setHours(MAINTENANCE_HOUR, 0, 0, 0)
    if(at.getTime() <= Date.now()){
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

    if(Date.now() >= maintenance_at){
        let last_success = scheduler.task("changes")?.lastSuccess
        let healthy = zapi.session.health.state === "ok" && last_success && Date.now() - last_success < 15*60*1000
        if(healthy){
            window.rowizerReload()
        } else {
            maintenance_at = Date.now() + 10*60*1000
        }
    }

    // Zonder basisgegevens kan niets laden. De connector probeert het zelf opnieuw; alleen als
    // dat na STARTUP_TIMEOUT nog niet gelukt is, herladen we de pagina.
    if(!connector.isReady && Date.now() - started_at > STARTUP_TIMEOUT){
        window.rowizerReload()
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
                document.querySelector("#absences-container").style.display = null
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

    // Willekeurige start tussen 0 en 20 s: schermen die tegelijk opstarten (bv. na een
    // stroomstoring) lopen daarna niet gelijk.
    scheduler.start()
})

connector.onLoad = () => updateStatus()

showTitle()
updateStatus()

window.rowizerStarted = true
