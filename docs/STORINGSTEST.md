# Storingstest

Stand van de storingsmatrix uit `docs/VERBETERPLAN.md` (stap R.14) op 18-11-2026, na de
stappen R.1–R.13 op branch `plan/fase-r-robuustheid`. Bijgewerkt op 18-11-2026 na fase 3 en 4,
R.16 en R.17 (branch `plan/fase-4-opruimen`): S6, S11, S14 en S15 getest, S16 en S17 erbij.

- **Test**: gedekt door een automatische test (`npm test`).
- **Browser**: met de hand nagespeeld in Chromium tegen de demo-portal, met
  `scripts/dev-server.py` en een vervangen `window.fetch` in de pagina.
- **Open**: nog niet getest.

| # | Scenario | Verwacht | Gedekt | Uitkomst |
|---|---|---|---|---|
| S1 | Netwerk valt weg tijdens bedrijf, 20 min | Bord blijft staan; oranje balk na 15 min; hoogstens 1 proefverzoek per interval | Test (`sessionPolicy`, `status`) + Browser (eerste minuten) | Bord blijft staan, code `network` rechtsonder, geen verzoeken buiten het proefverzoek. De balk na 15 min alleen in de test gezien |
| S2 | Netwerk terug | Binnen 1 interval ververst; balk weg | Browser | Hersteld na het proefverzoek (ongeveer 1 min), status leeg |
| S3 | Zermelo geeft 503 met HTML | Als S1 | Test (`session`) | Soort `server`, 4 pogingen, daarna storing |
| S4 | Zermelo geeft 429 | Wachttijd volgens `Retry-After`; geen retry-storm | Test (`sessionPolicy`) | `Retry-After` gevolgd, anders 60 s |
| S4b | Kunstmatige lus die blijft verversen | Na 100 verzoeken in 10 min wachten de volgende; bord blijft staan; teller in diagnose | Test (`sessionPolicy`) + Browser | In de browser per ongeluk bereikt bij herhaald herladen (toen nog bij 60): verzoeken stopten, teller zichtbaar; daarna verhoogd naar 100 |
| S5 | Token ingetrokken tijdens bedrijf (401) | Bord blijft staan; neutrale melding en code `auth 401`; proefverzoek elke 10 min | Test (`sessionPolicy`, `status`) | Alleen in tests. In de browser wel het opstarten met een ongeldig token: neutrale melding na 1 verzoek |
| S6 | Verzoek blijft hangen | Afgebroken na 30 s; behandeld als S1 | Test (`session`) | Afgebroken met soort `network` ("timeout"), 2 keer herhaald, daarna storing met proefverzoeken; een hangend verzoek gevolgd door een goed antwoord geeft geen fout. De time-out is voor de test instelbaar (`requestTimeout`) |
| S7 | Afgekapte JSON of `totalRows` > rijen | Ronde telt als mislukt; vorige stand blijft | Test (`validation`, `session`) | Soort `data` of `server`, herhaald |
| S8 | Afspraak met uur buiten het raster, onbekende groep, lege velden | Rest van het bord correct; teller in diagnose | Test (`grid`, `validation`) + Browser | Alle items onder hun eigen kolom |
| S9 | Zermelo onbereikbaar bij de dagwissel | "Rooster van <dag> wordt geladen"; herstelt vanzelf; geen paginaherlading | Test (`dayRollover`) + Browser | Zoals verwacht, zelfde pagina, herstel na het proefverzoek |
| S10 | Schooljaar bestaat nog niet (1 augustus) | "Vandaag geen lessen"; hoogstens 1 poging per 30 min | Test (`connector`, `status`) | Alleen in tests; voor R.4 in de browser: herlaadlus van 1 per minuut, nu weg |
| S11 | Verkeerde portalnaam | Neutrale melding; oorzaak in de diagnose; rem uit R.11 werkt | Browser | "Roosterwijzigingen tijdelijk niet beschikbaar", rechtsonder `server 500`, in de diagnose de melding van Zermelo. 4 verzoeken, daarna één proefverzoek per interval; de waakhond herlaadt niet (de connector probeert het zelf en geeft een hartslag) |
| S12 | Speler op UTC, klok 10 min voor | Juiste dag en tijden; klokwaarschuwing | Test (`clock`, alle tests ook onder `TZ=UTC`) + Browser (klok) | Klokcorrectie werkt. Rekenen in een vaste tijdzone is niet gedaan (besluit 7: de Pi staat op Amsterdam); een andere tijdzone geeft wel `tijdzone <zone>` rechtsonder en een regel in de diagnose |
| S13 | Fout in de weergavecode | Vorige beeld blijft; "weergavefout"; waakhond herlaadt na 15 min | Browser | Vorige beeld blijft, code `render`. **Afwijking:** de waakhond herlaadt niet, omdat de rondes gewoon aflopen (hartslag loopt door); een herlading lost een vaste fout in de code ook niet op |
| S14 | Scherm 12 uur uit en weer aan | Binnen 1 minuut juiste dag en verse gegevens | Test (`scheduler`, `dayRollover`) + Browser | Zichtbaar worden ververst direct, een tweede keer binnen de minuut niet. Eerst wordt de dag gecontroleerd (`beforeEvent`), dus na een nacht uit komt meteen de nieuwe dag. In rusttijd (3.2) wordt bij zichtbaar worden bewust niet ververst |
| S15 | 72 uur ononderbroken draaien | Geheugen stabiel; geen oplopend aantal timers | Test (`scheduler`) + Browser (verkort) | Na 500 rondes nog steeds één timer per taak. In de browser 300 keer het bord opnieuw getekend: 156 elementen voor en na, heap 5 MB → 3 MB. De echte 72 uur nog niet; eens per nacht herladen beperkt het risico |
| S16 | Koude start zonder Zermelo, eerder die dag wel gedraaid (R.16) | Bewaarde stand van vandaag meteen op het bord, met rode balk | Test (`boardCache`, `status`) + Browser | Met een ongeldig token: 63 items en de afwezigen uit de opslag, balk "… – stand van 22:36", rechtsonder `auth 401`. Andere dag of andere portal: niets. Kwaadaardige HTML in de opslag wordt gefilterd |
| S17 | Koude start terwijl de webhost onbereikbaar is (R.17) | Bord start uit de cache van de service worker | Test (`serviceWorker`) + Browser | Lokale webserver gestopt, pagina herladen: bord gestart en verse gegevens van Zermelo geladen. `sw=0` haalt de worker weg |

## Nog te doen

- S15 echt 72 uur laten lopen. Een Pi in de hal is de beste testomgeving: zet `debug=1` en maak
  elke dag een foto van het diagnosepaneel.
- Een `test/chaos/` met een bestuurbare nep-`fetch` voor de hele app (nu gedekt per onderdeel).
