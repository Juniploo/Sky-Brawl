// Plane + colour picker (used on the start menu and in the Esc menu).
// Planes and their stats come straight from shared/planes.js, so new planes appear automatically.
import { PLANES, DEFAULT_PLANE } from '/shared/planes.js';
import { PLAYER_COLORS, colorToCss } from '/shared/protocol.js';

const STORE = 'skybrawl.loadout';

// Stat bars, each scaled against the best plane.
const STATS = [
  ['Speed', (p) => p.maxSpeed],
  ['Agility', (p) => p.pitchRate],
  ['Armour', (p) => p.health],
  ['Guns', (p) => p.gun.damage * p.gun.fireRate],
  ['Missiles', (p) => p.missiles]
];

export function loadLoadout() {
  const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
  return {
    plane: PLANES[saved.plane] ? saved.plane : DEFAULT_PLANE,
    color: PLAYER_COLORS.includes(saved.color) ? saved.color : PLAYER_COLORS[0]
  };
}

export function saveLoadout(l) {
  localStorage.setItem(STORE, JSON.stringify(l));
}

/** Builds the picker inside `container`. onChange(loadout) runs whenever the player picks something. */
export function buildLoadoutPicker(container, onChange) {
  const state = loadLoadout();
  container.classList.add('loadout');
  container.innerHTML = '<div class="plane-cards"></div><div class="swatches"></div>';
  const cards = container.querySelector('.plane-cards');
  const swatches = container.querySelector('.swatches');

  const best = Object.fromEntries(STATS.map(([name, get]) => [name, Math.max(...Object.values(PLANES).map(get))]));
  for (const [key, plane] of Object.entries(PLANES)) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'plane-card';
    card.dataset.plane = key;
    const title = document.createElement('b');
    title.textContent = plane.name;
    const desc = document.createElement('small');
    desc.textContent = plane.description;
    card.append(title, desc);
    for (const [name, get] of STATS) {
      const row = document.createElement('div');
      row.className = 'stat';
      row.innerHTML = '<span></span><i><u></u></i>';
      row.firstChild.textContent = name;
      row.querySelector('u').style.width = `${(get(plane) / best[name]) * 100}%`;
      card.appendChild(row);
    }
    card.addEventListener('click', () => { state.plane = key; changed(); });
    cards.appendChild(card);
  }

  for (const color of PLAYER_COLORS) {
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'swatch';
    sw.style.background = colorToCss(color);
    sw.dataset.color = color;
    sw.title = 'Plane colour';
    sw.addEventListener('click', () => { state.color = color; changed(); });
    swatches.appendChild(sw);
  }

  function render() {
    for (const c of cards.children) c.classList.toggle('selected', c.dataset.plane === state.plane);
    for (const s of swatches.children) s.classList.toggle('selected', Number(s.dataset.color) === state.color);
  }
  function changed() {
    saveLoadout(state);
    render();
    onChange?.({ ...state });
  }
  render();
  return {
    get value() { return { ...state }; },
    /** Re-read the saved choice (when the other picker changed it). */
    refresh() { Object.assign(state, loadLoadout()); render(); }
  };
}
