/*
 * Service worker (plan stap R.17): de eigen bestanden ook als de webhost (GitHub Pages) even niet
 * bereikbaar is, bv. na een stroomstoring als het netwerk er eerder is dan internet.
 *
 * - Netwerk eerst, de cache alleen als terugval: een nieuwe versie (stap 3.5) komt dus gewoon binnen.
 * - Alleen GET-verzoeken naar de eigen webserver. Zermelo (ander domein) en de HEAD-verzoeken van
 *   de waakhond en de klokcontrole gaan er buiten om: een bewaarde Date-header zou de klok verzetten.
 * - Zonder antwoord binnen 6 seconden de bewaarde versie, als die er is.
 * - Uitzetten: open het bord eenmaal met sw=0 in het adres (zie index.html).
 */
const CACHE = "rowizer-v1"
const NETWORK_TIMEOUT = 6000

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
    event.respondWith(networkFirst(request))
})

async function networkFirst(request) {
    let cache = await caches.open(CACHE)
    // De pagina zelf onder één sleutel: het adres verschilt per scherm alleen in query en fragment.
    let key = request.mode === "navigate" ? new URL("./", self.registration.scope).href : request
    let network = fetch(request).then(response => {
        if (response.ok && response.type === "basic") {
            cache.put(key, response.clone())
        }
        return response
    })
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
        return cached
    }
    // niets bewaard: toch op het netwerk wachten (of de fout doorgeven)
    return network
}
