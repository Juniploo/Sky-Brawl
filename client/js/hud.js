// On-screen HUD (plain HTML elements drawn on top of the 3D canvas).
import { formatTime } from './scoreboard.js';
const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.root = $('hud');
    this.aim = $('aim-reticle');
    this.bore = $('boresight');
    this.hit = $('hitmarker');
    this.msg = $('message');
    this.warn = $('warning');
    this.noticeEl = $('notice');
    this.feedEl = $('killfeed');
    this.flashEl = $('damage-flash');
    this.labelLayer = $('labels');
    this.lockBox = $('lock-box');
    this.threatEl = $('threat');
    this.matchMode = $('match-mode');
    this.matchTimer = $('match-timer');
    this.teamScore = $('team-score');
    this.missilePips = $('missile-pips');
    this.flarePips = $('flare-pips');
    this.lastThreat = null;
    this.lastPips = '';
    this.els = {
      score: $('score'), kills: $('kills'), deaths: $('deaths'), balloons: $('balloons'),
      speed: $('speed'), alt: $('alt'),
      health: $('health-fill'), throttle: $('throttle-fill'), heat: $('heat-fill'),
      heatLabel: $('heat-label'), boost: $('boost-fill'),
      roomCode: $('room-code'), roomCount: $('room-count'), ping: $('ping')
    };
    this.hitTimer = 0;
    this.flashTimer = 0;
    this.noticeTimer = 0;
    this.lastMsg = null;
    this.lastWarn = null;
  }

  show(on) { this.root.classList.toggle('hidden', !on); }

  /** pos = {x, y} in pixels, or null to hide. */
  place(el, pos) {
    if (!pos) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
  }

  setAim(pos) { this.place(this.aim, pos); }
  setBoresight(pos) { this.place(this.bore, pos); }

  setRoom(code, count) {
    this.els.roomCode.textContent = code;
    this.els.roomCount.textContent = `· ${count} pilot${count === 1 ? '' : 's'}`;
  }

  /** Match bar at the top: mode, time left, team score. */
  setMatch(modeShort, secondsLeft, ended, teamKills) {
    this.matchMode.textContent = modeShort;
    this.matchTimer.textContent = ended ? 'MATCH OVER' : formatTime(secondsLeft);
    this.matchTimer.style.color = !ended && secondsLeft <= 30 ? '#ff5050' : '';
    if (teamKills) {
      this.teamScore.innerHTML = '<span class="red"></span> : <span class="blue"></span>';
      this.teamScore.children[0].textContent = 'RED ' + teamKills.red;
      this.teamScore.children[1].textContent = teamKills.blue + ' BLUE';
    } else this.teamScore.textContent = '';
  }

  /** Lock-on box around the target. progress 0..1 (1 = locked), pos null = hide. */
  setLock(pos, progress) {
    if (!pos || progress <= 0) { this.lockBox.style.display = 'none'; return; }
    const size = 90 - 50 * progress;
    this.lockBox.style.display = 'block';
    this.lockBox.style.width = this.lockBox.style.height = size + 'px';
    this.lockBox.style.transform = `translate(${pos.x - size / 2}px, ${pos.y - size / 2}px)`;
    this.lockBox.classList.toggle('locked', progress >= 1);
  }

  /** Warning when someone locks on to you ('lock') or a missile is coming ('missile'). */
  setThreat(kind) {
    if (kind === this.lastThreat) return;
    this.lastThreat = kind;
    this.threatEl.className = kind || '';
    this.threatEl.textContent = kind === 'missile' ? 'MISSILE INCOMING — PRESS F!' : kind === 'lock' ? 'ENEMY LOCKING ON' : '';
  }

  setWeapons(missiles, maxMissiles, missileReloading, flares, maxFlares, flareReloading) {
    const key = [missiles, maxMissiles, missileReloading, flares, maxFlares, flareReloading].join();
    if (key === this.lastPips) return;
    this.lastPips = key;
    const pips = (el, n, max, reloading) => {
      el.innerHTML = '';
      for (let i = 0; i < max; i++) {
        const p = document.createElement('i');
        if (i >= n) p.className = 'empty';
        el.appendChild(p);
      }
      el.classList.toggle('reloading', reloading);
    };
    pips(this.missilePips, missiles, maxMissiles, missileReloading);
    pips(this.flarePips, flares, maxFlares, flareReloading);
  }

  setPing(ms) { this.els.ping.textContent = `· ${ms} ms`; }

  update(d, dt) {
    const e = this.els;
    e.score.textContent = d.score;
    e.kills.textContent = d.kills;
    e.deaths.textContent = d.deaths;
    e.balloons.textContent = d.balloons;
    e.speed.textContent = Math.round(d.speed * 3.6);
    e.alt.textContent = Math.round(d.altitude);
    e.health.style.width = `${(Math.max(0, d.health) * 100).toFixed(1)}%`;
    e.health.style.background = d.health < 0.35 ? '#ff4a4a' : '';
    e.throttle.style.width = `${(d.throttle * 100).toFixed(1)}%`;
    e.heat.style.width = `${(d.heat * 100).toFixed(1)}%`;
    e.heat.classList.toggle('over', d.overheated);
    e.heatLabel.classList.toggle('over', d.overheated);
    e.heatLabel.textContent = d.overheated ? 'OVERHEAT' : 'GUNS';
    e.boost.style.width = `${(d.boost * 100).toFixed(1)}%`;

    if (this.hitTimer > 0 && (this.hitTimer -= dt) <= 0) this.hit.classList.remove('show', 'kill');
    if (this.flashTimer > 0 && (this.flashTimer -= dt) <= 0) this.flashEl.classList.remove('show');
    if (this.noticeTimer > 0 && (this.noticeTimer -= dt) <= 0) this.noticeEl.style.opacity = '0';
  }

  hitMarker(kill = false) {
    this.hit.classList.add('show');
    this.hit.classList.toggle('kill', kill);
    this.hitTimer = Math.max(this.hitTimer, kill ? 0.4 : 0.12);
  }

  damageFlash() {
    this.flashEl.classList.add('show');
    this.flashTimer = 0.08;
  }

  /** Big yellow text for a couple of seconds ("You shot down Sam!"). */
  notice(text) {
    this.noticeEl.textContent = text;
    this.noticeEl.style.opacity = '1';
    this.noticeTimer = 2.2;
  }

  message(text) {
    if (text === this.lastMsg) return;
    this.lastMsg = text;
    this.msg.textContent = text || '';
  }

  warning(text) {
    if (text === this.lastWarn) return;
    this.lastWarn = text;
    this.warn.textContent = text || '';
    this.warn.style.display = text ? '' : 'none';
  }

  /** Adds a line to the kill feed (top right). Fades out after a few seconds. */
  feed(text, highlight = false) {
    const line = document.createElement('div');
    line.textContent = text;
    if (highlight) line.className = 'mine';
    this.feedEl.prepend(line);
    while (this.feedEl.children.length > 6) this.feedEl.lastChild.remove();
    setTimeout(() => { line.style.opacity = '0'; }, 5500);
    setTimeout(() => line.remove(), 6000);
  }
}
