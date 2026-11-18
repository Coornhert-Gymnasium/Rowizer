# Rowizer – analyse en verbeterplan

Opgesteld op 10-11-2026 op basis van commit `4793264` (master); dezelfde dag uitgebreid met
een verdiepende analyse van de robuustheid (§2.5 en fase R). Dit document is bedoeld
als werkinstructie: elke stap is los uit te voeren, heeft een eigen acceptatiecriterium
en hoort in een eigen commit.

## 1. Wat de app doet

Rowizer is een statische webpagina (geen build, geen dependencies, ES-modules) die op een
groot scherm in de hal de roosterwijzigingen van vandaag uit Zermelo toont.

| Laag | Bestanden | Rol |
|---|---|---|
| Start | `index.html`, `js/script.js`, `js/clock.js` | URL-parameters lezen, drie verversloops starten, herlaad-waakhond |
| API | `js/zermelo/**` | `Session` (fetch + time-out + retry), één `Manager` per endpoint |
| Connector | `js/connectors/zermeloConnector.js` | Basisgegevens bij opstarten: vestiging, afdelingen, groepen, leerlingen, lesuren, dagrooster |
| Controllers | `js/controllers/{changes,absences,outofoffice}` | Data ophalen en bewerken |
| Views | `js/views/**`, `styles.css` | DOM opbouwen: raster jaarlaag × lesuur, afwezigen, externe activiteiten |

Gedrag: elke 5 minuten verversen (na een fout na 1 minuut), om middernacht de pagina herladen.
Instellen gaat volledig via URL-parameters (`portal`, `token`, `branch`, `date`, `external`,
`departmentsIgnore`, `mergeAppointments`).

Verhouding tot upstream (`Vlietland-College/Rowizer`, laatste commit `e39dc3b`): deze fork loopt
28 commits voor en 0 achter. De verschillen zitten in stabiliteit (time-outs, retries,
statusmelding, herlaad-waakhond), toetsen, keuzelessen en de versiestempel. Upstream heeft geen
open issues of PR's.

## 2. Bevindingen

Gemeten door de app lokaal te draaien tegen de demo-portal uit de README
(`?portal=j9qeq&date=23-9-2026&branch=a`, token staat in `README.md`) op 1920×1080.

### 2.1 Fouten die nu op het bord zichtbaar zijn

| # | Bevinding | Bewijs |
|---|---|---|
| B1 | Afwezigen worden niet samengevoegd. Een docent die per lesuur is afgemeld staat er acht keer, ongesorteerd: `krh (3) - krh (8) - krh (5) - krh (2) - krh (6) - krh (t/m 1) - krh (4) - krh (7)`. | `js/views/absences/absencesUiManager.js:14-23`; `merge()` op regel 26 is leeg |
| B2 | Bij meer dan twee docenten klopt de teller niet: drie docenten wordt `a,b+2` in plaats van `a,b+1`. | `js/views/changes/changesUIRecordClass.js:41-44` |
| B3 | De tijd van een afspraak zonder lesuur wordt aan `locations[0]` geplakt; daarna sorteert de view de locaties op lengte en toont alleen de kortste. Bij twee lokalen kan de tijd dus verdwijnen, en de sortering wijzigt de brongegevens bij elke render. | `js/controllers/changes/changes.js:124`, `js/views/changes/changesUIRecordClass.js:50` |
| B4 | Zonder `portal`/`token` vraagt de app `https://null.zportal.nl` op en blijft elke minuut herladen, met alleen een titel in beeld. Een verlopen token (401) geeft dezelfde algemene melding. | `js/script.js:32-36`, `js/script.js:103-106` |
| B5 | Een dag zonder wijzigingen of een weekenddag geeft een leeg raster zonder enige tekst. Niet te onderscheiden van een storing. | Gemeten met `date=26-9-2026` |

### 2.2 Leesbaarheid op een groot scherm

| # | Bevinding | Bewijs |
|---|---|---|
| L1 | Alle tekst is vast 16 px, ook titel en klok. Op een full-HD-scherm is een regel 19 px hoog; dat is vanaf een paar meter niet te lezen. De README vraagt daarom om 4K + 50 inch, maar ook dan schaalt er niets mee. | `styles.css:1-6` (geen `font-size`) |
| L2 | Alle lesuurnamen van het schooljaar krijgen een kolom, ook als er die dag niets in staat. Op de demodag zijn u09 en u10 leeg: 20% van de breedte ongebruikt, terwijl 15 van de 62 items over twee regels afbreken. | `js/views/changes/changesUiManager.js:22-27` |
| L3 | Geen markering van het huidige lesuur; voorbije uren blijven even prominent. | – |
| L4 | Geen legenda. Groen (activiteit), blauw (toets) en de rode gloed (nieuw sinds vannacht 01:00) moet je maar weten. | `styles.css:128-138` |
| L5 | "Vervalt" is alleen tekst; uitval ziet er hetzelfde uit als een lokaalwijziging. | `styles.css:122-126` |
| L6 | Geen `lang`, geen `<title>`, muiscursor blijft zichtbaar op het scherm. | `index.html:2-6` |

### 2.3 Verspilling en kwetsbaarheden

| # | Bevinding | Bewijs |
|---|---|---|
| V1 | De categorie `invalid` wordt elke ronde opgehaald en daarna nergens getoond. Op de demodag is dat 49 van de 93 afspraken. Ze tellen wel mee in de wijzigingsdetectie, dus het bord wordt onnodig herbouwd (en scrolt dan terug naar boven). | `js/controllers/changes/changes.js:55-57`, `js/views/changes/changesUiManager.js:162-172` |
| V2 | Er wordt dag en nacht en in het weekend elke 5 minuten gepold: 7 verzoeken per ronde, ruim 2000 per dag, waarvan het grootste deel buiten schooltijd. | `js/script.js:13`, `js/script.js:80-92` |
| V3 | Query-parameters worden niet ge-encodeerd. Een `external`-locatienaam met spatie of `&` breekt het verzoek. | `js/zermelo/utils/session.js:20` |
| V4 | Kolommen gaan uit van lesuur-rangnummers die bij 1 beginnen en aaneengesloten zijn. De koppen worden op volgorde geplaatst, de afspraken op rangnummer, en afspraken zonder lesuur op index. Met een nulde uur of een gat in de nummering verschuift alles. | `js/views/changes/changesUiManager.js:27,41-47`, `js/controllers/changes/changes.js:126-136` |
| V5 | Na een deploy draait het scherm tot middernacht de oude code; de versiestempel wordt met de hand gezet en loopt per definitie één commit achter. | `scripts/stamp-version.sh:3`, `js/version.js` |
| V6 | Het token staat blijvend in de adresbalk. Er is geen `referrer`-beleid. | `js/script.js:21-36` |
| V7 | De sorteerfunctie is niet consistent (activiteit tegenover toets geeft beide kanten `-1`), waardoor de volgorde per browser kan verschillen. | `js/views/changes/changesUiManager.js:174-189` |
| V8 | `arraysEqual` sorteert de arrays van de afspraak zelf. Docent- en lokaalvolgorde veranderen daardoor als bijwerking van een vergelijking. | `js/zermelo/utils/mergeAppointments.js:77` |

