// Scoreboard: shown while holding Tab, and as the results screen when a match ends.
import { MODES, TEAMS, colorToCss } from '/shared/protocol.js';

const $ = (id) => document.getElementById(id);

export function formatTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export class Scoreboard {
  constructor() {
    this.el = $('scoreboard');
    this.title = $('sb-title');
    this.sub = $('sb-sub');
    this.body = $('sb-body');
    this.visible = false;
    this.nextRender = 0;
  }

  show(on) {
    if (on === this.visible) return;
    this.visible = on;
    this.el.classList.toggle('hidden', !on);
    this.nextRender = 0;
  }

  /** d = { roster, room, myId, pings: Map, serverNow } */
  render(d, nowMs) {
    if (!this.visible || nowMs < this.nextRender) return;
    this.nextRender = nowMs + 250;
    const { room, myId } = d;
    const mode = MODES[room.mode];
    const ended = room.state === 'ended' && room.results;

    // Rows come from the final standings at match end, otherwise the live roster.
    const rows = (ended ? room.results.standings : [...d.roster.values()])
      .slice().sort((a, b) => b.kills - a.kills || b.score - a.score || a.deaths - b.deaths);

    if (ended) {
      const w = room.results.winner;
      if (w.draw) this.title.textContent = "It's a draw!";
      else if (w.team) this.title.textContent = `${TEAMS[w.team].name} team wins!`;
      else this.title.textContent = w.id === myId ? 'You win!' : `${w.name} wins!`;
      this.title.style.color = w.team ? TEAMS[w.team].css : '';
      this.sub.textContent = `${mode.name} · next match in ${formatTime((room.nextStartAt - d.serverNow) / 1000)}`;
    } else {
      this.title.textContent = mode.name;
      this.title.style.color = '';
      this.sub.textContent = `${formatTime((room.endsAt - d.serverNow) / 1000)} left · ${mode.teams ? 'most team kills wins' : 'most kills wins'}`;
    }

    this.body.replaceChildren();
    if (mode.teams) {
      const kills = (ended ? room.results.teamKills : room.teamKills) ?? { red: 0, blue: 0 };
      for (const team of ['red', 'blue']) {
        this.body.appendChild(this.table(rows.filter((r) => r.team === team), d,
          `${TEAMS[team].name} team — ${kills[team]} kill${kills[team] === 1 ? "" : "s"}`, TEAMS[team].css));
      }
    } else {
      this.body.appendChild(this.table(rows, d, null));
    }
  }

  table(rows, d, heading, headingColor) {
    const wrap = document.createElement('div');
    wrap.className = 'sb-table';
    if (heading) {
      const h = document.createElement('h3');
      h.textContent = heading;
      h.style.color = headingColor;
      wrap.appendChild(h);
    }
    const t = document.createElement('table');
    const head = t.insertRow();
    for (const label of ['#', 'Pilot', 'Kills', 'Deaths', 'Score', 'Ping']) {
      const th = document.createElement('th');
      th.textContent = label;
      head.appendChild(th);
    }
    rows.forEach((r, i) => {
      const tr = t.insertRow();
      if (r.id === d.myId) tr.className = 'me';
      const ping = d.pings.get(r.id) ?? r.ping ?? 0;
      const cells = [i + 1, r.name + (r.host ? ' ★' : ''), r.kills, r.deaths, r.score, `${ping} ms`];
      cells.forEach((c, j) => {
        const td = tr.insertCell();
        td.textContent = c;
        if (j === 1) td.style.color = r.team ? TEAMS[r.team].css : colorToCss(r.color);
      });
    });
    if (!rows.length) {
      const td = t.insertRow().insertCell();
      td.colSpan = 6;
      td.textContent = 'Nobody yet';
      td.className = 'empty';
    }
    wrap.appendChild(t);
    return wrap;
  }
}
