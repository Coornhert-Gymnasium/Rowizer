/*
 * Service worker (plan stap R.17): de eigen bestanden ook als de webhost (GitHub Pages) even niet
 * bereikbaar is, bv. na een stroomstoring als het netwerk er eerder is dan internet.
 *
 * - Netwerk eerst, de cache alleen als terugval: een nieuwe versie (stap 3.5) komt dus gewoon binnen.
 * - Alleen GET-verzoeken naar de eigen webserver. Zermelo (ander domein) en de HEAD-verzoeken van
 *   de waakhond en de klokcontrole gaan er buiten om: een bewaarde Date-header zou de klok verzetten.
 * - Antwoordt de webhost niet binnen 6 seconden op de pagina zelf, dan komt de hele pagina uit de
 *   cache: ook alle bestanden die die pagina daarna laadt. Zo komen er nooit oude en nieuwe modules
 *   door elkaar (dat zou kunnen als elk bestand apart zou terugvallen).
 * - Uitzetten: open het bord met sw=0 in het adres; met sw=1 staat hij weer aan (zie index.html).
 */
const CACHE = "rowizer-v1"
const NETWORK_TIMEOUT = 6000

// pagina's (clients) die uit de cache zijn gestart: die krijgen alles uit de cache
const fromCache = new Set()

self.addEventListener("install", () => self.skipWaiting())

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        // oude caches van een vorige worker opruimen
        for (const name of await caches.keys()) {
            if (name !== CACHE) {
                await caches.delete(name)
            }
        }
        await self.clients.claim()
    })())
})

self.addEventListener("fetch", event => {
    let request = event.request
    if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
        return
    }
    event.respondWith(request.mode === "navigate" ? page(event) : file(event))
})

function store(cache, key, response) {
    if (response.ok && response.type === "basic") {
        cache.put(key, response.clone())
    }
    return response
}

/** De pagina zelf: netwerk, na 6 s of bij een fout de bewaarde versie. */
async function page(event) {
    let cache = await caches.open(CACHE)
    // onder één sleutel: het adres verschilt per scherm alleen in query en fragment
    let key = new URL("./", self.registration.scope).href
    let network = fetch(event.request).then(response => store(cache, key, response))
    network.catch(() => {}) // een fout na de time-out niet als onafgehandeld melden
    let timeout = new Promise(resolve => setTimeout(() => resolve(null), NETWORK_TIMEOUT))
    try {
        let response = await Promise.race([network, timeout])
        if (response) {
            return response
        }
    } catch (e) {
        // geen netwerk: hieronder de cache
    }
    let cached = await cache.match(key, {ignoreSearch: true})
    if (cached) {
        if (event.resultingClientId) {
            fromCache.add(event.resultingClientId)
        }
        return cached
    }
    // niets bewaard: toch op het netwerk wachten (of de fout doorgeven)
    return network
}

/** Een bestand van de pagina: van een pagina uit de cache ook uit de cache, anders netwerk eerst. */
async function file(event) {
    let cache = await caches.open(CACHE)
    let request = event.request
    if (fromCache.has(event.clientId)) {
        let cached = await cache.match(request)
        if (cached) {
            return cached
        }
    }
    try {
        return store(cache, request, await fetch(request))
    } catch (e) {
        let cached = await cache.match(request)
        if (cached) {
            return cached
        }
        throw e
    }
}
