# Sky Brawl

Low-poly multiplayer jet dogfights in the browser. Five real-scale fighters (F-14, F-15C, F-16C, F-22A, F-35A), parties with join codes, team deathmatch or free-for-all, guns, homing missiles, flares, three endless maps, and a practice mode against bots.

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