### 2.4 Onderhoudbaarheid

- Geen tests, geen CI, geen lint. De lastigste logica (afspraken samenvoegen, lesuur bepalen,
  afwezigheid naar lesuren) is alleen met de hand op een scherm te controleren.
- Dode code: `changedRecord.js` en `changedRecordHolder.js` (wel geïmporteerd in
  `changes.js:1`, nooit gebruikt), de lege `connector.js`, lege `merge()`-methodes,
  `Number(r.id)` zonder effect (`js/zermelo/lib/manager.js:11`), en managers die nergens
  worden aangeroepen (`schools`, `weektimetables`, `timetableoverrides`).
- Debug-globals `window.ad`, `window.cm`, `window.zc`, `window.dc` staan altijd aan; elke ronde
  worden complete afspraakobjecten naar de console gelogd ("Skipping: lesson vv").
- Bedrijfslogica in de view: het afleiden van afdelingen uit leerlingen voor keuzelessen en
  toetsen staat in `changesUiManager.js:108-149` (in de code zelf gemarkeerd als hack).
- CSS: `overflow-y: overlay` is vervallen (`styles.css:99`); de regel die de scrollbalk
  verbergt richt zich op `.year-row` terwijl `.schedule-content` scrolt (`styles.css:89`).
- Bekende beperking, buiten dit plan: één dagrooster voor de hele vestiging
  (`zermeloConnector.js:244-246`, FIXME).

### 2.5 Robuustheid in combinatie met de Zermelo-API

Tweede, diepere ronde. "Gemeten" betekent: nagespeeld tegen de demo-portal of in de draaiende
app (storingen nagebootst door `fetch` in de pagina te vervangen). "Code" betekent: afgeleid
uit de bron, niet nagespeeld.

Wat al goed werkt en zo moet blijven: een mislukte verversronde laat het bestaande bord staan
(gemeten: na 7 s en drie pogingen geeft `refreshTable()` `false`, de 61 items blijven
zichtbaar), er is een time-out van 30 s per verzoek, en één afspraak met onverwachte gegevens
haalt de rest niet onderuit.

| # | Bevinding | Bewijs |
|---|---|---|
| R1 | **Het dagrooster verschilt per afdeling, de app gebruikt er één.** `realizedweektimetables` geeft één rij per afdeling; de app pakt de eerste. Op de demodag gebruiken 10 afdelingen dagrooster 24 ("Basis") en 6 afdelingen 50002 ("Variant 1"). Lestijden voor toetsen zonder lesuur, het bereik bij afwezigen en straks het "huidige lesuur" kloppen dus voor een deel van de school niet. | Gemeten (16 rijen, 2 combinaties); `zermeloConnector.js:246` |
| R2 | **Eén lesuur buiten het raster breekt de kolommen van de hele jaarlaag.** Een afspraak met `startTimeSlot` 14 maakt extra kolommen aan; alle items in die rij staan daarna niet meer onder hun kop. | Gemeten (rij 5 verschoof); `styles.css:122-125` |
| R3 | **Herlaadlus zonder rem.** Elke blijvende opstartfout leidt tot een volledige paginaherlading per minuut, voor onbepaalde tijd: onbekend schooljaar (vanaf 1 augustus tot het nieuwe jaar in Zermelo staat), verlopen token, verkeerde portalnaam. Elke herlading doet opnieuw alle verzoeken en retries. | Gemeten met `date=15-8-2028`; `script.js:103-106`, `index.html:19-23` |
| R4 | **Fouten worden verkeerd ingedeeld.** Zermelo geeft 403 niet alleen bij een ontbrekend recht maar ook bij een veld of filter dat niet (meer) bestaat; een onbekende portal geeft HTTP 500 en wordt als tijdelijke storing behandeld. Op het scherm staat in alle gevallen "Geen verbinding met Zermelo". | Gemeten (401, 403 op `fields=id`, 500 op onbekende portal); `session.js:70-77`, `script.js:117-119` |
| R5 | **Basisgegevens worden alleen bij het opstarten geladen.** Een groep of leerling die overdag wordt toegevoegd is tot middernacht onbekend; de bijbehorende wijziging valt dan stil weg. | Gemeten (onbekende groep: 62 → 61 items, alleen een console-waarschuwing); `changesUiManager.js:83-87` |
| R6 | **Het herladen van basisgegevens is niet atomair.** `#reloadBranchOfSchools` overschrijft de velden één voor één terwijl de verversloops doorlopen; halverwege horen afdelingen en groepen niet bij elkaar. | Code; `zermeloConnector.js:146-236` |
| R7 | **De dagwissel gooit alles weg.** Om middernacht herlaadt de pagina. Is Zermelo op dat moment onbereikbaar, dan blijft het bord leeg tot het weer lukt. Alle schermen van een school herladen in dezelfde minuut. | Code; `script.js:98-101` |
| R8 | **Tekenen is niet atomair.** De tabel wordt eerst leeggemaakt en dan opgebouwd. Een fout tijdens het opbouwen laat een leeg of half bord achter met de melding "Geen verbinding met Zermelo". | Code; `changesUiManager.js:222-232`, `absencesUiManager.js:38-41` |
| R9 | **Alles rekent met de klok en tijdzone van de speler.** Daggrenzen, lestijden, de "nieuw"-markering en de dagwissel gebruiken lokale tijd. Staat de speler op UTC of loopt de klok fout, dan wordt het verkeerde dagvenster opgevraagd en kloppen getoonde tijden niet. | Code; `date.js:35-45`, `changes.js:122-123`, `zermeloConnector.js:261-264` |
| R10 | **Stilstand wordt niet opgemerkt.** Veroudering wordt alleen gemeld als een ronde mislukt. Stopt een loop (bijvoorbeeld door een promise die nooit afloopt), dan blijft het bord er actueel uitzien. Er is geen waakhond op de loops zelf. | Code; `script.js:80-92` |
| R11 | **Afwezigen en externe activiteiten falen onzichtbaar.** Alleen de wijzigingenloop zet een statusmelding; verouderde afwezigen blijven de hele dag staan zonder aanduiding. | Code; `script.js:125-155` |
| R12 | **Retrybeleid is star.** Vaste wachttijden (2 s, 5 s), geen spreiding, geen `Retry-After` bij 429, en de drie loops proberen onafhankelijk van elkaar opnieuw. Zermelo hanteert geen verzoeklimiet per token (navraag Tom); de app legt zichzelf daarom een budget op (R.3). | Code; `session.js:3-4,22-34` |
| R13 | **Antwoorden worden niet gecontroleerd.** De envelop bevat `startRow`, `endRow` en `totalRows`, maar een onvolledig antwoord wordt niet herkend; rijen zonder `id`, `start` of `end` gaan ongezien door. | Gemeten (envelop); `manager.js:7-14` |
| R14 | **Het token gaat naar de webhost.** Het staat in de query-string en wordt dus bij elke paginalading naar GitHub Pages gestuurd, en nog eens bij elke bereikbaarheidscheck. | Code; `index.html:10` |
| R15 | **Het token kan verlopen zonder waarschuwing.** `tokens/~current` geeft de vervaldatum (demo: 13-9-2030) en de rechten; de app gebruikt dat niet. | Gemeten |
| R16 | **Onafgehandelde fouten.** In de console staat "Uncaught (in promise)" bij een opstartfout; er is geen globale foutafhandeling, en `waitUntilReady` blijft elke 200 ms pollen als de vestiging niet gevonden wordt. | Gemeten; `zermeloConnector.js:284-294` |
| R17 | **API-tekst wordt als HTML geplaatst.** Lesuurnaam en jaarlaag gaan via `innerHTML` de pagina in. | Code; `changesUiManager.js:44,54` |
| R18 | **Op afstand is niets te zien.** Zonder ontwikkelaarstools is niet vast te stellen welke versie draait, wanneer er voor het laatst is ververst of welke fout optrad. | – |

