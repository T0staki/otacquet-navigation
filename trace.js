/* Journal de bord : moteur de trace (V0.1, 25/10/2026).
   Sans dépendance, utilisable dans la page (window.Trace) et sous node (require) pour les tests.

   Entrée : des points GPS {t (ms), lat, lon, acc (m, précision annoncée), sog (nds, facultatif), cog (°, facultatif)}.
   Sortie : distance en milles nautiques, durées, vitesses moyenne et de pointe, cumul par mois, export GPX,
   trace simplifiée pour l'enregistrement et trace masquée près du port pour le partage.

   Choix (estimés, à recaler sur de vraies sorties) :
   - un point dont la précision annoncée dépasse 30 m est ignoré ; un point qui imposerait plus de 25 nds depuis le précédent aussi (saut GPS) ;
   - un point n'est gardé que s'il s'éloigne du dernier point gardé de plus de 10 m, ou de deux fois la précision annoncée : sinon le bruit
     du GPS s'additionne (essai : +8 % sur un mille à 5 nds avec 1,5 m de bruit, 450 m fictifs en 10 min à quai) ;
   - vitesse de pointe = meilleure moyenne glissante sur 30 s de la vitesse donnée par le GPS (mesurée par effet Doppler, bien plus juste que
     l'écart entre deux positions : essai à 5 nds avec 2 m de bruit, pointe calculée sur les positions 6,2 nds) ; sans vitesse du GPS,
     meilleure moyenne des positions sur 60 s ;
   - « en mouvement » = au-dessus de 0,5 nd sur 30 s ; la moyenne se fait sur ce temps-là (comme Strava, temps en mouvement). */
