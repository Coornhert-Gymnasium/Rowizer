# Storingstest

Stand van de storingsmatrix uit `docs/VERBETERPLAN.md` (stap R.14) op 18-11-2026, na de
stappen R.1–R.13 op branch `plan/fase-r-robuustheid`.

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
| S6 | Verzoek blijft hangen | Afgebroken na 30 s; behandeld als S1 | Open | Time-out zit erin (`AbortController`), niet getest |
| S7 | Afgekapte JSON of `totalRows` > rijen | Ronde telt als mislukt; vorige stand blijft | Test (`validation`, `session`) | Soort `data` of `server`, herhaald |
| S8 | Afspraak met uur buiten het raster, onbekende groep, lege velden | Rest van het bord correct; teller in diagnose | Test (`grid`, `validation`) + Browser | Alle items onder hun eigen kolom |
| S9 | Zermelo onbereikbaar bij de dagwissel | "Rooster van <dag> wordt geladen"; herstelt vanzelf; geen paginaherlading | Test (`dayRollover`) + Browser | Zoals verwacht, zelfde pagina, herstel na het proefverzoek |
| S10 | Schooljaar bestaat nog niet (1 augustus) | "Vandaag geen lessen"; hoogstens 1 poging per 30 min | Test (`connector`, `status`) | Alleen in tests; voor R.4 in de browser: herlaadlus van 1 per minuut, nu weg |
| S11 | Verkeerde portalnaam | Neutrale melding; oorzaak in de diagnose; rem uit R.11 werkt | Open | Verwacht: soort `server` (Zermelo geeft 500), neutrale melding op het bord |
| S12 | Speler op UTC, klok 10 min voor | Juiste dag en tijden; klokwaarschuwing | Test (`clock`, alle tests ook onder `TZ=UTC`) + Browser (klok) | Klokcorrectie werkt; rekenen in een vaste tijdzone is niet gedaan (besluit 7: de Pi staat op Amsterdam) |
| S13 | Fout in de weergavecode | Vorige beeld blijft; "weergavefout"; waakhond herlaadt na 15 min | Browser | Vorige beeld blijft, code `render`. **Afwijking:** de waakhond herlaadt niet, omdat de rondes gewoon aflopen (hartslag loopt door); een herlading lost een vaste fout in de code ook niet op |
| S14 | Scherm 12 uur uit en weer aan | Binnen 1 minuut juiste dag en verse gegevens | Open | Zichtbaar worden start een ronde (hoogstens eens per minuut); dagwissel via de minuutcontrole. Niet getest |
| S15 | 72 uur ononderbroken draaien | Geheugen stabiel; geen oplopend aantal timers | Open | Niet getest. Eens per nacht herladen beperkt het risico |

## Nog te doen

- S6, S11, S14 en S15 nabootsen. Voor S15 is een Pi in de hal de beste testomgeving: zet
  `debug=1` en maak elke dag een foto van het diagnosepaneel.
- Een `test/chaos/` met een bestuurbare nep-`fetch` voor de hele app (nu gedekt per onderdeel).