Overige meetgegevens die het ontwerp sturen:

- Omvang per verversronde op de demodag: 5 verzoeken, samen ongeveer 100 kB ongecomprimeerd
  (12 kB over de lijn), elk 0,15-0,3 s. De categorie `invalid` is daarvan bijna de helft.
- Alle afspraken van de dag in één verzoek: 496 rijen, 393 kB, 5,2 s. De gefilterde
  verzoeken blijven dus de juiste keuze.
- Een verzoek met `modifiedSince` van 5 minuten geleden kost 114 bytes en 0,14 s. Bruikbaar
  als goedkope tussentijdse controle (stap R.15).
- `realizedweektimetables` bevat per dag de lesuren al (`timeSlotsMonday` enz. met `code`,
  `start`, `end`, `rank`); `timeslots` en `daytimetables` hoeven dan niet meer apart.
- De preflight wordt 24 uur gecachet (`access-control-max-age: 86400`); geen winst te halen.
- Elk API-antwoord zet een `JSESSIONID`-cookie.
- Er bestaat een endpoint `holidays` (122 rijen in de demo).

## 3. Werkafspraken voor de uitvoering

1. **Niet pushen naar `live`.** De remote `live` (`Coornhert-Gymnasium/Rowizer`) is de
   productie-installatie; een push komt op het scherm in de hal. Alleen lokaal committen,
   tenzij Tom uitdrukkelijk om een push vraagt.
   Pushen naar `origin` (`tomkooij/Rowizer`) gaat via de `gh`-login over HTTPS; SSH werkt in
   deze omgeving niet (`Permission denied (publickey)`). Pas de remotes niet aan, maar gebruik:

   ```bash
   git -c credential.helper= -c credential.helper='!gh auth git-credential' push https://github.com/tomkooij/Rowizer.git <branch>
   ```

   Controleer daarna met `gh api repos/tomkooij/Rowizer/branches/<branch> --jq .commit.sha`
   dat de commit er staat.
2. Werk op een branch per fase (`plan/fase-0-tests`, `plan/fase-1-fouten`, ...), één commit
   per stap, commitberichten in dezelfde stijl als de bestaande (Engels, gebiedende wijs).
3. Geen buildstap en geen runtime-dependencies toevoegen. De pagina moet rechtstreeks vanaf
   GitHub Pages blijven werken. Ontwikkel-tooling mag alleen wat Node zelf meelevert.
4. Het scherm in de hal is Chromium 145.0.7632.116 op een Raspberry Pi met Debian 12
   (bookworm), tijdzone Amsterdam. Die versie ondersteunt alles wat de code nu gebruikt
   (private velden, `Array.prototype.at`, `??`, CSS subgrid) en ook `localStorage`, service
   workers, `Intl` met tijdzones, `AbortSignal.timeout` en `replaceChildren`. Blijf toch bij
   het niveau van de huidige code en gebruik `localStorage` en service workers alleen na een
   controle of ze werken: andere scholen draaien de app op andere spelers (de opmerking over
   GoBright in `session.js:15` komt daar vandaan), en de Pi wordt niet vanzelf bijgewerkt.
   De Pi is traag en heeft weinig geheugen: geen zware animaties, geen grote DOM.
5. Controleer elke zichtbare wijziging in de browser: start de server uit
   `.claude/launch.json` (`rowizer-static`, poort 8765) en open de demo-URL uit de README met
   `localhost:8765` als host. Testdagen: `date=23-9-2026` (drukke dag, 62 items, toetsen,
   activiteit, afwezigen) en `date=26-9-2026` (zaterdag, leeg). Controleer op 1920×1080 én
   3840×2160.
6. Bestaand gedrag dat niet in een stap genoemd wordt, blijft gelijk. De keuzes in §6 zijn besloten. Komt er
   een nieuwe keuze op over wat een school wil zien: niet gokken maar aan Tom voorleggen.
7. Commentaar in de code is Nederlands, namen en logmeldingen Engels – houd dat aan.

## 4. Stappenplan

Volgorde: fase 0 eerst (vangnet), dan fase R (robuustheid), daarna 1 en 2 (zichtbare fouten
en leesbaarheid). De keuzes voor fase 3 staan in §6. Fase 4 kan altijd tussendoor.

### Fase 0 – Vangnet

**0.1 Testomgeving zonder dependencies**
- Voeg `package.json` toe met alleen `"type": "module"`, `"private": true` en
  `"scripts": {"test": "node --test"}`.
- Maak `test/` met een eerste test voor `js/zermelo/utils/date.js` (weeknummer rond de
  jaarwisseling: 30-12-2024 → `202501`, 1-1-2027 → `202653`; `getSchoolYear` voor juli/augustus).
- Klaar als: `npm test` slaagt met Node 20+ en de pagina ongewijzigd laadt.

**0.2 Fixtures van de demo-portal**
- Schrijf `scripts/record-fixtures.mjs` dat voor `23-9-2026` de antwoorden ophaalt van alle
  endpoints die de app gebruikt en ze als JSON in `test/fixtures/2026-09-23/` zet. Portal en
  token komen uit argumenten, niet hardgecodeerd.
- Maak `test/helpers/fakeSession.js`: zelfde `request(path, options)` als `Session`, maar leest
  uit de fixtures (filtert `appointments` op de meegegeven `type`/`cancelled`/`modified`/`valid`).
- Klaar als: een test `ZermeloConnector` + `Changes.loadData()` op de fixtures kan draaien en
  62 getoonde items oplevert, gelijk aan wat nu op het scherm staat.
- Let op: `ZermeloConnector` start het laden in de constructor en `Changes` schrijft naar
  `window.ad`. Maak dat laatste voorwaardelijk (`typeof window`), verander verder niets.

**0.3 Karakteriseringstests voor de kernlogica**
- `mergeSubsequentAppointments`: aaneengesloten uren worden één afspraak; een gat niet.
- Lesuurbepaling voor afspraken zonder lesuur (`changes.js:119-139`).
- Afwezigheid naar lesuren (`absences.js:46-70`): hele dag, "t/m", "va", één uur.
- Tekst per item (`ChangesUIRecordClass.getInnerText`): les, uitval, activiteit, toets,
  keuzeles zonder vak. Haal hiervoor de tekstopbouw uit de DOM-klasse naar een pure functie
  in `js/views/changes/appointmentText.js` en laat de klasse die aanroepen.
