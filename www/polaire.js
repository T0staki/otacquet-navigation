/* Polaires : calcul du modèle (moteur du simulateur, comme l'écran Réglages de l'appli), lecture des sorties (mêmes règles que
   outillage/comparaison/comparer_sortie.js du dépôt privé), et dessin. */
(function (root) {
  'use strict';
  const TWS = [6, 8, 10, 12, 15, 20], TWA = [40, 45, 50, 55, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170];
  const med = a => { const b = a.filter(x => x != null && isFinite(x)).sort((x, y) => x - y); return b.length ? (b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2) : null; };

  // chargé une seule fois, à la première demande
  let moteur = null;
  const chargerMoteur = () => moteur || (moteur = window.OTMoteur ? Promise.resolve(window.OTMoteur) : new Promise((ok, non) => { const s = document.createElement('script'); s.src = 'moteur/moteur.js'; s.onload = () => ok(window.OTMoteur); s.onerror = () => non(new Error('Moteur du simulateur introuvable')); document.head.appendChild(s); }));

  // polaire gardée dans bateaux/polaires pour cette version ; sinon calcul par petits morceaux, pour que la fenêtre reste vivante
  const flotte = () => window.OT_FLOTTE || { polaires: [] };
  const versionsDe = bateau => flotte().polaires.filter(p => p.bateau === bateau);
  const gardee = bateau => versionsDe(bateau).find(p => p.version === flotte().version) || null;
  async function modele(bateau, progres) {
    const g = gardee(bateau); if (g) return g;
    const M = await chargerMoteur(), cle = 'polaire-' + M.version + '-' + bateau;
    try { const c = JSON.parse(localStorage.getItem(cle)); if (c) return c; } catch (e) {}
    const P = M.make(bateau).PHY; P.setGeo(M.geo[bateau]);
    const V = {}; let fait = 0; const total = TWS.length * TWA.length;
    for (const w of TWS) {
      V[w] = [];
      for (const a of TWA) {
        V[w].push(+(P.optimum(w * P.KN, a, null, null, 0).V / P.KN).toFixed(2));
        fait++;
        if (fait % 3 === 0) { if (progres) progres(fait / total); await new Promise(r => setTimeout(r, 0)); }
      }
    }
    const r = { version: M.version, TWS, TWA, V };
    try { localStorage.setItem(cle, JSON.stringify(r)); } catch (e) {}
    return r;
  }

  // fenêtres de 30 s stables (TWA ±6°, TWS ±1,5 nd, cap ±8°, STW ≥ 1,5 nd)
  const ecartAngle = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180);
  function fenetres(S) {
    const K = k => { const i = (S.ins_keys || []).indexOf(k); return i < 0 ? -1 : i + 1; };
    const iS = K('stw'), iW = K('tws'), iA = K('twa'), iC = K('heading'), iG = K('xdr_heel');
    if (iS < 0 || iW < 0 || iA < 0) return [];
    const out = []; let cur = [];
    const fermer = () => {
      if (cur.length >= 6 && cur.every(r => r[iS] != null && r[iW] != null && r[iA] != null)) {
        const a = cur.map(r => r[iA]), w = cur.map(r => r[iW]), s = cur.map(r => r[iS]), abs = a.map(Math.abs);
        const memeBord = a.every(x => Math.sign(x) === Math.sign(a[0]) || Math.abs(x) > 170);
        const cap = iC >= 0 ? cur.map(r => r[iC]).filter(x => x != null) : [];
        const moy = l => l.reduce((t, x) => t + x, 0) / l.length;
        if (memeBord && Math.max(...abs) - Math.min(...abs) <= 12 && Math.max(...w) - Math.min(...w) <= 3 && cap.every(h => ecartAngle(h, cap[0]) <= 8) && moy(s) >= 1.5)
          out.push({ tws: moy(w), twa: moy(abs), stw: moy(s), gite: iG >= 0 ? med(cur.map(r => r[iG] == null ? null : Math.abs(r[iG]))) : null });
      }
      cur = [];
    };
    for (const r of S.ins || []) { if (cur.length && (r[0] - cur[cur.length - 1][0] > 7000 || cur.length === 6)) fermer(); cur.push(r); }
    fermer();
    return out;
  }

  // relevés à quai : le début de l'enregistrement, tant que le bateau est immobile
  function aQuai(S) {
    const K = k => { const i = (S.ins_keys || []).indexOf(k); return i < 0 ? -1 : i + 1; };
    const iS = K('stw'), iO = K('sog'), q = [];
    for (const r of S.ins || []) { const v = [r[iS], iO >= 0 ? r[iO] : null].filter(x => x != null); if (!v.length || Math.max(...v) >= 0.3) break; q.push(r); }
    if (q.length < 6) return null;
    const res = k => { const i = K(k); if (i < 0) return null; const a = q.map(r => r[i]).filter(x => x != null); return a.length ? { med: med(a), min: Math.min(...a), max: Math.max(...a) } : null; };
    return { minutes: q.length * 5 / 60, gite: res('xdr_heel'), assiette: res('xdr_trim') };
  }

  // tableau par force de vent et par allure
  const FORCES = [[0, 6, '≤ 6 nds'], [6, 10, '6-10 nds'], [10, 14, '10-14 nds'], [14, 18, '14-18 nds'], [18, 22, '18-22 nds'], [22, 99, '> 22 nds']];
  const ALLURES = [[0, 55, 'près'], [55, 75, 'bon plein'], [75, 105, 'travers'], [105, 150, 'largue'], [150, 181, 'portant']];
  // entre les deux vents et les deux angles voisins ; rien hors de la grille calculée plutôt qu'une valeur inventée
  function interpoler(mod, tws, twa) {
    if (tws < TWS[0] || tws > TWS[TWS.length - 1] || twa < TWA[0] || twa > TWA[TWA.length - 1]) return null;
    let w = 0; while (w < TWS.length - 2 && TWS[w + 1] < tws) w++;
    let i = 0; while (i < TWA.length - 2 && TWA[i + 1] < twa) i++;
    const tw = (tws - TWS[w]) / (TWS[w + 1] - TWS[w]), ta = (twa - TWA[i]) / (TWA[i + 1] - TWA[i]);
    const a = mod.V[TWS[w]], b = mod.V[TWS[w + 1]], val = l => l[i] + (l[i + 1] - l[i]) * ta;
    return val(a) + (val(b) - val(a)) * tw;
  }
  function cases(fen, mod) {
    const out = [];
    for (const [f0, f1, vent] of FORCES) for (const [a0, a1, allure] of ALLURES) {
      const l = fen.filter(f => f.tws >= f0 && f.tws < f1 && f.twa >= a0 && f.twa < a1); if (!l.length) continue;
      const reel = med(l.map(f => f.stw)), m = mod ? med(l.map(f => interpoler(mod, f.tws, f.twa))) : null;
      out.push({ vent, allure, minutes: l.length / 2, tws: med(l.map(f => f.tws)), twa: med(l.map(f => f.twa)), reel, modele: m, ecart: m ? reel / m - 1 : null, gite: med(l.map(f => f.gite)) });
    }
    return out;
  }
  // écart médian entre le réel et une polaire du modèle, fenêtre par fenêtre, sur toute la sortie et par allure : sert au rejeu d'une version à l'autre
  function ecart(fen, mod) {
    const e = l => { const r = l.map(f => { const m = interpoler(mod, f.tws, f.twa); return m ? f.stw / m - 1 : null; }).filter(x => x != null); return r.length ? { ecart: med(r), minutes: r.length / 2 } : null; };
    return { ensemble: e(fen), allures: ALLURES.map(([a0, a1, allure]) => ({ allure, res: e(fen.filter(f => f.twa >= a0 && f.twa < a1)) })) };
  }

  /* ---------- Dessin de la polaire : une couleur par bateau, de plus en plus claire avec le vent ; les mesures dans la couleur du texte ---------- */
  const TEINTES = {
    nuit: [{ 6: '#3f8fb3', 8: '#4fa2c6', 10: '#62b4d6', 12: '#7cc4e0', 15: '#a0d6ea', 20: '#dbf1f9' }, { 6: '#b8683d', 8: '#d07745', 10: '#e8854e', 12: '#f09a6c', 15: '#f5b491', 20: '#fbdcc9' }],
    jour: [{ 6: '#8cc3d6', 8: '#63a9c2', 10: '#3f8fac', 12: '#2a7795', 15: '#17607d', 20: '#0b3f55' }, { 6: '#e8ab8c', 8: '#dd8a60', 10: '#cf6a38', 12: '#b9531f', 15: '#973f12', 20: '#6a2a0a' }]
  };
  const FORMES = ['rond', 'carre', 'triangle', 'losange'];
  function marque(forme, x, y, r, attr, titre) {
    const t = titre ? `<title>${titre}</title>` : '';
    if (forme === 'carre') return `<rect x="${(x - r).toFixed(1)}" y="${(y - r).toFixed(1)}" width="${2 * r}" height="${2 * r}" rx="1" ${attr}>${t}</rect>`;
    if (forme === 'triangle') return `<path d="M${x.toFixed(1)} ${(y - r * 1.2).toFixed(1)} L${(x + r * 1.15).toFixed(1)} ${(y + r).toFixed(1)} L${(x - r * 1.15).toFixed(1)} ${(y + r).toFixed(1)}Z" ${attr}>${t}</path>`;
    if (forme === 'losange') return `<path d="M${x.toFixed(1)} ${(y - r * 1.3).toFixed(1)} L${(x + r * 1.3).toFixed(1)} ${y.toFixed(1)} L${x.toFixed(1)} ${(y + r * 1.3).toFixed(1)} L${(x - r * 1.3).toFixed(1)} ${y.toFixed(1)}Z" ${attr}>${t}</path>`;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" ${attr}>${t}</circle>`;
  }
  function dessin(o) {
    // o : series [{ nom, mod }], vents, avalon, mesures [{ twa, tws, stw, n, forme, nom }], theme
    const tous = []; for (const c of o.series) for (const w of o.vents) tous.push(...c.mod.V[w]);
    if (o.avalon) for (const w of o.vents) if (o.avalon.V[w]) tous.push(...o.avalon.V[w].filter(v => v != null));
    for (const m of o.mesures || []) tous.push(m.stw);
    const R = Math.max(4, Math.ceil(Math.max(...tous) / 2) * 2), k = 310 / (R + 0.4), x0 = 22, y0 = 345, rad = d => d * Math.PI / 180, pt = (v, a) => [x0 + v * k * Math.sin(rad(a)), y0 - v * k * Math.cos(rad(a))];
    const trace = (angles, vals) => { let d = '', n = 0; vals.forEach((v, i) => { if (v == null) return; const p = pt(v, angles[i]); d += (n++ ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ' '; }); return d; };
    const T = TEINTES[o.theme] || TEINTES.nuit; let s = '';
    for (let v = 2; v <= R; v += 2) s += `<path d="M${x0} ${(y0 - v * k).toFixed(1)} A${(v * k).toFixed(1)} ${(v * k).toFixed(1)} 0 0 1 ${x0} ${(y0 + v * k).toFixed(1)}" fill="none" stroke="var(--line)"/><text x="${(x0 + v * k - 8).toFixed(0)}" y="${y0 - 4}" font-size="12" fill="var(--ink2)">${v}</text>`;
    for (const a of [0, 45, 90, 135, 180]) { const p = pt(R + 0.4, a); s += `<path d="M${x0} ${y0} L${p[0].toFixed(1)} ${p[1].toFixed(1)}" stroke="var(--line)"/><text x="${(p[0] + (a % 180 ? 2 : 14)).toFixed(0)}" y="${(p[1] + 4).toFixed(0)}" font-size="12" fill="var(--ink2)" text-anchor="middle">${a}°</text>`; }
    if (o.avalon) for (const w of o.vents) { const c = o.avalon.V[w]; if (c) s += `<path d="${trace(o.avalon.TWA, c)}" fill="none" stroke="${T[0][w]}" stroke-width="1.5" stroke-dasharray="4 4" stroke-linecap="round"><title>Polaire Avalon, ${w} nds</title></path>`; }
    o.series.forEach((c, j) => {
      const angles = j ? [130, 140, 150, 160, 170, 120] : [60, 70, 80, 90, 100, 110], t = T[Math.min(j, T.length - 1)];
      for (const [n, w] of o.vents.entries()) {
        const ang = angles[n % angles.length], v = c.mod.V[w], p = pt(v[c.mod.TWA.indexOf(ang)], ang);
        s += `<path d="${trace(c.mod.TWA, v)}" fill="none" stroke="${t[w]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><title>${c.nom}, modèle, ${w} nds</title></path><text x="${(p[0] + 6).toFixed(0)}" y="${(p[1] - 5).toFixed(0)}" font-size="13" font-weight="600" fill="var(--ink)">${w} nds</text>`;
      }
    });
    for (const m of o.mesures || []) { const p = pt(m.stw, m.twa); s += marque(m.forme, p[0], p[1], 5, 'fill="var(--ink)" stroke="var(--card)" stroke-width="2"', `${m.nom} : ${m.stw.toFixed(1).replace('.', ',')} nds à ${Math.round(m.twa)}° par ${Math.round(m.tws)} nds (${m.n / 2} minutes)`); }
    return `<svg viewBox="0 0 440 690" role="img" aria-label="Polaire : vitesse selon l'angle au vent réel" style="width:100%;max-width:440px;align-self:center">${s}</svg>`;
  }
  // points mesurés : médiane par tranche de vent et de 10° d'angle
  function pointsMesures(fen) {
    const g = {};
    for (const f of fen) { const k = Math.round(f.tws / 2) * 2 + '|' + Math.round(f.twa / 10) * 10; (g[k] = g[k] || []).push(f); }
    return Object.values(g).filter(l => l.length >= 4).map(l => ({ tws: med(l.map(f => f.tws)), twa: med(l.map(f => f.twa)), stw: med(l.map(f => f.stw)), n: l.length }));
  }

  root.Polaire = { TWS, TWA, FORMES, marque, modele, gardee, versionsDe, fenetres, aQuai, cases, ecart, dessin, pointsMesures, med };
})(window);
