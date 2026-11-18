# Visualize changes in class schedules from Zermelo

With the growing call to ban phones from schools an ancient, almost forgotten concept is on the rise again: a method 
to view today's changes on a screen. This project aims to provide a simple, secure and free way to show relevant 
information on screens. 

Rowizer: 
- Determines the actual impact the changes have on the schedule: only relevant information[^1] is shown - no endless lists of changes. 
- Highlights new changes (made today, after 01:00)
- Always shows activities in green, exams in blue; cancelled items get a red stripe, moved lessons an orange one on their old period
- Automatically fetches new changes from Zermelo, and keeps working through network and Zermelo outages
- Shows absent teachers, with the periods they are absent: `krh (1-3)`
- Highlights the current period and dims what is over
- Scroll if there are too many changes



[^1]:  Cluster changes are currently always shown, in the future only relevant changes will appear. Eg: If entl4 with students X and Y is cancelled but biol1 (taken by student X) and ges2 (student Y) are moved to that period, the entl4 cancellation will not be shown - all students know where they have to go.

![Screenshot of a live Rowizer example](/assets/img/example.png)

## Try a demo
[Try a live demo!](https://vlietland-college.github.io/Rowizer/?token=6iqsebnp62kkmlmr25ruha99td&portal=j9qeq&date=23-9-2026&branch=a). The data is fetched from my development portal. 

## How to use?
So, you're an BIP or ASP and would like to try Rowizer? It will only take a minute and is completely free! And, since the application runs 100% in-browser, no data is sent to any servers (well, except Zermelo, but we trust them) so no need for any signatures!

### Get an API-token
[Zermelo has written a nice how-to](https://support.zermelo.nl/guides/applicatiebeheerder/koppelingen/overige-koppelingen-2/koppeling-met-overige-externe-partijen#stap_1_gebruiker_toevoegen)! 
> [!TIP]
> If you don't want to show the absent teachers don't add the "Afwezigen" authorization. Rowizer detects this automatically

### URL Parameters for testing
All settings are done by using URL-parameters. Only two (or three, if your school has multiple branches) are really needed to start: the token and the portal id (the part before .zportal.nl)
```
https://vlietland-college.github.io/Rowizer?token={API_TOKEN_HERE}&portal={PORTAL_NAME_HERE}
```
> [!TIP]
> You can also put all parameters after a `#` instead of a `?`, for example
> `https://vlietland-college.github.io/Rowizer/#token={API_TOKEN_HERE}&portal={PORTAL_NAME_HERE}`.
> The part after `#` is never sent to the web server, so the token stays between the screen and Zermelo.
> This is the recommended form; `?` keeps working.

If you have multiple branches, add:
```
&branch={BRANCH_CODE_HERE}
```
Rowizer will automatically show today. If you want to try another day, use the date parameter with DD-MM-YYYY format:
```
&date=19-6-2024
```

> [!WARNING]
> Rowizer is designed for (big) TV screens. The best result is achieved when using a 50 inch or lager 4K screen. 

### Use in production
You are very welcome to use Rowizer using our Github-pages. Bear in mind that things can change at any moment - we are not responsible for any breaking changes. We recommend creating your own fork and using Github pages. 


## URL Parameters
|Parameter| Example value              | required           | Description                                                                                                                                                                                                                                                                                                                                                                                |
|------|----------------------------|--------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|portal| j9qeq                      | x                  | The zportal ID (so the part before .zportal.nl                                                                                                                                                                                                                                                                                                                                             |
|token| ec2h7u9cd612a1gr11q5k1a4ou | x                  | The API-token [generated](https://support.zermelo.nl/guides/applicatiebeheerder/koppelingen/overige-koppelingen-2/koppeling-met-overige-externe-partijen) in your Zermelo portal                                                                                                                                                                                                           |
|branch| a                          | if multiple branches | The branch code (vestigingscode) found in Portal inrichting -> Vestigingen                                                                                                                                                                                                                                                                                                                 |
|date| 22-03-2024                 | | To test Rowizer you can use a different date                                                                                                                                                                                                                                                                                                                                               |
|external| extern                     | | If you the location with this name to an appointment, Rowizer will show the attending teachers just below the absent ones. This way, students will quickly see that a certain teacher is not available at school.                                                                                                                                                                          |
|departmentsIgnore| kopkl,vavo                 || Some departments should not be taken into consideration while determining if a whole education or yearOfEducation is present in an appointment.                                                                                                                                                                                                                                            |
|mergeAppointments| false                      | | Before Zermelo 24.07 apoointments that span multiple periods were published as seperate appointments. (See [the release docs](https://support.zermelo.nl/news/posts/release-2407#wat_is_een_publicatieblokn)). If this parameter is omitted or set to anything but 'false', Rowizer automatically merges these appointments based on successive periods and identical teachers and groups. 
|active| 07:00-17:00                        | | Time window in which the board refreshes; default 06:30-18:00. Outside it, and on days without lessons, the board keeps showing the last state and sends no requests to Zermelo. The first refresh happens right when the window starts. `off` refreshes around the clock. |
|rememberToken| 1                        | | Stores the token in the browser (localStorage) and removes it from the address bar; afterwards the address without `token` is enough. A new token in the address replaces the stored one. Off by default: if the player does not keep storage, the setup screen appears. Note that on GitHub Pages all projects of the same account (`<account>.github.io`) share one localStorage, so any page there can read the stored token; only use this on a host of its own. |
|scale| 1.2                        | | Makes everything on the screen larger or smaller (0.5 to 3) without browser zoom. Text already scales with the screen width; at 1 a busy day fits a 1920x1080 or 3840x2160 screen without scrolling. |
|sw| 0                        | | Removes the service worker. Normally it keeps a copy of Rowizer's own files, so the board still starts when GitHub Pages is unreachable (it always tries the network first, so new versions arrive as usual). Opening the board once with `sw=0` switches that off on this screen. |
|debug| 1                        | | Shows a diagnostics panel (requests, request budget, tasks, errors) and exposes `cm`, `zc`, `ad()` and `dc(date)` in the console. Never shows the token. |

## Running on a Raspberry Pi
Rowizer recovers from most problems by itself (lost network, Zermelo errors, a new day, a new version), but it cannot start the browser. Start Chromium so that it waits for the network and comes back after a crash. An example with a systemd user service in the desktop session (`~/.config/systemd/user/rowizer.service`, then `systemctl --user enable --now rowizer`); adjust the browser name (`chromium` or `chromium-browser`) and the session target to your setup:

```ini
[Unit]
Description=Rowizer kiosk
After=graphical-session.target
PartOf=graphical-session.target

[Service]
# wait at most 2 minutes for the network; the page also copes without it ($$ is a literal $ in systemd)
ExecStartPre=/bin/sh -c 'for i in $$(seq 60); do ping -c1 -W2 github.io >/dev/null 2>&1 && exit 0; sleep 2; done; exit 0'
ExecStart=/usr/bin/chromium --kiosk --noerrdialogs --disable-session-crashed-bubble --disable-infobars "https://<your-pages-host>/Rowizer/#portal=...&token=..."
Restart=always
RestartSec=10

[Install]
WantedBy=graphical-session.target
```

- Set the time zone to Europe/Amsterdam (`timedatectl set-timezone Europe/Amsterdam`) and keep NTP on. A Pi has no battery-backed clock: until NTP succeeds the clock is wrong. Rowizer compares its clock with the web server and uses the server time if they differ more than 2 minutes.
- Turn off screen blanking (for example `xset s off -dpms`, or in `raspi-config` → Display Options → Screen Blanking).

## Development
There is no build step: the page loads the ES modules in `js/` directly.

- Run locally: `python scripts/dev-server.py 8766` and open `http://localhost:8766/#token=...&portal=...`. This server sends `Cache-Control: no-store`, so the browser always loads the current modules.
- Tests: `npm test` (Node 22, no dependencies). The tests run in time zone Europe/Amsterdam and use recorded Zermelo data from `test/fixtures/`; record a new day with `scripts/record-fixtures.mjs`. The board for the demo day is compared line by line with `test/snapshots/board-2026-09-23.txt`.
- Failure scenarios and how they were tested: [docs/STORINGSTEST.md](docs/STORINGSTEST.md).
- Background and the plan behind recent changes: [docs/VERBETERPLAN.md](docs/VERBETERPLAN.md).
- After a push to `master`, a GitHub Action stamps `js/version.js`; screens notice the new version within 15 minutes and reload. In other copies run `scripts/stamp-version.sh` by hand.