- Leg het huidige gedrag vast, ook waar het fout is (B2, B3); markeer die tests met een
  verwijzing naar de stap die ze gaat omdraaien.

**0.4 CI**
- `.github/workflows/test.yml`: bij push en PR `npm test` op Node 20. Geen deploy-stappen.

### Fase R – Robuustheid

Doel: het bord toont altijd de best beschikbare informatie, zegt eerlijk hoe oud die is,
herstelt zonder tussenkomst, en belast Zermelo niet als er iets mis is. Uitvoeren direct na
fase 0. De stappen bouwen op elkaar; houd de volgorde aan. De storingsmatrix in R.14 is het
acceptatiecriterium voor de hele fase.

Ontwerpprincipes voor alle stappen:

- **Laatste goede stand blijft staan.** Nieuwe gegevens vervangen de oude pas als ze volledig
  geladen, gecontroleerd en getekend zijn.
- **Nooit een pagina herladen om een verzoek opnieuw te proberen.** Herladen is alleen voor
  een nieuwe versie of als laatste redmiddel van de waakhond.
- **Elke fout heeft een soort**, en de soort bepaalt de melding en het wachtgedrag.
- **Geen stille veroudering.** Wat ouder is dan verwacht, is als zodanig zichtbaar.

**R.1 Foutsoorten (R4)**
- Breid `js/zermelo/utils/errors.js` uit tot één basisklasse met een veld `kind`:
  `network` (geen antwoord, time-out), `server` (5xx, ongeldige JSON), `rate` (429),
  `auth` (401), `permission` (403), `request` (overige 4xx), `data` (antwoord klopt niet).
  Bewaar ook HTTP-status, Zermelo-`message` en `eventId`.
- `session.js` gooit alleen nog deze fouten. Alleen `network`, `server` en `rate` zijn
  herhaalbaar.
- 403 op `employeeabsences` blijft betekenen: afwezigen uitzetten. 403 op een ander endpoint
  is een configuratie- of versieprobleem en krijgt een eigen melding (R.10).
- Tests: per soort een nagebootst antwoord, gebaseerd op de gemeten vormen in §2.5.

**R.2 Antwoorden controleren (R13)**
- In `Manager.get`: `data` moet een array zijn; is `totalRows` groter dan het aantal rijen,
  gooi dan een `data`-fout (onvolledig antwoord, herhaalbaar).
- Per endpoint een kleine lijst verplichte velden met type (afspraken: `id`, `start`, `end`
  numeriek; groepen: `id`, `departmentOfBranch`). Rijen die niet voldoen worden weggelaten en
  geteld; de teller komt in de diagnose van R.13.
- Geen schema-bibliotheek; een functie van enkele regels per endpoint.

**R.3 Verzoekbeleid (R12)**
- Eén wachtrij in `Session` met maximaal 2 gelijktijdige verzoeken.
- Opnieuw proberen met oplopende wachttijd en spreiding: 2 s, 5 s, 15 s, elk ±30%. Bij 429
  de `Retry-After` volgen als die er is, anders 60 s.
- Gedeelde gezondheidstoestand: na een mislukt verzoek (na retries) staat de sessie op
  "storing". Andere loops slaan hun ronde dan over; één proefverzoek per interval bepaalt of
  de storing voorbij is. Het interval loopt op van 1 naar 2, 5 en maximaal 10 minuten.
- `fetch` met `credentials: "omit"` en `cache: "no-store"`.
- **Eigen verzoekbudget.** Zermelo hanteert geen limiet per token (besluit 10). Het budget
  hieronder is dus een zelfgekozen grens: ruim boven normaal gebruik, zodat het nooit in de
  weg zit, en laag genoeg om een fout in de eigen code (een lus die doordraait) te stoppen
  voordat de portal van de school er last van heeft.

  | Grens | Waarde | Normaal gebruik ter vergelijking |
  |---|---|---|
  | Gelijktijdige verzoeken | 2 | – |
  | Tussenruimte tussen twee verzoeken | minimaal 250 ms | – |
  | Per 10 minuten (schuivend venster) | 100 | ongeveer 14; bij opstarten ongeveer 20; met R.15 ongeveer 24 |
  | Per etmaal | 2500 | ongeveer 1000 binnen het venster 06:30-18:00 |

  De waarden gelden per scherm en staan als constanten bovenaan `session.js`. Geen
  URL-parameter: een school hoort dit niet per ongeluk te kunnen verhogen.
- Budget op: geen fout gooien maar het verzoek laten wachten tot er ruimte is; een verzoek
  dat langer dan 2 minuten wacht mislukt met soort `rate`. De teller en het aantal keren dat
  het budget is geraakt komen in de diagnose van R.13. Het raken van het budget is altijd een
  fout in de app en geen normale toestand: log het als waarschuwing.
- De etmaalteller begint opnieuw bij de dagwissel (R.7) en bij een paginaherlading; bewaar
  hem daarom in `window.name` naast de herlaadteller van R.11, zodat een herlaadlus het
  budget niet omzeilt.
- Tests met `node:test` mock-timers: wachttijden, de bovengrens, herstel na één geslaagd
  proefverzoek, het 101e verzoek binnen 10 minuten wacht, en het budget overleeft een
  nagebootste herlading.

**R.4 Basisgegevens als momentopname (R6, R16)**
- Haal het laden uit de constructor van `ZermeloConnector`. Nieuw: `async loadBaseData(date)`
  die een nieuw, bevroren object teruggeeft (vestiging, afdelingen, groepen, leerlingen,
  lesuren per afdeling, jaarlagen) en niets aan de bestaande toestand verandert.
- De connector houdt één verwijzing `current` bij en vervangt die in één toewijzing als het
  laden geslaagd is. Mislukt het, dan blijft de oude momentopname gelden.
- De getters blijven bestaan en lezen uit `current`, zodat controllers en views in deze stap
  niet hoeven te veranderen.
- Opstarten: bij een fout in place opnieuw proberen volgens R.3; `waitUntilReady` wordt een
  gewone promise zonder de 200 ms-lus.
- Klaar als: de fixturetest uit 0.2 ongewijzigd slaagt en een nagebootste fout halverwege het
  laden de vorige momentopname intact laat.

**R.5 Dagrooster betrouwbaar bepalen (R1)**
- Besluit 8: het Coornhert gebruikt één dagrooster voor alle afdelingen. Bouw daarom de
  eenvoudige vorm, maar maak de keuze niet langer willekeurig.
- Lees `realizedweektimetables` en gebruik de ingesloten `timeSlots<Dag>`-lijsten. Controleer
  eerst op de fixtures dat `code`, `start`, `end` en `rank` aanwezig zijn; zo ja, laat dan de
  aparte verzoeken naar `timeslots` en `daytimetables` vervallen.
- Kies het dagrooster dat de meeste afdelingen (zonder de genegeerde uit `departmentsIgnore`)
  die dag gebruiken. Zijn er meer dan één, zet dan een waarschuwing in de diagnose van R.13
  met de aantallen ("2 dagroosters vandaag: 10 en 6 afdelingen"); op het scherm verandert
  niets.
