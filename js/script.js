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

const REFRESH_INTERVAL = 5*60*1000
const RETRY_INTERVAL = 60*1000
const STARTUP_TIMEOUT = 5*60*1000

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

let dayChanged = function(){
    changesManager.reset()
    changesUiManager.refreshTable()
    showTitle()
}
window.dc = dayChanged

// Laat op het scherm zien als de getoonde gegevens niet actueel zijn.
let showStatus = function(text){
    let status = document.querySelector("#status")
    status.textContent = text || ""
    status.style.display = text ? null : "none"
}

// Ververst elke 5 minuten, na een fout al na een minuut. Een nieuwe ronde start pas als de vorige klaar is.
let keepRefreshing = function(refresh){
    let run = async function(){
        let ok = false
        try {
            ok = await refresh()
        }
        catch(err){
            console.error(err)
        }
        setTimeout(run, ok ? REFRESH_INTERVAL : RETRY_INTERVAL)
    }
    run()
}

// Dagwissel-check staat bewust los van het laden van data: ook als het laden
// faalt (bv. op een dag zonder rooster) moet de pagina weer herladen worden.
let last_checked_date = new Date();
let started_at = Date.now()
setInterval(()=> {
    if(last_checked_date.toDateString() !== new Date().toDateString()){
        window.rowizerReload()
    }
    // Zonder basisgegevens (bv. door een netwerkfout bij het opstarten) kan niets laden: probeer het opnieuw.
    else if(!connector.isReady && (connector.loadError || Date.now() - started_at > STARTUP_TIMEOUT)){
        showStatus("Rooster kan niet worden geladen, opnieuw proberen...")
        window.rowizerReload()
    }
}, RETRY_INTERVAL)

connector.waitUntilReady().then(a=>{
    let last_update = null
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
            if(err instanceof ZermeloAuthorizationError){
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
