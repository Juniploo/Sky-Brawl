# Sky Brawl

Arcade 3D dogfights in the browser. Three.js + Node.js.

## Run it

**Easiest:** double-click **`start.bat`** in this folder. It installs packages the first time,
starts the server and opens the game in your browser. Close its window to stop the server.

Or from a terminal:

```
npm install     (first time only)
npm start
```

(If PowerShell says *"running scripts is disabled on this system"*, use `npm.cmd start` instead,
or just use `start.bat`.)

Play in **Chrome, Edge or Firefox**: they lock the mouse inside the game so it can't wander
off-screen. The browser pane inside the Claude app can't lock the mouse.

Then open http://localhost:3000, type a name and press **Create room**.
You get a 4-letter room code (top left). Press **Esc** for an invite link.

### Playing with friends right now (same Wi-Fi / home network)
1. Find your PC's local IP: run `ipconfig` and look for "IPv4 Address" (e.g. 192.168.1.23).
2. Friends open `http://192.168.1.23:3000/?room=CODE` in their browser.
3. If Windows Firewall asks about Node.js, allow it on **private networks**.

Playing over the internet (free hosting) comes in Phase 5.

### Testing multiplayer without friends
With the server running, in a second terminal:

```
npm run test:net
```

Two bot pilots join a room and one hunts the other; it prints hits and kills.
To send the bots into your own game, set `ROOM` to your room code first
(PowerShell: `$env:ROOM="ABCD"; npm run test:net`).

`npm run test:combat` does the same with missiles and flares, and checks mode
switching, teams and match results. `ROOM` works for it too.

To test match endings without waiting 5 minutes, start the server with short matches:
`$env:MATCH_LENGTH=30; npm start`

## Controls

| Input | Action |
|---|---|
| Mouse | Aim (the plane steers toward the white circle) |
| W / S | Throttle up / down |
| A / D | Roll |
| Shift | Boost |
| Left click | Machine guns (they overheat) |
| Right click | Homing missile (needs a lock first, see below) |
| F | Flares: fool missiles that are chasing you |
| Tab | Scoreboard |
| M | Music on / off |
| Esc | Menu: invite link, plane & colour, match settings, sound, leave room |

The yellow cross shows where your nose (and guns) point right now. The white circle is where you want to go.

**Missiles:** keep an enemy near your nose. A yellow box appears and shrinks; when it
turns red ("LOCK"), right click. The missile is faster than any plane but turns slower,
so the target can dodge with a hard turn, or pop flares.

**Flares:** when you see "MISSILE INCOMING", press F. Every missile chasing you goes for the
flares instead, and anyone locking on to you loses their lock. Limited per life, with a cooldown.

## Planes, colours and maps

Pick a plane and colour on the start menu, or change them any time in the Esc menu
(the colour changes straight away; a new plane is used from your next respawn).

| Plane | Style |
|---|---|
| F-16 Falcon | Starter: balanced all-rounder |
| F-22 Raptor | Interceptor: fastest and most agile, but only 70 health and 2 missiles |
| F/A-18 Hornet | Tightest turns, slower top speed, 4 flares |
| F-15 Eagle | Fast and tough with strong guns, wide turns, 6 missiles |
| F-14 Tomcat | Heavy fighter: slow, 160 health, 8 missiles; its wings sweep back as you speed up |

See them all at **http://localhost:3000/hangar.html** (drag to spin).

The host picks the map in the Esc menu: **Tropical Islands**, **Snowy Mountains**
(fly through the valleys) or **Desert Canyon** (fly low through the canyons).

**Add a plane:** copy an entry in `shared/planes.js` (stats) and the entry with the same key in
`client/js/aircraft.js` (shape: wing outline, fins, intakes, engines; all just numbers).
It appears in the picker and hangar automatically.
**Add a map:** copy an entry in `shared/maps.js`; terrain types are `islands`, `mountains`, `canyon`.

## Sound and music

