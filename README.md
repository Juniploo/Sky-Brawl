# Sky Brawl

Low-poly multiplayer jet dogfights in the browser. 21 real-scale aircraft from WWII props to stealth jets in a three-nation tech tree (accounts, XP, unlocks), parties with join codes, team deathmatch or free-for-all, guns, homing missiles, flares, three endless maps, and a practice mode against bots.

## Run locally
    npm install
    npm start
Then open http://localhost:3000

## Deploy on Render
`render.yaml` creates one free web service in the Frankfurt region. In the Render dashboard choose New > Blueprint and pick this repo, or create a Node web service with build command `npm install` and start command `npm start`.

## Files
- `server.js`: web server + WebSocket game server (parties, matches, damage, scores)
- `public/index.html`: the whole game client (Three.js)
- `public/models/*.glb`: the five jets

## Accounts database
Accounts, XP and unlocked planes are stored in Postgres when the `DATABASE_URL` environment variable is set
(use the database's Internal Database URL on Render). Without it the server keeps accounts in memory, which is
fine for local testing but resets whenever the server restarts.