(function (root) {
  'use strict';
  const R_EARTH = 6371008.8;          // m, rayon moyen (IUGG)
  const NM = 1852;                    // m
  const MS_TO_KN = 3600 / NM;
  const OPT = { maxAcc: 30, maxKn: 25, minStep: 10, peakWindow: 30, movingKn: 0.5, simplifyM: 5 };

  const rad = d => d * Math.PI / 180;
  function distM(a, b) {               // haversine, m
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function bearing(a, b) {             // route fond, ° vrais
    const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  class Trace {
    constructor(opt) { this.o = Object.assign({}, OPT, opt || {}); this.pts = []; this.rejected = 0; this.sp = []; this.n = 0; }
    /* Ajoute un point ; rend true s'il est gardé. */
    add(p) {
      if (!p || !isFinite(p.lat) || !isFinite(p.lon) || !isFinite(p.t)) { this.rejected++; return false; }
      if (p.acc != null && p.acc > this.o.maxAcc) { this.rejected++; return false; }
      const last = this.pts[this.pts.length - 1];
      if (last) {
        const dt = (p.t - last.t) / 1000;
        if (dt <= 0) { this.rejected++; return false; }
        const d = distM(last, p);
        if (d / dt * MS_TO_KN > this.o.maxKn) { this.rejected++; return false; }
        this.n++; if (isFinite(p.sog) && p.sog >= 0) this.sp.push([p.t, p.sog]);
        if (d < Math.max(this.o.minStep, 2 * Math.max(p.acc || 0, last.acc || 0))) { last.tEnd = p.t; return false; }   // trop près du dernier point gardé : on le prolonge, sans distance
      }
      if (!last) { this.n++; if (isFinite(p.sog) && p.sog >= 0) this.sp.push([p.t, p.sog]); }
      this.pts.push({ t: p.t, lat: p.lat, lon: p.lon, acc: p.acc, sog: p.sog, cog: p.cog });
      return true;
    }
    stats() {
      const P = this.pts, o = this.o;
      if (P.length < 2) return { distanceNM: 0, durationS: 0, movingS: 0, avgKn: 0, peakKn: 0, points: P.length, rejected: this.rejected };
      // distance sur les positions lissées (moyenne de 3 points gardés consécutifs) : le bruit du GPS ne s'additionne plus en zigzag
      const Q = P.map((p, i) => i === 0 || i === P.length - 1 ? p : { lat: (P[i - 1].lat + p.lat + P[i + 1].lat) / 3, lon: (P[i - 1].lon + p.lon + P[i + 1].lon) / 3 });
      let d = 0; const cum = [0];
      for (let i = 1; i < P.length; i++) { d += distM(Q[i - 1], Q[i]); cum.push(d); }
      const t0 = P[0].t, t1 = Math.max(P[P.length - 1].t, P[P.length - 1].tEnd || 0);
      // vitesses moyennes glissantes sur la fenêtre (deux pointeurs)
      let peak = 0, moving = 0, j = 0;
      const useSog = this.sp.length >= 0.5 * this.n && this.sp.length > 1;
      const W = (useSog ? o.peakWindow : 2 * o.peakWindow) * 1000;
      for (let i = 1; i < P.length; i++) {
        while (j < i && P[i].t - P[j].t > W) j++;
        const k = Math.max(0, j - 1), span = (P[i].t - P[k].t) / 1000;
        const v = span > 0 ? (cum[i] - cum[k]) / span * MS_TO_KN : 0;
        if (!useSog && P[i].t - P[k].t >= W * 0.8) peak = Math.max(peak, v);
        if (v >= o.movingKn) moving += (P[i].t - P[i - 1].t) / 1000;
      }
      if (useSog) {   // moyenne glissante de la vitesse GPS
        const S = this.sp; let a = 0, sum = 0;
        for (let b = 0; b < S.length; b++) { sum += S[b][1]; while (S[b][0] - S[a][0] > W) sum -= S[a++][1];
          if (S[b][0] - S[a][0] >= W * 0.8) peak = Math.max(peak, sum / (b - a + 1)); }
      }
      if (!peak) peak = (cum[cum.length - 1] / ((t1 - t0) / 1000 || 1)) * MS_TO_KN;   // sortie plus courte que la fenêtre
      return {
        distanceNM: d / NM, durationS: (t1 - t0) / 1000, movingS: moving,
        avgKn: moving > 0 ? d / moving * MS_TO_KN : 0, peakKn: peak,
        points: P.length, rejected: this.rejected, start: t0, end: t1
      };
    }
    /* Trace simplifiée (Douglas-Peucker, tolérance en m) pour l'enregistrement et l'affichage. */
    simplified(tolM) {
      const P = this.pts, tol = tolM == null ? this.o.simplifyM : tolM;
      if (P.length < 3) return P.slice();
      const lat0 = rad(P[0].lat), xy = P.map(p => [rad(p.lon) * Math.cos(lat0) * R_EARTH, rad(p.lat) * R_EARTH]);
      const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1;
      const stack = [[0, P.length - 1]];
      while (stack.length) {
        const [a, b] = stack.pop(); let best = -1, bi = -1;
        const [ax, ay] = xy[a], [bx, by] = xy[b], L = Math.hypot(bx - ax, by - ay) || 1e-9;
        for (let i = a + 1; i < b; i++) { const e = Math.abs((bx - ax) * (ay - xy[i][1]) - (ax - xy[i][0]) * (by - ay)) / L; if (e > best) { best = e; bi = i; } }
        if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
      }
      return P.filter((_, i) => keep[i]);
    }
    /* Trace à partager : points à moins de rayonM d'une zone privée (port, mouillage habituel) retirés. */
    masked(zones, rayonM) {
      const r = rayonM || 500;
      return this.pts.filter(p => !(zones || []).some(z => distM(z, p) < r));
    }
    toGPX(name) {
      const esc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
      const pts = this.pts.map(p => `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><time>${new Date(p.t).toISOString()}</time></trkpt>`).join('');
      return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="O'Tacquet journal" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${esc(name || 'Navigation')}</name><trkseg>${pts}</trkseg></trk></gpx>`;
    }
    static fromPoints(pts, opt) { const tr = new Trace(opt); for (const p of pts) tr.add(p); return tr; }
  }

  /* Cumul d'une saison : [{start (ms), distanceNM, movingS}] → par mois (clé AAAA-MM) et total. */
  function season(trips) {
    const m = {}; let nm = 0, s = 0, longest = 0;
    for (const t of trips || []) {
      const d = new Date(t.start), k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      m[k] = (m[k] || 0) + t.distanceNM; nm += t.distanceNM; s += t.movingS || 0; longest = Math.max(longest, t.distanceNM);
    }
    return { months: m, totalNM: nm, trips: (trips || []).length, movingS: s, longestNM: longest };
  }

  const api = { Trace, season, distM, bearing, NM, MS_TO_KN, OPT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Journal = api;
})(typeof self !== 'undefined' ? self : this);
