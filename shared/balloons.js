// Target balloons. Their movement is a pure function of time, so the server
// and every browser agree where they are without sending positions each tick.

export const BALLOON_HP = 40;
export const BALLOON_RADIUS = 8.5;
export const BALLOON_COLORS = [0xff4d6d, 0xffc93c, 0x4dd8ff, 0x9b5de5, 0x3ddc84, 0xff8c42];

export function makeBalloonWave(map, terrain, startId, count) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 150 + Math.random() * map.boundary * 0.75;
    const ax = Math.cos(angle) * dist, az = Math.sin(angle) * dist;
    const ay = terrain.surfaceAt(ax, az) + 60 + Math.random() * 160;
    list.push({
      id: startId + i,
      ax: Math.round(ax), ay: Math.round(ay), az: Math.round(az),
      phase: Math.round(Math.random() * 1000) / 100,
      color: BALLOON_COLORS[i % BALLOON_COLORS.length],
      hp: BALLOON_HP
    });
  }
  return list;
}

/** Where balloon `b` is at time `t` (seconds). */
export function balloonPos(b, t, out) {
  return out.set(
    b.ax + Math.sin(t * 0.1 + b.phase) * 25,
    b.ay + Math.sin(t * 0.8 + b.phase) * 3,
    b.az + Math.cos(t * 0.1 + b.phase) * 25
  );
}
