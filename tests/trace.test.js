// Tests du moteur de trace : node tests/trace.test.js
const { Trace, season, NM } = require('../trace.js');
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok    ' : 'ÉCHEC ') + m); if (!c) fail++; };
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const gauss = s => s * Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const LAT0 = 48.64, LON0 = -2.25, mPerDegLat = 111132, mPerDegLon = 111320 * Math.cos(LAT0 * Math.PI / 180);
// route vers l'est à vitesse donnée, un point toutes les dt secondes, bruit gaussien (m)
function leg(pts, t0, x0, y0, kn, durS, dt, noise, headingDeg) {
  const v = kn * 1852 / 3600, h = (headingDeg ?? 90) * Math.PI / 180; let x = x0, y = y0, t = t0;
  for (let s = 0; s <= durS; s += dt) {
    x = x0 + Math.sin(h) * v * s; y = y0 + Math.cos(h) * v * s; t = t0 + s * 1000;
    pts.push({ t, lat: LAT0 + (y + gauss(noise)) / mPerDegLat, lon: LON0 + (x + gauss(noise)) / mPerDegLon, acc: 5, sog: leg.sog ? kn + gauss(0.15) : undefined });
  }
  return { t, x, y };
}
{ // 1 mille à 5 nds
  const p = []; leg(p, 0, 0, 0, 5, 720, 2, 1.5); const s = Trace.fromPoints(p).stats();
  ok(Math.abs(s.distanceNM - 1) < 0.05, `1 M à 5 nds : ${s.distanceNM.toFixed(3)} M`);
  ok(Math.abs(s.avgKn - 5) < 0.3, `moyenne ${s.avgKn.toFixed(2)} nds (5)`);
  ok(Math.abs(s.peakKn - 5) < 0.5, `pointe ${s.peakKn.toFixed(2)} nds (5)`);
}
{ // saut GPS rejeté
  const p = []; leg(p, 0, 0, 0, 5, 300, 2, 1); p.splice(50, 0, { t: p[49].t + 1000, lat: LAT0 + 0.02, lon: LON0, acc: 5 });
  const tr = Trace.fromPoints(p), s = tr.stats(); ok(tr.rejected >= 1 && s.distanceNM < 0.45, `saut de 2 km ignoré (${s.distanceNM.toFixed(3)} M, ${tr.rejected} rejeté)`);
}
{ // point imprécis rejeté
  const tr = new Trace(); tr.add({ t: 0, lat: LAT0, lon: LON0, acc: 5 }); ok(!tr.add({ t: 2000, lat: LAT0 + 1e-4, lon: LON0, acc: 80 }), 'point à 80 m de précision ignoré');
}
{ // à quai 10 min
  const p = []; for (let s = 0; s < 600; s += 2) p.push({ t: s * 1000, lat: LAT0 + gauss(1.5) / mPerDegLat, lon: LON0 + gauss(1.5) / mPerDegLon, acc: 5 });
  const s = Trace.fromPoints(p).stats(); ok(s.distanceNM < 0.03 && s.movingS < 60, `à quai : ${(s.distanceNM * 1852).toFixed(0)} m, ${s.movingS.toFixed(0)} s en mouvement`);
}
{ // 10 min à 4 nds puis 2 min à 7 nds
  const p = []; const e = leg(p, 0, 0, 0, 4, 600, 2, 1); leg(p, e.t + 2000, e.x, e.y, 7, 120, 2, 1);
  const s = Trace.fromPoints(p).stats(); ok(Math.abs(s.peakKn - 7) < 0.4, `pointe ${s.peakKn.toFixed(2)} nds (7)`);
  ok(Math.abs(s.distanceNM - (4 * 600 + 7 * 120) / 3600) < 0.03, `distance ${s.distanceNM.toFixed(3)} M (${((4 * 600 + 7 * 120) / 3600).toFixed(3)})`);
}
{ // zone privée, GPX, simplification
  const p = []; leg(p, 0, 0, 0, 5, 1440, 2, 0); const tr = Trace.fromPoints(p);
  const m = tr.masked([{ lat: LAT0, lon: LON0 }], 500); ok(m.length < tr.pts.length && m.every(q => Math.hypot((q.lat - LAT0) * mPerDegLat, (q.lon - LON0) * mPerDegLon) >= 500), `zone privée de 500 m : ${tr.pts.length - m.length} points retirés`);
  const g = tr.toGPX('Essai <1>'); ok((g.match(/<trkpt/g) || []).length === tr.pts.length && g.includes('Essai &lt;1&gt;'), 'GPX : un trkpt par point, nom échappé');
  ok(tr.simplified(5).length <= 3, `ligne droite simplifiée à ${tr.simplified(5).length} points`);
}
{ // louvoyage : 10 bords de 3 min à 5 nds, virements à 90°
  const p = []; let e = { t: 0, x: 0, y: 0 };
  for (let k = 0; k < 10; k++) e = leg(p, e.t + (k ? 2000 : 0), e.x, e.y, 5, 180, 2, 1.5, k % 2 ? 315 : 45);
  const s = Trace.fromPoints(p).stats(), want = 5 * 1800 / 3600;
  ok(Math.abs(s.distanceNM - want) / want < 0.03, `louvoyage : ${s.distanceNM.toFixed(3)} M (${want.toFixed(3)})`);
}
{ // pointe avec la vitesse du GPS : 40 min à 5 nds, bruit de position 2 m
  leg.sog = true; const p = []; leg(p, 0, 0, 0, 5, 2400, 2, 2); leg.sog = false;
  const s = Trace.fromPoints(p).stats(); ok(Math.abs(s.peakKn - 5) < 0.25, `pointe avec vitesse GPS ${s.peakKn.toFixed(2)} nds (5)`);
  ok(Math.abs(s.distanceNM - 5 * 2400 / 3600) / (5 * 2400 / 3600) < 0.03, `distance ${s.distanceNM.toFixed(3)} M (${(5 * 2400 / 3600).toFixed(3)})`);
}
{ // saison
  const s = season([{ start: Date.UTC(2026, 4, 3), distanceNM: 10, movingS: 7200 }, { start: Date.UTC(2026, 4, 20), distanceNM: 5, movingS: 3600 }, { start: Date.UTC(2026, 7, 1), distanceNM: 31, movingS: 25000 }]);
  ok(s.totalNM === 46 && s.months['2026-05'] === 15 && s.longestNM === 31 && s.trips === 3, 'cumul de saison par mois');
}
console.log(fail ? `${fail} échec(s)` : 'tous les tests passent'); process.exit(fail ? 1 : 0);
