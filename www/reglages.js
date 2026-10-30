/* Écran Réglages de l'appli iPhone (maquette 3 « O'Tacquet en navigation »).
   Vitesse max théorique, gîte, barre et réglages conseillés viennent du moteur du simulateur (objet PHY du dépôt privé
   simulateur-voile_v0), copié dans www/moteur/ par outillage/moteur.sh au moment de compiler l'appli : il n'est jamais publié.
   Vent : le B&G s'il est connecté, sinon Open-Meteo à la position du bateau (arrondie au centième de degré), corrigeable à la main.
   Angles du vent signés : positif = vent venant de tribord (tribord amures), comme le lecteur NMEA. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const fr = (n, d) => n.toFixed(d).replace('.', ',');
  const hm = t => { const d = new Date(t); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); };
  // LISSAGE : vent du B&G lissé, par seconde (≈ 6 s). C'est aussi le temps que met le bateau à se recaler sur une rafale (vitesse, réglages) :
  // au-dessus du vent lissé, le vent mesuré est une rafale qui fait gîter le bateau avant qu'il accélère (estimé, à ajuster avec les enregistrements)
  const KN = 0.514444, TROP_PRES = 40, LISSAGE = 0.15, RAFALE_S = 120;   // RAFALE_S : fenêtre où l'on cherche la plus forte rafale du B&G
  const rafB = [];   // vent réel du B&G des deux dernières minutes : [instant, TWS]
  const ALLURES = [['Près', 0, 60], ['Bon plein', 60, 80], ['Travers', 80, 100], ['Largue', 100, 135], ['Grand largue', 135, 165], ['Vent arrière', 165, 181]];
  const VALS = { bs: [0, 25, 50, 75, 100], car: [0, 25, 50, 75, 100], vang: [0, 25, 50, 75, 100], trav: [-100, -50, 0, 50, 100] };
  let PHY = null, ctx = null, lisse = null, dernier = null, dernier0 = null, enCalcul = false;   // dernier : avec les réglages forcés ; dernier0 : tout en auto
  // man : réglages repris à la main ; val : leur valeur en unités de curseur (écoutes 0-100, génois 0-80 % roulé, chariot −100-100, ris 0-2) ;
  // pose : valeur prise en compte par le moteur pour le ris, le génois, le pataras et les chariots de génois (au relâcher du curseur)
  const S = { hdgSet: null, man: {}, val: {}, pose: {}, expert: false, edit: false, meteo: null, meteoErr: '', corr: null };
  const touche = {};
  const cache = new Map();

  /* ---------- Conditions : vent, cap, vitesse mesurée ---------- */
  function conditions() {
    const v = ctx.bord ? ctx.bord.now(5000) : {}, g = ctx.last(), c = { v };
    if (S.hdgSet != null) { c.hdg = S.hdgSet; c.hdgSrc = 'choisi'; }
    else if (v.heading != null) { c.hdg = v.heading; c.hdgSrc = 'B&G'; }
    else if (g && g.cog != null && g.sog > 1) { c.hdg = g.cog; c.hdgSrc = 'route fond GPS'; }
    if (v.tws != null && (v.twd != null || v.twa != null)) {
      c.src = 'B&G'; c.tws = v.tws; c.twd = v.twd;
      const t = Date.now(); if (!rafB.length || t - rafB[rafB.length - 1][0] >= 900) rafB.push([t, v.tws]);
      while (rafB.length && t - rafB[0][0] > RAFALE_S * 1000) rafB.shift();
      c.gust = Math.max(...rafB.map(x => x[1]));   // plus forte rafale mesurée des deux dernières minutes
    }
    else if (S.corr) { c.src = 'corrigé à la main'; c.tws = S.corr.tws; c.twd = S.corr.twd; }
    else if (S.meteo) { c.src = 'Open-Meteo ' + hm(S.meteo.t); c.tws = S.meteo.tws; c.twd = S.meteo.twd; c.gust = S.meteo.gust; }
    if (S.meteo && S.meteo.hs != null) c.hs = S.meteo.hs;
    if (c.src === 'B&G' && v.twa != null && S.hdgSet == null) c.twa = v.twa;
    else if (c.twd != null && c.hdg != null) c.twa = ((c.twd - c.hdg + 540) % 360) - 180;
    if (c.twd == null && c.twa != null && c.hdg != null) c.twd = (c.hdg + c.twa + 360) % 360;
    if (c.src === 'B&G' && v.awa != null) { c.awa = v.awa; c.aws = v.aws; }
    if (v.stw != null) { c.vm = v.stw; c.vmSrc = 'loch'; } else if (g && g.sog != null) { c.vm = g.sog; c.vmSrc = 'GPS'; }
    // vent lissé pour le moteur : le B&G change chaque seconde, le calcul ne doit pas suivre chaque risée
    if (c.tws != null && c.twa != null) {
      const x = Math.cos(c.twa * Math.PI / 180), y = Math.sin(c.twa * Math.PI / 180);
      if (!lisse || c.src !== 'B&G') lisse = { tws: c.tws, x, y };
      else { lisse.tws += (c.tws - lisse.tws) * LISSAGE; lisse.x += (x - lisse.x) * LISSAGE; lisse.y += (y - lisse.y) * LISSAGE; }
      c.twsL = lisse.tws; c.twaL = Math.atan2(lisse.y, lisse.x) * 180 / Math.PI;
    } else lisse = null;
    return c;
  }

  /* ---------- Moteur ---------- */
  // ris, génois, pataras et chariots de génois choisis à la main : l'optimum se calcule autour d'eux
  function fixes() {
    const fx = {};
    if (S.man.reef && S.pose.reef != null) fx.reef = S.pose.reef;
    if (S.man.furl && S.pose.furl != null) fx.furl = S.pose.furl / 100;
    if (S.man.bs && S.pose.bs != null) fx.bs = S.pose.bs;
    if (S.man.car && S.pose.car != null) fx.car = S.pose.car;
    return fx;
  }
  const cle = (tws, A, fx) => [tws, A, fx.reef, fx.furl, fx.bs, fx.car].join('|');
  function calc(tws, A, fx) {
    const key = cle(tws, A, fx);
    if (cache.has(key)) return cache.get(key);
    const T = tws * KN, o = PHY.optimum(T, A, Object.keys(fx).length ? fx : null);
    const s = PHY.steady(T, A, o.c, o, true), sens = {};
    // perte de vitesse au pire réglage, les autres restant à l'optimum : « indifférent » sous 0,05 nd
    for (const k in VALS) {
      let lo = o.V;
      for (const x of VALS[k]) if (x !== o.c[k]) lo = Math.min(lo, PHY.steady(T, A, Object.assign({}, o.c, { [k]: x }), o, true).V);
      sens[k] = (o.V - lo) / KN;
    }
    const r = { tws, A, V: o.V / KN, phi: o.phi, helm: Math.abs(s.helm), awa: s.awa, c: o.c, sens, next: undefined };
    cache.set(key, r); if (cache.size > 300) cache.delete(cache.keys().next().value);
    return r;
  }
  // ris ou génois roulé : cherchés en forçissant nœud par nœud, pataras et chariots de génois gardés
  function prochain(r) {
    if (S.man.reef && S.man.furl) return '';
    for (let t = Math.floor(r.tws) + 1; t <= r.tws + 10; t++) {
      const fx = Object.assign({ bs: r.c.bs, car: r.c.car }, fixes()); if (fx.furl === 0) delete fx.furl;
      const o = PHY.optimum(t * KN, r.A, fx);
      if (o.c.reef > r.c.reef) return (o.c.reef === 1 ? '1 ris' : o.c.reef + ' ris') + ' vers ' + t + ' nds établis';
      if (o.c.furl > r.c.furl + 1e-6) return 'génois roulé ' + Math.round(o.c.furl * 100) + ' % vers ' + t + ' nds établis';
    }
    return '';
  }

  /* ---------- Météo ---------- */
  async function meteo() {
    const g = ctx.last(), lat = (g ? g.lat : 48.64).toFixed(2), lon = (g ? g.lon : -2.25).toFixed(2);
    S.meteoErr = 'Météo en cours de chargement…'; render();
    try {
      const w = await (await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon + '&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=kn&timezone=auto')).json();
      let hs = null;
      try { const m = await (await fetch('https://marine-api.open-meteo.com/v1/marine?latitude=' + lat + '&longitude=' + lon + '&current=wave_height&timezone=auto')).json(); hs = m.current ? m.current.wave_height : null; } catch (e) {}
      const c = w.current;
      S.meteo = { tws: c.wind_speed_10m, twd: c.wind_direction_10m, gust: c.wind_gusts_10m, hs, t: Date.now() }; S.meteoErr = '';
    } catch (e) { S.meteoErr = 'Météo indisponible (pas d\'internet ?) : corrige le vent à la main'; }
    render();
  }

  /* ---------- Affichage ---------- */
  /* ---------- Réglages : curseurs (unités de curseur ↔ moteur) ---------- */
  const jm = () => PHY.Y.jibMin;
  const VERS = {   // valeur du moteur → curseur
    main: c => (c.mainSet - 2) / 0.83, jib: c => (c.jibSet - jm()) / (38 - jm()) * 100, furl: c => c.furl * 100,
    trav: c => c.trav, reef: c => c.reef, bs: c => c.bs, car: c => c.car, vang: c => c.vang
  };
  const TXT = {
    main: v => 'bôme à ' + Math.round(2 + v * 0.83) + '° de l’axe',
    jib: v => { const j = jm() + v / 100 * (38 - jm()); return j >= 37.5 ? 'choquée au maximum' : j <= jm() + 0.5 ? 'bordée à fond' : 'génois à ' + Math.round(j) + '° de l’axe'; },
    furl: v => { v = Math.round(v); const m = [20, 35, 50].indexOf(v); return v === 0 ? 'déroulé' : 'roulé ' + v + ' %' + (m >= 0 ? ' (' + (m === 0 ? '1er' : (m + 1) + 'e') + ' repère)' : ''); },
    trav: v => Math.abs(v) < 8 ? 'au milieu' : v <= -92 ? 'tout au vent' : v >= 92 ? 'tout sous le vent' : 'à ' + Math.round(Math.abs(v)) + ' % ' + (v < 0 ? 'au vent' : 'sous le vent'),
    reef: v => v === 0 ? 'aucun, GV pleine' : v === 1 ? '1 ris' : '2 ris',
    bs: v => v < 3 ? 'relâché' : v > 97 ? 'à fond' : Math.round(v) + ' %',
    car: v => v < 3 ? 'tout à l’avant' : v > 97 ? 'tout à l’arrière' : Math.abs(v - 50) < 3 ? 'mi-rail' : Math.round(v) + ' % du rail',
    vang: v => v < 10 ? 'choqué' : v < 40 ? 'peu repris' : v < 60 ? 'mi-tension' : v < 90 ? 'bien repris' : 'étarqué'
  };
  const LIGNES = [
    { k: 'main', name: 'Écoute de GV', min: 0, max: 100, lo: 'bordée', hi: 'choquée' },
    { k: 'jib', name: 'Écoute de génois', min: 0, max: 100, lo: 'bordée', hi: 'choquée' },
    { k: 'furl', name: 'Génois', min: 0, max: 80, lo: 'déroulé', hi: 'roulé 80 %', marks: [20, 35, 50] },
    { k: 'trav', name: 'Chariot de GV', min: -100, max: 100, lo: 'au vent', hi: 'sous le vent', marks: [0] },
    { k: 'reef', name: 'Ris', seg: [0, 1, 2] }
  ];
  const EXPERT = [
    { k: 'bs', name: 'Pataras', min: 0, max: 100, lo: 'relâché', hi: 'à fond' },
    { k: 'car', name: 'Chariots de génois', min: 0, max: 100, lo: 'avant', hi: 'arrière' },
    { k: 'vang', name: 'Hale-bas', min: 0, max: 100, lo: 'choqué', hi: 'étarqué' }
  ];
  const POSE = { reef: 1, furl: 1, bs: 1, car: 1 };   // réglages qui relancent l'optimum
  function ligneHTML(L, expert) {
    let h = '<div class="rg" id="rg-' + L.k + '"><div class="rh"><span class="rn">' + L.name + ' <small id="rv-' + L.k + '"></small></span>' +
      (expert ? '<span class="imp" id="ri-' + L.k + '"></span>' : '') +
      '<button class="pill on" id="rp-' + L.k + '" data-act="man-' + L.k + '">auto</button></div>' +
      '<p class="cons" id="rc-' + L.k + '" hidden></p>';
    if (L.seg) h += '<span class="seg" role="group" aria-label="' + L.name + '">' + L.seg.map(n => '<button data-act="' + L.k + '=' + n + '" id="rs-' + L.k + n + '">' + n + '</button>').join('') + '</span>';
    else {
      h += '<div class="cur"><input type="range" id="rr-' + L.k + '" data-k="' + L.k + '" min="' + L.min + '" max="' + L.max + '" step="1" aria-label="' + L.name + '">';
      if (L.marks) h += '<div class="fdots">' + L.marks.map(m => '<button data-act="' + L.k + '=' + m + '" aria-label="' + L.name + ' : repère ' + m + '" style="left:' + ((m - L.min) / (L.max - L.min) * 100) + '%"><i id="rm-' + L.k + m + '"></i></button>').join('') + '</div>';
      h += '<div class="ends"><span>' + L.lo + '</span><span>' + L.hi + '</span></div></div>';
    }
    return h + '</div>';
  }
  // conseil pratique : ce qu'il faut faire, selon le sens de l'écart entre le réglage forcé et l'idéal théorique
  const GESTE = {
    main: ['Choquer l’écoute de GV', 'Border l’écoute de GV'], jib: ['Choquer l’écoute de génois', 'Border l’écoute de génois'],
    furl: ['Enrouler le génois', 'Dérouler le génois'], trav: ['Descendre le chariot de GV sous le vent', 'Remonter le chariot de GV au vent'],
    reef: ['Prendre un ris', 'Larguer un ris'], bs: ['Reprendre le pataras', 'Relâcher le pataras'],
    car: ['Reculer les chariots de génois', 'Avancer les chariots de génois'], vang: ['Reprendre le hale-bas', 'Choquer le hale-bas']
  };
  const MOTEUR = { main: 'mainSet', jib: 'jibSet' };   // clé du curseur → clé du moteur (les autres sont identiques)
  const gainCache = new Map();
  function gainSi(k, src, av) {   // vitesse gagnée si ce seul réglage passe à l'idéal, tout le reste comme tu l'as mis
    const c = configAvec(dernier); if (!c || !av) return null;
    const e = MOTEUR[k] || k; c[e] = src.c[e];
    const key = [k, dernier.tws, dernier.A, JSON.stringify(c)].join('|');
    if (!gainCache.has(key)) { gainCache.set(key, PHY.steady(dernier.tws * KN, dernier.A, c, dernier, false).V / KN - av.V); if (gainCache.size > 200) gainCache.delete(gainCache.keys().next().value); }
    return gainCache.get(key);
  }
  function reglerLigne(L, r, expert, r0, av) {
    const k = L.k, m = !!S.man[k], src = r && POSE[k] && r0 ? r0 : r, conseil = src ? VERS[k](src.c) : null, v = m ? S.val[k] : (r ? VERS[k](r.c) : null);
    $('rg-' + k).classList.toggle('man', m);
    const p = $('rp-' + k); p.classList.toggle('on', !m); p.textContent = m ? 'manuel' : 'auto';
    p.setAttribute('aria-label', L.name + (m ? ' : manuel, toucher pour repasser en auto' : ' : auto'));
    let t = v == null ? '' : '· ' + TXT[k](v);
    const cons = $('rc-' + k), ecart = m && conseil != null && Math.abs(Math.round(conseil) - Math.round(v)) >= 1;
    cons.hidden = !ecart;
    if (ecart) {
      const g = gainSi(k, src, av);
      cons.innerHTML = '<b>' + GESTE[k][conseil > v ? 0 : 1] + '</b> <span>· idéal théorique : ' + TXT[k](conseil) +
        (g == null ? '' : g >= 0.05 ? ', gain possible +' + fr(g, 1) + ' nd' : ', gain inférieur à 0,1 nd') + '</span>';
    }
    if (!m && k === 'trav' && r && r.sens.trav < 0.05) t += ' (indifférent)';
    $('rv-' + k).textContent = t;
    if (L.seg) L.seg.forEach(n => $('rs-' + k + n).setAttribute('aria-pressed', String(v === n)));
    else {
      const i = $('rr-' + k); i.disabled = v == null;
      if (v != null && !touche[k]) i.value = Math.round(v);
      if (L.marks) L.marks.forEach(mk => $('rm-' + k + mk).classList.toggle('on', v != null && Math.round(v) === mk));
    }
    if (expert) { const on = r && r.sens[k] >= 0.05; $('ri-' + k).textContent = !r ? '' : on ? 'jusqu’à −' + fr(Math.max(0.1, Math.round(r.sens[k] * 10) / 10), 1) + ' nd' : 'indifférent'; $('rg-' + k).classList.toggle('off', !!r && !on && !m); }
  }
  // vitesse, gîte et barre avec tout ce qui est forcé à la main (les réglages restés en auto suivent le conseil adapté à ces choix)
  const avecCache = new Map();
  /* Rafale : avec le B&G, le vent mesuré au-dessus du vent lissé (en direct) ; sans lui, la rafale annoncée par Open-Meteo.
     La gîte « réelle » est celle de la rafale : elle arrive avant que le bateau accélère et que l'équipage règle (PHY : gîte et barre à la vitesse du moment). */
  function rafale(c) {
    if (c.src === 'B&G' && c.twsL > 0) return { g: Math.max(0, c.tws / c.twsL - 1), direct: true };
    if (c.gust != null && c.tws > 0 && c.gust > c.tws) return { g: c.gust / c.tws - 1, direct: false };
    return { g: 0, direct: false };
  }
  const giteCache = new Map();
  function giteRafale(r, cfg, g) {   // gîte et barre dans la rafale g (fraction du vent en plus), réglages cfg
    const key = [r.tws, r.A, Math.round(g * 100), JSON.stringify(cfg)].join('|');
    if (!giteCache.has(key)) { const s = PHY.steady(r.tws * KN, r.A, Object.assign({}, cfg, { gust: g }), r, false); giteCache.set(key, { phi: g > 0 ? s.phiG : s.phi, helm: Math.abs(g > 0 ? s.helmG : s.helm) }); if (giteCache.size > 200) giteCache.delete(giteCache.keys().next().value); }
    return giteCache.get(key);
  }
  // « gîte 3° · barre 0° » : en direct avec le B&G (rafale du moment comprise) ; sinon au vent moyen, et dans la rafale annoncée
  function giteTexte(r, cfg, moy, c) {
    const R = rafale(c);
    if (R.direct) { const x = R.g > 0.02 ? giteRafale(r, cfg, R.g) : moy; return 'gîte ' + Math.round(x.phi) + '° · barre ' + Math.round(x.helm) + '° (en direct)'; }
    if (R.g > 0.02) { const x = giteRafale(r, cfg, R.g); return 'gîte ' + Math.round(moy.phi) + '° (rafale ' + Math.round(x.phi) + '°) · barre ' + Math.round(moy.helm) + '° (rafale ' + Math.round(x.helm) + '°)'; }
    return 'gîte ' + Math.round(moy.phi) + '° · barre ' + Math.round(moy.helm) + '°';
  }
  // départ au lof : au-delà de la gîte limite (25°, Jérémie) ou quand le safran décroche (20° de barre), le bateau part au lof ; on prévient dès 20° de gîte ou 14° de barre (trop toilé)
  function alerteLof(c, r, tooClose) {
    const box = $('r-lof');
    if (!r || tooClose || c.tws == null) { box.hidden = true; return; }
    const R = rafale(c), g = R.direct ? Math.max(R.g, c.gust / c.tws - 1) : R.g, x = giteRafale(r, configAvec(r), g), lim = PHY.Y.lofHeel || 25, fort = x.phi >= lim || x.helm >= 20, risque = fort || x.phi >= lim - 5 || x.helm >= 14;
    box.hidden = !risque;
    if (risque) {
      const ou = g > 0.02 ? (R.direct ? 'dans les rafales mesurées (jusqu’à ' : 'dans les rafales à ') + fr(c.gust, 0) + ' nds' + (R.direct ? ')' : '') : 'au vent actuel';
      box.classList.toggle('fort', fort);
      $('r-loftxt').textContent = (fort ? 'Départ au lof probable ' : 'Risque de départ au lof ') + ou + ' : gîte ' + Math.round(x.phi) + '°, barre ' + Math.round(x.helm) + '°. Choque la GV, enroule ou prends un ris.';
    }
  }
  function configAvec(r) {
    if (!r) return null;
    const c = Object.assign({}, r.c);
    if (S.man.main) c.mainSet = 2 + S.val.main * 0.83;
    if (S.man.jib) c.jibSet = jm() + S.val.jib / 100 * (38 - jm());
    if (S.man.trav) c.trav = S.val.trav;
    if (S.man.vang) c.vang = S.val.vang;
    return c;
  }
  function avecTesReglages(r) {
    if (!r || !Object.keys(S.man).some(k => S.man[k])) return null;
    if (!['main', 'jib', 'trav', 'vang'].some(k => S.man[k])) return { V: r.V, phi: r.phi, helm: r.helm };
    const c = configAvec(r);
    const key = [r.tws, r.A, c.reef, c.furl, c.bs, c.car, Math.round(c.mainSet), Math.round(c.jibSet), Math.round(c.trav), Math.round(c.vang)].join('|');
    if (!avecCache.has(key)) { const s = PHY.steady(r.tws * KN, r.A, c, r, false); avecCache.set(key, { V: s.V / KN, phi: s.phi, helm: Math.abs(s.helm) }); if (avecCache.size > 200) avecCache.delete(avecCache.keys().next().value); }
    return avecCache.get(key);
  }

  function render() {
    if (!PHY || !ctx.visible()) return;
    const c = conditions();
    $('r-met').hidden = c.tws == null;
    if (c.tws != null) {
      $('r-mtws').textContent = fr(c.tws, 0); $('r-mraf').textContent = c.gust != null ? fr(c.gust, 0) : '–'; $('r-mmer').textContent = c.hs != null ? fr(c.hs, 1) : '–';
      $('r-mraflab').textContent = c.src === 'B&G' ? 'Rafales (2 min)' : 'Rafales';
    }
    $('r-src').textContent = c.tws != null ? c.src : (S.meteoErr || 'Vent en attente du B&G ou de la météo');
    // cap et rose
    const A = c.twa != null ? Math.abs(c.twa) : null, cote = c.twa == null ? '' : c.twa >= 0 ? 'tribord amures' : 'bâbord amures';
    $('r-hdg').textContent = c.hdg != null ? String(Math.round(c.hdg) % 360).padStart(3, '0') + '°' : '–';
    $('r-hdgsrc').textContent = c.hdg != null ? 'Cap · ' + c.hdgSrc : 'Cap inconnu : choisis-le';
    $('r-hdgback').hidden = S.hdgSet == null;
    const tooClose = A != null && A < TROP_PRES;
    $('r-twa').textContent = A == null ? (c.tws != null ? 'il manque le cap pour la TWA' : '') : tooClose ? 'Trop près du vent (' + Math.round(A) + '°) : abats' : (c.twd != null ? 'TWD ' + String(Math.round(c.twd) % 360).padStart(3, '0') + '° · ' : '') + 'TWA ' + Math.round(A) + '° ' + cote;
    $('r-twa').classList.toggle('alerte', tooClose);
    // moteur sur le vent lissé, arrondi (1 nd, 5°)
    let r = null, r0 = null;
    if (c.twsL != null && !tooClose && c.twsL >= 2) {
      const tws = Math.round(c.twsL), Ar = Math.min(180, Math.max(TROP_PRES, Math.round(Math.abs(c.twaL) / 5) * 5)), fx = fixes();
      r0 = cache.get(cle(tws, Ar, {})); r = Object.keys(fx).length ? cache.get(cle(tws, Ar, fx)) : r0;
      const manque = !r0 ? {} : !r ? fx : null;   // tout en auto d'abord, puis autour des réglages forcés
      if (manque && !enCalcul) { enCalcul = true; $('r-calc').hidden = false; setTimeout(() => { try { calc(tws, Ar, manque); } finally { enCalcul = false; $('r-calc').hidden = true; render(); } }, 30); }
      if (!r0 && dernier0) r0 = dernier0;
      if (!r && dernier) r = dernier;
    }
    if (r) dernier = r; if (r0) dernier0 = r0;
    let awa = c.awa;
    if (awa == null && c.twa != null && r) awa = Math.sign(c.twa || 1) * Math.atan2(c.tws * Math.sin(A * Math.PI / 180), c.tws * Math.cos(A * Math.PI / 180) + r.V) * 180 / Math.PI;
    $('r-aw-txt').textContent = awa != null ? 'AWA ' + Math.round(Math.abs(awa)) + '°' + (c.awa != null ? ' (B&G)' : ' (calculé)') : '';
    $('r-tw').setAttribute('transform', 'rotate(' + (c.twa != null ? c.twa : 0) + ' 60 60)'); $('r-tw').style.display = c.twa != null ? '' : 'none';
    $('r-aw').setAttribute('transform', 'rotate(' + (awa != null ? awa : 0) + ' 60 60)'); $('r-aw').style.display = awa != null ? '' : 'none';
    $('r-rose').setAttribute('aria-label', c.twa != null ? 'Vent réel à ' + Math.round(A) + '° ' + cote + (awa != null ? ', vent apparent à ' + Math.round(Math.abs(awa)) + '°' : '') : 'Angle du vent inconnu');
    // allures
    $('r-all').innerHTML = ALLURES.map(([l, lo, hi]) => { const on = A != null && !tooClose && A >= lo && A < hi; return '<span role="listitem"' + (on ? ' aria-current="true" class="on"' : '') + '>' + l + '</span>'; }).join('');
    // vitesses
    $('r-vm').textContent = c.vm != null ? fr(c.vm, 1) : '–';
    $('r-vmlab').textContent = 'Vitesse réelle · ' + (c.vmSrc === 'loch' ? 'STW' : c.vmSrc === 'GPS' ? 'SOG' : 'en attente');
    $('r-vc').innerHTML = r0 && !tooClose ? fr(r0.V, 1) + '<small class="u"> nd</small>' : '–';
    const gm = c.v.xdr_heel, mes = gm != null ? ' · gîte mesurée ' + Math.round(Math.abs(gm)) + '°' : '';
    $('r-phi').textContent = r0 && !tooClose ? 'Au mieux : ' + giteTexte(r0, r0.c, r0, c) + mes : (gm != null ? 'Gîte mesurée ' + Math.round(Math.abs(gm)) + '°' : '');
    // réglages
    const rr = r && !tooClose ? r : null;
    const av = avecTesReglages(rr), avR = av || (rr ? { V: rr.V } : null);
    LIGNES.forEach(L => reglerLigne(L, rr, false, r0, avR)); EXPERT.forEach(L => reglerLigne(L, rr, true, r0, avR));
    $('r-list-note').hidden = !!rr;
    $('r-list-note').textContent = tooClose ? 'Trop près du vent : pas de réglage conseillé.' : 'Les conseils s’affichent dès que le vent et son angle sont connus.';
    $('r-avec').hidden = av == null || !r0;
    if (av != null && r0) {
      $('r-avv').innerHTML = fr(av.V, 1) + '<small class="u"> nd</small>';
      $('r-ave').textContent = av.V - r0.V >= -0.05 ? 'au mieux' : '−' + fr(r0.V - av.V, 1) + ' nd';
      $('r-avp').textContent = giteTexte(rr, configAvec(rr), av, c);
    }
    alerteLof(c, rr, tooClose);
    if (rr) {
      if (rr.next === undefined) { rr.next = null; setTimeout(() => { rr.next = prochain(rr); render(); }, 60); }
      $('r-next').hidden = !rr.next; $('r-nexttxt').textContent = rr.next || '';
    } else $('r-next').hidden = true;
    $('r-expert').hidden = !S.expert; $('r-exp').setAttribute('aria-expanded', String(S.expert)); $('r-exparrow').textContent = S.expert ? '▴' : '▾';
    // correction du vent
    $('r-editbox').hidden = !S.edit; $('r-edit').setAttribute('aria-pressed', String(S.edit)); $('r-edit').classList.toggle('on', S.edit);
    const base = S.corr || S.meteo;
    $('r-etws').textContent = base ? fr(base.tws, 0) : '–'; $('r-etwd').textContent = base ? String(Math.round(base.twd) % 360).padStart(3, '0') + '°' : '–';
    $('r-enote').textContent = c.src === 'B&G' ? 'Vent lu sur le B&G : la correction ne sert que sans lui.' : S.corr ? 'Vent corrigé à la main.' : 'Corrige la prévision si elle ne colle pas au plan d’eau.';
    $('r-eback').hidden = !S.corr;
  }

  function action(a) {
    const c = conditions();
    if (a.startsWith('man-')) {   // la pastille : manuel → auto ; auto → manuel sur la valeur conseillée
      const k = a.slice(4);
      if (S.man[k]) delete S.man[k];
      else if (dernier) prendre(k, VERS[k](dernier.c));   // valeur conseillée, adaptée aux autres réglages forcés
    } else if (/^\w+=-?\d+$/.test(a)) { const [k, v] = a.split('='); prendre(k, +v); }   // ris 0-1-2, repères du génois et du chariot
    else if (a === 'auto') { S.man = {}; }
    else if (/^hdg[-+]\d+$/.test(a)) { const d = parseInt(a.slice(3), 10); S.hdgSet = ((Math.round(S.hdgSet != null ? S.hdgSet : c.hdg != null ? c.hdg : 0) + d) % 360 + 360) % 360; }
    else if (a === 'hdgback') S.hdgSet = null;
    else if (a === 'plein') { ouvrirPlein(); return; }
    else if (a === 'pleinfin') { fermerPlein(); return; }
    else if (a === 'expert') S.expert = !S.expert;
    else if (a === 'edit') S.edit = !S.edit;
    else if (a === 'refresh') { meteo(); return; }
    else if (a === 'eback') S.corr = null;
    else if (/^e(tws|twd)[-+]$/.test(a)) {
      const b = S.corr || S.meteo || { tws: 10, twd: c.twd != null ? c.twd : 270 };
      S.corr = { tws: b.tws, twd: b.twd };
      if (a.startsWith('etws')) S.corr.tws = Math.max(0, Math.round(S.corr.tws) + (a.endsWith('+') ? 1 : -1));
      else S.corr.twd = ((Math.round(S.corr.twd / 5) * 5 + (a.endsWith('+') ? 5 : -5)) % 360 + 360) % 360;
    }
    render();
  }

  /* ---------- Plein écran : le bateau en 3D, vue du simulateur pilotée par le vent du moment ---------- */
  const DIAG3D = false;   // true : version de mesure du rendu 3D (essais de 8 s chronométrés, résultats à l’écran et dans le journal de l’appli), voir outillage/bateau.py
  let plein = null, envoi = '';
  function ouvrirPlein() {
    const c = conditions(), q = ['boat=' + (window.OT_BATEAU || 'b31'), 'go=1', 'live=0', 'view=chase'].concat(DIAG3D ? ['diag=1'] : []);
    if (c.tws != null) q.push('tws=' + Math.max(3, Math.round(c.tws)));
    if (c.twd != null) q.push('twd=' + ((Math.round(c.twd / 5) * 5) % 360));
    $('v-boat').hidden = false; $('pl-load').hidden = false; $('pl-info').hidden = false; envoi = '';
    const f = document.createElement('iframe');
    f.src = 'moteur/bateau.html#' + q.join('&'); f.title = 'O’Tacquet en 3D';
    f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0';
    $('pl-3d').appendChild(f); plein = f; pleinMaj();
  }
  function fermerPlein() { $('v-boat').hidden = true; if (plein) { plein.remove(); plein = null; } render(); }   // la vue 3D est libérée : batterie
  function pleinMaj() {
    if (!plein) return;
    const c = conditions(), r = dernier0, A = c.twa != null ? Math.abs(c.twa) : null, gm = c.v.xdr_heel;
    $('pl-tw').textContent = c.tws != null ? fr(c.tws, 0) + ' nds' + (A != null ? ' · ' + Math.round(A) + '° ' + (c.twa >= 0 ? 'tribord' : 'bâbord') : '') : '–';
    $('pl-heellab').textContent = gm != null ? 'Gîte' : 'Gîte (modèle)';
    let gx = r ? Math.round(r.phi) + '°' : '–';
    if (r && gm == null) { const R = rafale(c); if (R.g > 0.02) { const x = giteRafale(r, r.c, R.g); gx = R.direct ? Math.round(x.phi) + '°' : Math.round(r.phi) + '° à ' + Math.round(x.phi) + '°'; } }
    $('pl-heel').textContent = gm != null ? Math.round(Math.abs(gm)) + '°' : gx;
    $('pl-vmlab').textContent = 'Vitesse réelle · ' + (c.vmSrc === 'loch' ? 'STW' : c.vmSrc === 'GPS' ? 'SOG' : 'en attente');
    $('pl-vm').textContent = c.vm != null ? fr(c.vm, 1) : '–';
    $('pl-vclab').textContent = r ? 'Max théorique ' + fr(r.V, 1) + ' nds' : 'Max théorique';
    $('pl-ecart').textContent = r && c.vm != null ? (c.vm - r.V >= 0 ? '+' : '−') + fr(Math.abs(c.vm - r.V), 1) : '';
    // vers la vue 3D, seulement quand le vent arrondi ou un réglage change
    const m = { ot: 'bateau', tws: c.twsL != null ? Math.round(c.twsL) : c.tws != null ? Math.round(c.tws) : null, twd: c.twd != null ? Math.round(c.twd / 5) * 5 : null,
      twa: c.twaL != null ? Math.round(c.twaL / 5) * 5 : c.twa != null ? Math.round(c.twa / 5) * 5 : null,
      reef: S.man.reef && S.pose.reef != null ? S.pose.reef : null, furl: S.man.furl && S.pose.furl != null ? S.pose.furl : null };
    // les autres réglages passés en manuel suivent aussi (null : le simulateur les règle lui-même)
    if (c.src !== 'B&G' && c.gust != null && c.tws > 0) m.gust = Math.max(0, Math.min(40, Math.round((c.gust / c.tws - 1) * 100 / 5) * 5));
    for (const k of ['main', 'jib', 'trav', 'vang', 'bs', 'car']) { const v = POSE[k] ? S.pose[k] : S.val[k]; m[k] = S.man[k] && v != null ? Math.round(v) : null; }
    const sig = JSON.stringify(m);
    if (sig !== envoi && plein.contentWindow) { plein.contentWindow.postMessage(m, '*'); envoi = sig; }
  }
  window.addEventListener('message', e => {
    if (!plein || e.source !== plein.contentWindow || !e.data) return;
    if (e.data.ot === 'diag') console.log('DIAG3D ' + JSON.stringify(e.data));
    if (e.data.ot === 'appui') $('pl-info').hidden = !$('pl-info').hidden;   // appui court sur la vue 3D : informations affichées ou masquées (glisser et pincer bougent la caméra)
  });
  window.addEventListener('message', e => { if (plein && e.source === plein.contentWindow && e.data && e.data.ot === 'bateau-pret') { $('pl-load').hidden = true; envoi = ''; pleinMaj(); } });

  function prendre(k, v) {
    S.man[k] = true; S.val[k] = v; if (POSE[k]) S.pose[k] = v;
    render();
  }

  window.Reglages = {
    // ctx : { bord, last() → dernière position GPS, visible() → écran affiché }
    start(c) {
      if (!window.OTMoteur) return false;
      ctx = c; const bateau = window.OT_BATEAU || 'b31', m = window.OTMoteur.make(bateau); PHY = m.PHY; PHY.setGeo(window.OTMoteur.geo[bateau]);
      $('v-set').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) action(b.dataset.act); });
      $('r-list').innerHTML = LIGNES.map(L => ligneHTML(L, false)).join('') + '<p class="note" id="r-list-note" style="margin:6px 0"></p>';
      $('r-expert').innerHTML = EXPERT.map(L => ligneHTML(L, true)).join('');
      // toucher un curseur le passe en manuel ; le moteur recalcule au relâcher pour le génois, le pataras et les chariots de génois
      $('v-set').addEventListener('input', e => { const k = e.target.dataset && e.target.dataset.k; if (!k) return; touche[k] = true; S.man[k] = true; S.val[k] = +e.target.value; render(); });
      $('v-set').addEventListener('change', e => { const k = e.target.dataset && e.target.dataset.k; if (!k) return; touche[k] = false; if (POSE[k]) S.pose[k] = S.val[k]; render(); });
      meteo(); setInterval(meteo, 15 * 60 * 1000);
      setInterval(() => { render(); pleinMaj(); }, 1000);
      $('v-boat').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) action(b.dataset.act); });
      return true;
    },
    render
  };
})();