Everything is generated in code, so there are no audio files to download: engine hum, guns,
explosions, missile launches, flares, hit/kill sounds, lock-on tones, warning beeps
and a music loop. Volumes are in the Esc menu; **M** turns music on/off.
**Your own music:** put a file at `client/audio/music.mp3` and it plays instead.

## Game modes

Matches last 5 minutes, then the results show for 10 seconds and a new match starts.
The host (★ on the scoreboard) picks the mode in the Esc menu; changing it starts a new match.

- **Free-for-all:** everyone against everyone; most kills wins.
- **Team Deathmatch:** red vs blue; the team with the most kills wins. No friendly fire.
  Teammates have a ▲ on their name tag.

## Folder layout

```
client/            what runs in the browser
  index.html       page + HUD + menus
  style.css
  js/main.js       setup, menus, main loop
  js/game.js       a match: your plane (predicted), others (smoothed), events
  js/net.js        connection to the server
  js/remotePlayers.js  other pilots' planes + name tags
  js/missiles.js   homing missiles you can see
  js/scoreboard.js Tab scoreboard + end-of-match results
  js/loadout.js    plane + colour picker
  js/audio.js      all sound effects and music
  js/jetModel.js   placeholder planes made of shapes, one look per plane (swap in your own)
  js/weapons.js    bullet tracers (visual only)
  js/balloons.js   practice targets
  js/effects.js    smoke, explosions
  js/world.js      sky, terrain, water, trees, clouds
  js/hud.js        on-screen display
  js/input.js      keyboard + mouse
shared/            used by both browser and server
  planes.js        ALL plane stats + missile and flare settings
  maps.js          the 3 maps: terrain type, colours, sky, trees, valleys/canyons
  terrain.js       terrain height generator
  flight.js        flight model (runs in browser AND server)
  guns.js          gun fire rate / overheat / hit maths
  balloons.js      target balloons
  protocol.js      multiplayer settings (tick rate, respawn, match length, modes, teams)
server/index.js    web server + Socket.io rooms
server/Room.js     one room: referee for movement, bullets, missiles, locks, kills, matches
tools/net-test.js  bot pilots for testing multiplayer
tools/combat-test.js  bots that test missiles, flares, modes and match results
```

## Tweaking

- Plane handling: `shared/planes.js` (speeds, turn rates, gun heat, damage)
- Island layout: `shared/maps.js`, the `islands` list (x, z, radius, height)
- Mouse sensitivity, camera distance: top of `client/js/game.js`
- Respawn time, spawn protection, points, match length: `shared/protocol.js`
- Missile speed/turning/damage, lock-on time, flare cooldown: `MISSILE` and `FLARE` in `shared/planes.js`

## How the multiplayer works

- Your browser sends your **inputs** (aim, keys) 30 times a second.
- The **server** flies every plane with the same code as your browser (`shared/flight.js`),
  moves bullets, and decides hits, health, kills and respawns, so nobody can cheat their health or aim.
- Your own plane is **predicted** in your browser so controls feel instant; if the server
  disagrees, your plane is quietly corrected.
- Other planes are drawn **100 ms in the past** and blended between updates, so they glide smoothly.
- When checking hits, the server **rewinds** targets by your ping, so if it looked like a hit on your screen, it counts.

## Online hosting (free, on Render.com)

The game is set up to run on [Render](https://render.com)'s free plan; `render.yaml` tells
Render everything it needs. Once it's online, anyone can play at your
`https://<name>.onrender.com` address, and invite links work the same way.

1. Put this folder on GitHub (a free account and an empty repository called `sky-brawl`).
2. On render.com, sign in with GitHub, choose **New + → Blueprint**, pick the `sky-brawl`
   repository and press **Apply**. The first build takes a few minutes.
3. Every time you push changes to GitHub, Render updates the live game automatically.

About the free plan: the server **falls asleep after ~15 minutes with nobody playing**. The
next visitor waits about a minute while it wakes up, then it's normal. Rooms are lost when
it sleeps or updates (everyone just creates a new room).
