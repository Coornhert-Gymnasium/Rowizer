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

let showTitle = function(){
    document.querySelector("#title").textContent = "Roosterwijzigingen " + connector.date.toLocaleString("nl-NL", {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    })
}

// Alle verversloops, zodat ze na een dagwissel direct opnieuw kunnen lopen.
let loops = []
let refreshNow = function(){
    loops.forEach(loop => loop.now())
}
let last_update = null

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
        // de verversloop probeert het opnieuw (zie ChangesUiManager.refreshTable)
    }
    refreshNow()
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

// Laat op het scherm zien als de getoonde gegevens niet actueel zijn.
let showStatus = function(text){
    let status = document.querySelector("#status")
    status.textContent = text || ""
    status.style.display = text ? null : "none"
}

// Ververst elke 5 minuten, na een fout al na een minuut. Een nieuwe ronde start pas als de vorige klaar is.
let keepRefreshing = function(refresh){
    let timer = null
    let running = false
    let run = async function(){
        clearTimeout(timer)
        if(running){
            return
        }
        running = true
        let ok = false
        try {
            ok = await refresh()
        }
        catch(err){
            console.error(err)
        }
        running = false
        timer = setTimeout(run, ok ? REFRESH_INTERVAL : RETRY_INTERVAL)
    }
    run()
    let loop = {now: run}
    loops.push(loop)
    return loop
}

// Elke minuut: dagwissel, basisgegevens verversen als ze ouder zijn dan een uur, en de
// onderhoudsherlading. Staat los van het laden van data, zodat het ook werkt als dat faalt.
let started_at = Date.now()
setInterval(()=> {
    rollover.check()
    connector.refreshIfStale()

    if(Date.now() >= maintenance_at){
        let healthy = zapi.session.health.state === "ok" && last_update && Date.now() - last_update < 15*60*1000
        if(healthy){
            window.rowizerReload()
        } else {
            maintenance_at = Date.now() + 10*60*1000
        }
    }

    // Zonder basisgegevens kan niets laden. De connector probeert het zelf opnieuw; alleen als
    // dat na STARTUP_TIMEOUT nog niet gelukt is, herladen we de pagina.
    if(!connector.isReady){
        if(connector.loadError){
            showStatus("Rooster kan niet worden geladen, opnieuw proberen...")
        }
        if(Date.now() - started_at > STARTUP_TIMEOUT){
            window.rowizerReload()
        }
    }
}, RETRY_INTERVAL)

connector.waitUntilReady().then(a=>{
    keepRefreshing(async ()=>{
        let ok = await changesUiManager.refreshTable();
        if(ok){
            last_update = new Date()
            showStatus()
        }
        else{
            let time = last_update && last_update.toLocaleTimeString("nl-NL", {hour: '2-digit', minute: '2-digit'})
            showStatus("Geen verbinding met Zermelo" + (time ? ", laatste update " + time : ""))
        }
        return ok
    })

    let absences_allowed = true
    keepRefreshing(async ()=>{
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
    })

    let external_location_known = false
    keepRefreshing(async ()=>{
        if(!external_location_known){
            await outofoffice.setExternalLocationName(param_external)
            external_location_known = true
        }
        await outOfOfficeUiManager.refresh()
        document.querySelector("#outofoffice-container").style.display = outofoffice.outOfOffices.length ? null : "none"
        return true
    })
}).catch(err=>{
    console.error(err)
    showStatus("Rooster kan niet worden geladen, opnieuw proberen...")
})

showTitle()

window.rowizerStarted = true