- Houd de functie `getTimeSlots(departmentId)` als enige toegang, ook al geeft ze nu voor
  elke afdeling hetzelfde terug. Een school met verschillende roosters kan dat later
  uitbreiden zonder de aanroepers te wijzigen.
- Test op de fixtures van de demo-portal (10 en 6 afdelingen): het rooster van de 10 wordt
  gekozen en de waarschuwing verschijnt.
- Stap 2.2 en 2.3 bouwen hierop voort.

**R.6 Tijd los van de speler (R9)**
- Nieuw: `js/utils/schoolTime.js` met functies die in een vaste tijdzone rekenen
  (standaard `Europe/Amsterdam`, parameter `tz`): begin en einde van de dag als epoch,
  `HH:MM` van een epoch, weekdag, weeknummer, schooljaar. Implementeer met
  `Intl.DateTimeFormat(..., {timeZone})`.
- Vervang alle directe `getHours`/`setHours`/`getDay`-aanroepen in controllers, connector en
  views. Laat de `Date.prototype`-uitbreidingen in `date.js` deze functies aanroepen of
  verwijder ze.
- Klokcontrole: de bereikbaarheidscheck in `index.html` leest de `Date`-header van het eigen
  domein. Wijkt de klok meer dan 2 minuten af, reken dan met de gecorrigeerde tijd en toon
  een kleine waarschuwing "klok van dit scherm loopt niet gelijk".
- Besluit 7: de Pi staat op tijdzone Amsterdam, dus het rekenen in een vaste tijdzone is
  een vangnet en geen reparatie. De klokcontrole is wel nodig: een Pi zonder netwerk bij
  het opstarten heeft een verkeerde klok tot NTP gelukt is.
- Tests: zomer- en wintertijd, de overgangsdagen, en een proces met `TZ=UTC` en
  `TZ=America/New_York` dat dezelfde uitkomsten geeft.

**R.7 Dagwissel en verversen van basisgegevens zonder herladen (R5, R7)**
- Dagwissel: als de schooldatum verandert, laad een nieuwe momentopname voor de nieuwe dag,
  wis de wijzigingen, afwezigen en externe activiteiten, en teken opnieuw. Tot dat gelukt is
  toont het bord "Rooster van <dag> wordt geladen" in plaats van de wijzigingen van gisteren.
- Spreid de dagwissel over de eerste 10 minuten na middernacht (willekeurig per scherm).
- Ververs de momentopname elk uur, en direct (hoogstens eens per 10 minuten) als een afspraak
  naar een onbekende groep, afdeling of leerling verwijst.
- Met de parameter `date` is er geen dagwissel.
- De paginaherlading om middernacht vervalt; herladen gebeurt alleen nog bij een nieuwe
  versie (3.5) of door de waakhond (R.11).

**R.8 Afspraken opschonen voor weergave (R2)**
- In `Changes.loadData`, na het bepalen van de lesuren: begin- en einduur binnen het raster
  brengen, omwisselen als het einde voor het begin ligt, en afspraken zonder bruikbaar uur op
  tijd plaatsen. Geen afspraak mag een kolom buiten het raster opleveren.
- Leg in CSS vast dat het raster geen impliciete kolommen maakt
  (`grid-auto-columns: 0` en `overflow: hidden` op de rij) als tweede vangnet.
- Onbekende groep: niet stil weglaten maar tellen, R.7 een verversing laten aanvragen, en na
  die verversing opnieuw tekenen.
- Test: de vier mutaties uit de meting (uur 14-15, onbekende groep, einde voor begin, uur 0).

**R.9 Atomair tekenen (R8, R17)**
- Bouw tabel, afwezigen en externe activiteiten in een los element en plaats het met
  `replaceChildren` pas als het bouwen zonder fout klaar is. Mislukt het, dan blijft het
  vorige beeld staan en volgt de melding "weergavefout" (niet "geen verbinding").
- Vervang `innerHTML` met API-gegevens door `textContent`.
- De scroller start pas na het plaatsen en onthoudt de scrollpositie als de inhoud niet
  korter is geworden.

**R.10 Eén planner met eerlijke status (R10, R11, R4)**
- Vervang de drie `keepRefreshing`-aanroepen door één module `js/scheduler.js`: per taak een
  naam, een interval, een laatste geslaagde tijd en de laatste fout. Start de taken met een
  willekeurige vertraging van 0-20 s zodat schermen niet gelijk lopen. (Later: start binnen 2 s en
  ±10% spreiding op elk interval; zie besluit 10.)
- Extra aanleidingen om direct te verversen: het `online`-event en `visibilitychange` naar
  zichtbaar.
- Statusregel op basis van de planner:

  | Toestand | Op het scherm |
  |---|---|
  | Alles binnen 2 intervallen ververst | "bijgewerkt 10:35" klein in de legenda |
  | Wijzigingen ouder dan 15 min | Oranje balk: "Geen verbinding met Zermelo – stand van 10:35" |
  | Wijzigingen ouder dan 60 min | Rode balk over de volle breedte met dezelfde tekst |
  | `auth` | "Roosterwijzigingen tijdelijk niet beschikbaar" |
  | `permission` buiten afwezigen | "Roosterwijzigingen tijdelijk niet beschikbaar" |
  | Opstarten mislukt, nog nooit gelukt | "Roosterwijzigingen tijdelijk niet beschikbaar" |
  | Afwezigen ouder dan 30 min | Regel grijs met "(stand van 10:35)"; na 2 uur verbergen |

- Besluit 9: op het scherm staat alleen neutrale tekst. De oorzaak (soort fout, endpoint,
  HTTP-status, Zermelo-melding) staat in het diagnosepaneel van R.13 en als korte code in
  de kleine regel rechtsonder, bijvoorbeeld `auth 401`.
- Stap 1.4 gaat hierin op, behalve het instelscherm bij ontbrekende parameters.

**R.11 Onafhankelijke waakhond met rem (R3, R10)**
- De planner zet bij elke afgeronde ronde (geslaagd of niet) `window.rowizerHeartbeat`.
- Het inline script in `index.html` (buiten de modules) herlaadt de pagina als de app niet is
  gestart of als de hartslag ouder is dan 15 minuten.
- Rem: tel opeenvolgende herladingen in `window.name` (blijft bewaard bij herladen, geen
  opslag nodig) en wacht 1, 2, 5, 15, daarna 30 minuten. Een geslaagde ronde zet de teller op 0.
- Klaar als: met `date=15-8-2028` na een uur hoogstens 7 herladingen zijn gedaan in plaats
  van 60.

**R.12 Zelfcontrole van het token (R15)**
- Bij het opstarten en daarna eens per dag `tokens/~current` opvragen. Mislukt dit met
  `permission`, dan overslaan zonder melding.
- Verloopt het token binnen 30 dagen: korte code `token <datum>` in de regel rechtsonder en
  de volledige melding in het diagnosepaneel (besluit 9: geen technische tekst op het scherm).
- Leg de gebruikersnaam en vervaldatum vast voor de diagnose van R.13.

**R.13 Token niet naar de webhost, en diagnose op afstand (R14, R18, R16)**
- Lees de instellingen ook uit het fragment (`#portal=...&token=...`); het fragment gaat nooit
  naar de server. De query-string blijft werken. Documenteer het fragment als aanbevolen vorm.
- De bereikbaarheidscheck gebruikt `location.pathname`, zonder query.
- Stap 3.6 vervalt, op de `referrer`-metatag na.
- Globale `error`- en `unhandledrejection`-handlers die de fout in een ringbuffer van 50
  regels zetten.
- Rechtsonder, klein en altijd zichtbaar: versie en tijd van de laatste geslaagde ronde. Met
  `debug=1`: een paneel met de ringbuffer, de plannertoestand, tellers uit R.2 en R.8, de
  tokengegevens uit R.12 en de klokafwijking uit R.6. Een foto van het scherm is dan genoeg
  om een storing te beoordelen.

**R.14 Storingsmatrix**
- Maak `test/chaos/` met een nep-`fetch` die per scenario te sturen is, en automatiseer wat
  zonder browser kan met de planner, de sessie en de connector. Voer de rest met de hand uit
  in de browser door `window.fetch` te vervangen (zie de aanpak in §2.5) en leg de uitkomst
  vast in `docs/STORINGSTEST.md`.

  | # | Scenario | Verwacht |
  |---|---|---|
  | S1 | Netwerk valt weg tijdens bedrijf, 20 min | Bord blijft staan; oranje balk na 15 min; hoogstens 1 proefverzoek per interval |
  | S2 | Netwerk terug | Binnen 1 interval ververst; balk weg |
  | S3 | Zermelo geeft 503 met HTML | Als S1 |
  | S4 | Zermelo geeft 429 | Wachttijd volgens `Retry-After`; geen retry-storm |
  | S4b | Kunstmatige lus die blijft verversen | Na 100 verzoeken in 10 min wachten de volgende; bord blijft staan; teller in diagnose |
  | S5 | Token ingetrokken tijdens bedrijf (401) | Bord blijft staan; neutrale melding en code `auth 401`; proefverzoek elke 10 min |
  | S6 | Verzoek blijft hangen | Afgebroken na 30 s; behandeld als S1 |
  | S7 | Antwoord met afgekapte JSON of `totalRows` > rijen | Ronde telt als mislukt; vorige stand blijft |
  | S8 | Afspraak met uur buiten het raster, onbekende groep, lege velden | Rest van het bord correct; teller in diagnose |
  | S9 | Zermelo onbereikbaar bij de dagwissel | "Rooster van <dag> wordt geladen"; herstelt vanzelf; geen paginaherlading |
  | S10 | Schooljaar bestaat nog niet (1 augustus) | Melding "Vandaag geen lessen"; hoogstens 1 poging per 30 min |
  | S11 | Verkeerde portalnaam | Neutrale melding; oorzaak in de diagnose; rem uit R.11 werkt |
  | S12 | Speler op UTC, klok 10 min voor | Juiste dag en tijden; klokwaarschuwing |
  | S13 | Fout in de weergavecode (kunstmatig) | Vorige beeld blijft; "weergavefout"; waakhond herlaadt na 15 min |
  | S14 | Scherm 12 uur uit en weer aan | Binnen 1 minuut juiste dag en verse gegevens |
  | S15 | 72 uur ononderbroken draaien | Geheugengebruik stabiel; geen oplopend aantal timers |

**R.15 Sneller en lichter verversen (optioneel)**
- Elke minuut één verzoek met `modifiedSince` van de laatste geslaagde ronde en alleen het
  veld `id`. Niet leeg: direct de volledige ronde. De volledige ronde blijft elke 5 minuten
  lopen, omdat nog niet vaststaat dat verwijderde afspraken via `modifiedSince` zichtbaar zijn.
- Eerst op de demo-portal uitzoeken wat `modifiedSince` precies meldt bij uitval en
  verwijdering; zonder duidelijke uitkomst deze stap overslaan.

**R.16 Starten zonder Zermelo**
- Is `localStorage` beschikbaar (testen met schrijven en teruglezen), bewaar dan na elke
  geslaagde ronde de momentopname en de getoonde gegevens van vandaag. Bij een koude start
  zonder verbinding toont het bord die stand met de rode balk uit R.10.
- Nooit het token opslaan. Gegevens van een andere dag niet tonen.

**R.17 Starten zonder webhost**
- Is `serviceWorker` beschikbaar, registreer dan een worker die de eigen bestanden uit de
  cache levert als GitHub Pages niet bereikbaar is. Op spelers zonder ondersteuning verandert
  er niets.
- Controleer dat stap 3.5 (nieuwe versie ophalen) blijft werken: netwerk eerst, cache als
  terugval.
- Noteer in de README hoe Chromium op de Pi in kioskmodus hoort te starten (wachten op
  netwerk voor het openen van de pagina, automatisch herstarten na een crash); dat kan de
  app niet oplossen.

### Fase 1 – Zichtbare fouten

**1.1 Afwezigen samenvoegen (B1)**
- Nieuw: `js/controllers/absences/mergeAbsences.js` – groepeer per `employee`, sorteer op
  begintijd, voeg aaneengesloten of overlappende lesuren samen tot één bereik. Dekt het
  resultaat de hele lesdag, dan geen toevoeging.
- `AbsencesUiManager.render()` gebruikt het resultaat; verwijder de lege `merge()`.
- Verwacht op de demodag: `bee - krh`. Met een gat: `krh (1-3, 6-8)`.
- Tests: acht losse uren → hele dag; uren 1-3 en 6-8; één hele-dagmelding plus een losse.

**1.2 Docententeller (B2)**
- `+ (length - 2)` in de tekstfunctie uit 0.3. Pas de test aan.

**1.3 Tijd en locatie scheiden (B3)**
- In `changes.js` de tijd niet meer aan `locations[0]` plakken maar als
  `appointment.timeLabel = "14:00-14:50"` bewaren.
- In de tekstfunctie: kies de locatie met een kopie (`[...locations].sort(...)`), toon `+n`
  bij meerdere, en zet `timeLabel` erachter.
- Vervang `arraysEqual` door een variant die op kopieën sorteert (V8).

**1.4 Duidelijke meldingen bij ontbrekende of ongeldige instellingen (B4)**
- In `script.js`: ontbreekt `portal` of `token`, toon dan schermvullend
  "Rowizer is nog niet ingesteld" met de twee benodigde parameters, start geen API-verzoeken
  en zet `window.rowizerStarted = true` zodat de waakhond niet blijft herladen.
- `ZermeloAuthorizationError` bij het opstarten: melding "Token ongeldig of verlopen",
  opnieuw proberen na 15 minuten in plaats van elke minuut.
- Onbekende vestiging of meerdere vestigingen zonder `branch`: toon de foutmelding uit de
  connector op het scherm in plaats van alleen in de console.

**1.5 Lege toestand (B5)**
- Geen items: toon gecentreerd in het raster "Geen roosterwijzigingen".
- Geen dagrooster (`getTodayTimeSlots()` leeg): "Vandaag geen lessen" en verberg de
  afwezigenregel.

**1.6 Query-encoding (V3)**
- Bouw de URL in `Session.request` met `URLSearchParams`. Arrays (`fields`) blijven
  komma-gescheiden. Test met een locatienaam met spatie.

**1.7 Stabiele sortering (V7)**
- Eén vergelijkfunctie: type (activiteit, toets, les) → groepsnaam
  (`localeCompare` met `numeric: true`) → beginuur. Test op de fixtures dat de volgorde bij
  herhaald renderen identiek is.

### Fase 2 – Leesbaarheid

**2.1 Schalende typografie (L1)**
- Zet op `html` een basisgrootte die met het scherm meegroeit, bijvoorbeeld
  `font-size: clamp(14px, 1.25vw, 48px)`, en reken marges, kolomtussenruimte en de
  `max-height: 20px`/`max-width: 15px` van de koppen om naar `em`/`rem`.
- Titel en klok 1,6× de basisgrootte.
- Nieuwe URL-parameter `scale` (standaard `1`) als vermenigvuldiger, zodat een school kan
  bijstellen zonder browserzoom. Documenteer in de README.
- Klaar als: op 1920×1080 en 3840×2160 ziet het bord er verhoudingsgewijs gelijk uit en past
  de demodag zonder scrollen bij `scale=1`.

**2.2 Alleen de lesuren van vandaag als kolom (L2, V4)**
- Bepaal de kolommen uit `connector.getTodayTimeSlots()` in plaats van uit alle
  lesuurnamen; laat lege kolommen aan het eind van de dag weg (nooit in het midden).
- Maak één plek die rangnummer → kolomindex vertaalt en gebruik die voor koppen, voor
  `--start-hour`/`--end-hour` en voor afspraken zonder lesuur. Daarmee vervalt de aanname
  dat rangnummers bij 1 beginnen.
- Test met een fixturevariant met een nulde uur.

**2.3 Huidig lesuur markeren (L3)**
- Elke minuut: geef de kolomkop van het lopende lesuur een klasse `current` en items die
  volledig voorbij zijn een klasse `past` (lagere dekking, niet verbergen).
- Alleen als de getoonde datum vandaag is. Geen herbouw van de tabel; alleen klassen wisselen.

**2.4 Legenda en tijdstip van verversen (L4)**
- Eén regel onderaan: gekleurde blokjes "activiteit", "toets", "vervalt", "nieuw vandaag",
  rechts "bijgewerkt 10:35". De bestaande statusmelding bij storing blijft.

**2.5 Uitval herkenbaar maken (L5)**
- Geef `.appointment.cancelled` een eigen stijl (bijvoorbeeld een rode rand links en het
  woord "vervalt" vet). Houd het contrast van zwarte tekst op de achtergrond minimaal 7:1.
- De uitzondering `div.appointment.activity.cancelled` in `styles.css:140` gaat hierin op.

**2.6 Pagina-basis (L6)**
- `<html lang="nl">`, `<title>Roosterwijzigingen</title>`, `cursor: none` op `body`,
  lege `<style>` en uitgecommentarieerde script-tag weg.
- Vervang `overflow-y: overlay` en corrigeer de scrollbalk-selector (zie §2.4).

### Fase 3 – Functionele uitbreidingen

**3.1 Niet-getoonde gegevens niet meer ophalen (V1)**
- Besluit 1: alleen uitvoeren als 3.3 afvalt.
- Verwijder de categorie `invalid` uit `changes.js:55-57`.
- Klaar als: 4 in plaats van 5 `appointments`-verzoeken per ronde en hetzelfde bord.

**3.2 Rusttijden (V2)**
- Buiten een instelbaar venster (parameter `active`, standaard `06:30-18:00`, alleen op
  dagen met een dagrooster) niet pollen; het bord blijft staan met de laatste stand.
- Eerste verversing direct bij het begin van het venster.

**3.3 Verplaatste lessen op het oude uur tonen**
- Nu verschijnt een verplaatste les alleen op het nieuwe uur; op het oude uur staat niets.
- Gebruik de `invalid`-afspraken om op het oorspronkelijke uur "verplaatst naar u5" te tonen,
  mits er voor die groep op dat uur niets anders op het bord staat.
- Koppel oud en nieuw via `appointmentInstance`. Eerst op de fixtures uitzoeken of dat veld
  daarvoor betrouwbaar is; zo niet, deze stap melden en overslaan.

**3.4 Morgen tonen na de laatste les – niet uitvoeren (besluit 2)**
- Parameter `tomorrowAfter` (bijvoorbeeld `16:30`, standaard uit). Daarna toont het bord de
  eerstvolgende dag met een dagrooster, met de datum duidelijk in de titel
  ("Roosterwijzigingen morgen – donderdag 24 september").
- De connector laadt het dagrooster nu één keer per week; controleer dat de weekwissel
  (vrijdagmiddag → maandag) het juiste `realizedweektimetable` ophaalt.

**3.5 Zelf bijwerken na een deploy (V5)**
- Elke verversronde `js/version.js` ophalen met `cache: "no-store"`; wijkt de versie af van
  de geladen versie, dan `window.rowizerReload()`.
- Laat de stempel door een GitHub Action zetten bij een push naar `master` in plaats van met
  de hand, zodat de hash klopt. Besluit 4: alleen in
  `origin`. In de `live`-repo blijft de stempel handwerk; de versiecontrole werkt daar ook mee.

**3.6 Token minder zichtbaar (V6)**
- `<meta name="referrer" content="no-referrer">` in `index.html` (altijd doen).
- Optioneel, achter parameter `rememberToken=1`: token in `localStorage` bewaren en met
  `history.replaceState` uit de adresbalk halen. Niet standaard aanzetten: het is onbekend of
  de signage-speler opslag bewaart.

### Fase 4 – Opruimen

**4.1 Dode code verwijderen**
- `changedRecord.js`, `changedRecordHolder.js` en de import in `changes.js:1`; `connector.js`
  (laat `ZermeloConnector` niets meer uitbreiden, verwijder `super(options)`); lege
  `merge()`-methodes; `Number(r.id)` in `manager.js:11`; de ongebruikte velden `#date`,
  `#schoolInYear` in `Changes`.
- Ongebruikte managers laten staan (besluit 5); ze kosten niets tijdens het draaien en
  houden een latere merge met upstream eenvoudig.

**4.2 Debug achter een schakelaar**
- `window.ad/cm/zc/dc` en het loggen van complete afspraken alleen met `?debug=1`.
  `window.pretendLikeIts` hoort daar ook bij.

**4.3 Keuzeles-logica naar de controller**
- Verplaats `changesUiManager.js:108-149` naar `Changes`: elke afspraak krijgt een lijst
  `targets` (`{id, name, extendedName, isMainGroup, department}`), ook de afspraken met
  gewone groepen. De view loopt alleen nog over `targets`.
- Geen zichtbaar verschil; de fixturetest uit 0.2 moet identiek blijven.

**4.4 README bijwerken**
- Nieuwe parameters, de lokale testinstructie, `npm test`, en een verwijzing naar dit plan.
- Corrigeer "Highlights new changes (made after 8AM)": de code gebruikt 01:00
  (`changesUIRecord.js:24-29`).

## 5. Aanbevolen volgorde en omvang

| Blok | Stappen | Waarom in deze volgorde |
|---|---|---|
| A | 0.1 – 0.4 | Zonder tests is elke volgende stap alleen op het oog te controleren |
| B | R.1 – R.4 | Fundament: foutsoorten, controle, verzoekbeleid, momentopname |
| C | R.5 – R.9 | Juiste lesuren, juiste tijd, dagwissel zonder herladen, veilig tekenen |
| D | R.10 – R.14 | Planner, waakhond, tokencontrole, diagnose, storingsmatrix |
| E | 1.1, 1.2, 1.3, 1.5 | Fouten die leerlingen nu zien |
| F | 2.1, 2.2 | Grootste winst in leesbaarheid; 2.2 bouwt op R.5 |
| G | 1.4 (instelscherm), 1.6, 1.7, 2.3 – 2.6 | Afwerking |
| H | 3.2, 3.5 (3.1 alleen als 3.3 afvalt) | Minder verzoeken, sneller uitrollen |
| I | 3.3, R.16, R.17 | Besloten in §6 |
| – | R.15 | Optioneel; begint met uitzoeken wat `modifiedSince` meldt |
| – | 3.4 | Vervalt (besluit 2) |
| J | 4.1 – 4.4 | Kan tussendoor, 4.3 pas na blok A |

Wie snel zichtbaar resultaat wil, kan blok E naar voren halen (na A); het raakt andere
bestanden dan B en C, op `absences.js` na.

Samenhang met eerdere stappen:

- 1.4 gaat grotendeels op in R.10; alleen het instelscherm bij ontbrekende parameters blijft.
- 2.2 en 2.3 gebruiken de lesuren per afdeling uit R.5.
- 3.2 (rusttijden) gebruikt de planner uit R.10. Voeg daar het endpoint `holidays` aan toe:
  in een vakantie "Vakantie – <naam>" tonen en niet pollen.
- 3.5 (nieuwe versie) is na R.7 de enige reguliere aanleiding om de pagina te herladen.
- 3.6 vervalt door R.13, op de `referrer`-metatag na.

Fase R is de grootste: de connector, de sessie en `script.js` worden grotendeels herschreven
en er komen ongeveer 6 modules bij. De overige blokken raken samen ongeveer 12 bestanden.

## 6. Besluiten

Vastgelegd op 10-11-2026. Vraag 7 en 8 zijn door Tom beantwoord; bij de overige is het
voorstel uit de analyse overgenomen. Dit zijn geen open vragen meer: voer de stappen uit
zoals hier besloten.

| # | Onderwerp | Besluit | Gevolg |
|---|---|---|---|
| 1 | Verplaatste lessen (3.3) | Op het oude uur "verplaatst naar u5" tonen, mits de koppeling via `appointmentInstance` op de fixtures betrouwbaar blijkt | 3.3 uitvoeren; 3.1 vervalt dan (de `invalid`-afspraken zijn nodig). Blijkt de koppeling onbetrouwbaar: 3.3 overslaan en 3.1 uitvoeren |
| 2 | Morgen tonen (3.4) | Niet doen | 3.4 overslaan |
| 3 | Rusttijden (3.2) | Venster 06:30-18:00 als standaard | 3.2 uitvoeren |
| 4 | Versiestempel via GitHub Action (3.5) | Alleen in `origin`, niet in de `live`-repo | 3.5 uitvoeren; de workflow mag niets naar `live` pushen |
| 5 | PR's naar upstream | Voorlopig niet; alles blijft in de eigen fork | Geen PR's openen. 4.1: dode code verwijderen, ongebruikte managers laten staan |
| 6 | Afwezigen (1.1) | Bereik tonen: `krh (1-3)` | 1.1 zoals beschreven |
| 7 | Speler | Chromium 145.0.7632.116 op een Raspberry Pi met Debian 12 (bookworm), tijdzone Amsterdam | Zie werkafspraak 4. R.16 en R.17 zijn zinvol en worden uitgevoerd. R.6: de tijdzone is goed, maar een Pi heeft geen klok met batterij; de klokcontrole blijft dus nodig |
| 8 | Dagroosters per afdeling (R.5) | Het Coornhert gebruikt er geen verschillende | R.5 in de eenvoudige vorm: één dagrooster, met een waarschuwing in de diagnose als er meer blijken te zijn |
| 9 | Meldingen op het scherm (R.10) | Neutrale tekst op het scherm, technische details alleen in het diagnosepaneel | Teksten in R.10 en R.12 aangepast |
| 10 | Zermelo-limieten | Zermelo hanteert geen verzoeklimiet per token. De app houdt zichzelf aan een eigen budget: 200 verzoeken per 10 minuten en 2500 per etmaal, per scherm; hoogstens 3 tegelijk met 100 ms ertussen | Budget en retrybeleid uit R.3 uitvoeren. Eerst 60 per 10 minuten; bij het testen op 18-11-2026 verhoogd naar 100, omdat twee keer verversen plus een paar extra rondes (elk opstarten ~20 verzoeken inclusief herhalingen) het bord minutenlang leeg liet. Op verzoek van Tom (18-11-2026) naar 200, 3 tegelijk en 100 ms, en de planner start binnen 2 s in plaats van 0-20 s: het eerste bord staat er nu na ~3 s in plaats van ~10 s (afwezigen ~2 s in plaats van ~21 s) |

## 7. Stand van uitvoering

Bijgewerkt op 18-11-2026. Alles staat in PR's naar `master` van `tomkooij/Rowizer`: #4 (fase 0,
R en 1, gemerged), #5 (herstel `overflow-x`, gemerged), #6 (fase 2), #7 (fase 3) en de PR van
`plan/fase-4-opruimen` (fase 4, R.16, R.17 en de rest).

| Stap | Stand |
|---|---|
| 0.1 – 0.4, R.1 – R.14, 1.1 – 1.7 | Gedaan |
| R.6 | Klokcontrole gedaan. Rekenen in een vaste tijdzone niet (besluit 7, 32 plekken in de code); wel een melding `tijdzone <zone>` als het scherm een andere tijd geeft dan Europe/Amsterdam |
| R.15 | Overgeslagen. Op de demo-portal geeft `modifiedSince` alleen recent gewijzigde afspraken (3 van 496), maar of uitval en verwijderen erin komen, is alleen te zien door op een portal afspraken te wijzigen; dat is niet gedaan. Kan later op een eigen testportal |
| R.16, R.17 | Gedaan; zie S16 en S17 in `docs/STORINGSTEST.md` |
| 2.1 – 2.6 | Gedaan |
| 3.1 | Vervalt (besluit 1): 3.3 heeft de ongeldige afspraken nodig |
| 3.2, 3.3, 3.5, 3.6 | Gedaan; bij 3.2 ook de vakanties uit §5. Afwijking bij 3.5: de nachtelijke herlading blijft, als dagelijkse schone start |
| 3.4 | Vervalt (besluit 2) |
| 4.1 – 4.4 | Gedaan; ongebruikte managers blijven staan (besluit 5) |
| S1 – S17 | Zie `docs/STORINGSTEST.md`; alleen S15 (72 uur) moet nog op een echte Pi |
