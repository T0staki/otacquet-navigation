/* Écran Réglages de l'appli iPhone (maquette 3 « O'Tacquet en navigation »).
   Vitesse cible, gîte, barre et réglages conseillés viennent du moteur du simulateur (objet PHY du dépôt privé
   simulateur-voile_v0), copié dans www/moteur/ par outillage/moteur.sh au moment de compiler l'appli : il n'est jamais publié.
   Vent : le B&G s'il est connecté, sinon Open-Meteo à la position du bateau (arrondie au centième de degré), corrigeable à la main.
   Angles du vent signés : positif = vent venant de tribord (tribord amures), comme le lecteur NMEA. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const fr = (n, d) => n.toFixed(d).replace('.', ',');
  const hm = t => { const d = new Date(t); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const KN = 0.514444, TROP_PRES = 40, LISSAGE = 0.15;   // lissage du vent du B&G, par seconde (≈ 6 s)
  const ALLURES = [['Près', 0, 60], ['Bon plein', 60, 80], ['Travers', 80, 100], ['Largue', 100, 135], ['Grand largue', 135, 165], ['Vent arrière', 165, 181]];
  const VALS = { bs: [0, 25, 50, 75, 100], car: [0, 25, 50, 75, 100], vang: [0, 25, 50, 75, 100], trav: [-100, -50, 0, 50, 100] };
  let PHY = null, ctx = null, lisse = null, dernier = null, enCalcul = false;
  const S = { hdgSet: null, man: {}, reef: 0, furl: 0, expert: false, edit: false, meteo: null, meteoErr: '', corr: null };
  const cache = new Map();

  /* ---------- Conditions : vent, cap, vitesse mesurée ---------- */
  function conditions() {
    const v = ctx.bord ? ctx.bord.now(5000) : {}, g = ctx.last(), c = { v };
    if (S.hdgSet != null) { c.hdg = S.hdgSet; c.hdgSrc = 'choisi'; }
    else if (v.heading != null) { c.hdg = v.heading; c.hdgSrc = 'B&G'; }
    else if (g && g.cog != null && g.sog > 1) { c.hdg = g.cog; c.hdgSrc = 'route fond GPS'; }
    if (v.tws != null && (v.twd != null || v.twa != null)) { c.src = 'B&G'; c.tws = v.tws; c.twd = v.twd; }
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
  function fixes() {
    const fx = {};
    if (S.man.reef) fx.reef = S.reef;
    if (S.man.furl) fx.furl = PHY.FURL_MARKS[S.furl];
    return fx;
  }
  function calc(tws, A) {
    const fx = fixes(), key = [tws, A, fx.reef, fx.furl].join('|');
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
      const fx = Object.assign({ bs: r.c.bs, car: r.c.car }, fixes()), o = PHY.optimum(t * KN, r.A, fx);
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
  const jibTxt = j => j >= 37.5 ? 'choquée au maximum' : j <= PHY.Y.jibMin + 0.5 ? 'bordée à fond' : 'génois à ' + Math.round(j) + '° de l’axe';
  const travTxt = v => v === 0 ? 'au milieu' : v === -100 ? 'tout au vent' : v === 100 ? 'tout sous le vent' : v < 0 ? 'à mi-course au vent' : 'à mi-course sous le vent';
  const EXPERT = {
    bs: { name: 'Pataras', lo: 'relâché', hi: 'à fond', val: v => v === 0 ? 'relâché' : v === 100 ? 'à fond' : v + ' %' },
    car: { name: 'Chariots de génois', lo: 'avant', hi: 'arrière', val: v => v === 0 ? 'tout à l’avant' : v === 100 ? 'tout à l’arrière' : v === 50 ? 'mi-rail' : v + ' % du rail' },
    vang: { name: 'Hale-bas', lo: 'choqué', hi: 'étarqué', val: v => v === 0 ? 'choqué' : v === 100 ? 'étarqué' : v === 50 ? 'mi-tension' : v === 25 ? 'peu repris' : 'bien repris' }
  };
  const curseur = (pos, lo, hi, plein) => '<div class="sl"><span>' + lo + '</span><div class="tr"><i class="' + (plein ? 'on' : '') + '" style="left:calc(' + Math.max(0, Math.min(100, pos)).toFixed(0) + '% - 7px)"></i></div><span>' + hi + '</span></div>';
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  function render() {
    if (!PHY || !ctx.visible()) return;
    const c = conditions();
    $('r-src').textContent = c.tws != null
      ? 'Vent ' + fr(c.tws, 0) + ' nds' + (c.gust != null ? ', rafales ' + fr(c.gust, 0) : '') + (c.hs != null ? ' · mer ' + fr(c.hs, 1) + ' m' : '') + ' · ' + c.src
      : (S.meteoErr || 'Vent en attente du B&G ou de la météo');
    // cap et rose
    const A = c.twa != null ? Math.abs(c.twa) : null, cote = c.twa == null ? '' : c.twa >= 0 ? 'tribord amures' : 'bâbord amures';
    $('r-hdg').textContent = c.hdg != null ? String(Math.round(c.hdg) % 360).padStart(3, '0') + '°' : '–';
    $('r-hdgsrc').textContent = c.hdg != null ? 'Cap · ' + c.hdgSrc : 'Cap inconnu : choisis-le';
    $('r-hdgback').hidden = S.hdgSet == null;
    const tooClose = A != null && A < TROP_PRES;
    $('r-twa').textContent = A == null ? (c.tws != null ? 'il manque le cap pour l’angle du vent' : '') : tooClose ? 'Trop près du vent (' + Math.round(A) + '°) : abats' : 'vent réel' + (c.twd != null ? ' du ' + String(Math.round(c.twd) % 360).padStart(3, '0') + '°' : '') + ', ' + Math.round(A) + '° ' + cote;
    $('r-twa').classList.toggle('alerte', tooClose);
    // moteur sur le vent lissé, arrondi (1 nd, 5°)
    let r = null;
    if (c.twsL != null && !tooClose && c.twsL >= 2) {
      const tws = Math.round(c.twsL), Ar = Math.min(180, Math.max(TROP_PRES, Math.round(Math.abs(c.twaL) / 5) * 5));
      r = cache.get([tws, Ar, fixes().reef, fixes().furl].join('|'));
      if (!r && !enCalcul) { enCalcul = true; $('r-calc').hidden = false; setTimeout(() => { try { calc(tws, Ar); } finally { enCalcul = false; $('r-calc').hidden = true; render(); } }, 30); }
      if (!r && dernier) r = dernier;
    }
    if (r) dernier = r;
    let awa = c.awa;
    if (awa == null && c.twa != null && r) awa = Math.sign(c.twa || 1) * Math.atan2(c.tws * Math.sin(A * Math.PI / 180), c.tws * Math.cos(A * Math.PI / 180) + r.V) * 180 / Math.PI;
    $('r-aw-txt').textContent = awa != null ? 'vent apparent ' + Math.round(Math.abs(awa)) + '°' + (c.awa != null ? ' (B&G)' : ' (calculé)') : '';
    $('r-tw').setAttribute('transform', 'rotate(' + (c.twa != null ? c.twa : 0) + ' 60 60)'); $('r-tw').style.display = c.twa != null ? '' : 'none';
    $('r-aw').setAttribute('transform', 'rotate(' + (awa != null ? awa : 0) + ' 60 60)'); $('r-aw').style.display = awa != null ? '' : 'none';
    $('r-rose').setAttribute('aria-label', c.twa != null ? 'Vent réel à ' + Math.round(A) + '° ' + cote + (awa != null ? ', vent apparent à ' + Math.round(Math.abs(awa)) + '°' : '') : 'Angle du vent inconnu');
    // allures
    $('r-all').innerHTML = ALLURES.map(([l, lo, hi]) => { const on = A != null && !tooClose && A >= lo && A < hi; return '<span role="listitem"' + (on ? ' aria-current="true" class="on"' : '') + '>' + l + '</span>'; }).join('');
    // vitesses
    $('r-vm').textContent = c.vm != null ? fr(c.vm, 1) : '–';
    $('r-vmlab').textContent = 'Vitesse réelle · ' + (c.vmSrc === 'loch' ? 'loch' : c.vmSrc === 'GPS' ? 'GPS' : 'en attente');
    $('r-vc').textContent = r && !tooClose ? fr(r.V, 1) : '–';
    const gm = c.v.xdr_heel;
    $('r-phi').textContent = r && !tooClose ? 'Gîte ' + Math.round(r.phi) + '°' + (gm != null ? ' (mesurée ' + Math.round(Math.abs(gm)) + '°)' : '') + ' · barre ' + Math.round(r.helm) + '°' : (gm != null ? 'Gîte mesurée ' + Math.round(Math.abs(gm)) + '°' : '');
    // réglages
    if (r && !tooClose) {
      const o = r.c, ri = PHY.FURL_MARKS.indexOf(o.furl), jm = PHY.Y.jibMin;
      const SIMPLE = [
        ['reef', 'Ris', o.reef === 0 ? 'aucun, GV pleine' : o.reef === 1 ? '1 ris' : '2 ris', o.reef / 2 * 100, 'GV pleine', '2 ris'],
        ['furl', 'Génois', o.furl === 0 ? 'déroulé' : 'roulé ' + Math.round(o.furl * 100) + ' %', o.furl / 0.8 * 100, 'déroulé', 'roulé 80 %'],
        ['main', 'Écoute de GV', 'bôme à ' + Math.round(o.mainSet) + '° de l’axe', o.mainSet / 85 * 100, 'bordée', 'choquée'],
        ['jib', 'Écoute de génois', jibTxt(o.jibSet), (o.jibSet - jm) / (38 - jm) * 100, 'bordée', 'choquée'],
        ['trav', 'Chariot de GV', travTxt(o.trav) + (r.sens.trav < 0.05 ? ' (indifférent)' : ''), (o.trav + 100) / 2, 'au vent', 'sous le vent']
      ];
      $('r-list').innerHTML = SIMPLE.map(([k, name, val, pos, lo, hi]) => {
        const m = !!S.man[k], fixe = m && (k === 'reef' || k === 'furl');
        const pas = fixe ? '<span class="pas"><button data-act="' + k + '-" aria-label="' + name + ' : moins">−</button><button data-act="' + k + '+" aria-label="' + name + ' : plus">+</button></span>' : '';
        const txt = fixe ? val + ' (choisi)' : m ? 'à toi · conseil : ' + val : val;
        return '<div class="rg"><div class="rh"><span class="rn">' + name + ' <small>· ' + esc(txt) + '</small></span>' + pas +
          '<button class="pill' + (m ? '' : ' on') + '" data-act="man-' + k + '" aria-pressed="' + m + '" aria-label="' + name + (m ? ' : repasser en auto' : ' : reprendre la main') + '">' + (m ? 'manuel' : 'auto') + '</button></div>' +
          curseur(pos, lo, hi, !m || fixe) + '</div>';
      }).join('');
      $('r-expert').innerHTML = ['bs', 'car', 'vang'].sort((a, b) => r.sens[b] - r.sens[a]).map((k, i) => {
        const L = EXPERT[k], on = r.sens[k] >= 0.05;
        return '<div class="rg' + (on ? '' : ' off') + '"><div class="rh"><span class="rn">' + L.name + ' <small>· ' + L.val(o[k]) + '</small></span><span class="imp">' + (on ? 'jusqu’à −' + fr(Math.max(0.1, Math.round(r.sens[k] * 10) / 10), 1) + ' nd' : 'indifférent') + '</span></div>' + curseur(o[k], L.lo, L.hi, on) + '</div>';
      }).join('');
      if (r.next === undefined) { r.next = null; setTimeout(() => { r.next = prochain(r); render(); }, 60); }
      $('r-next').hidden = !r.next; $('r-nexttxt').textContent = r.next || '';
    } else {
      $('r-list').innerHTML = '<p class="note" style="margin:6px 0">' + (tooClose ? 'Trop près du vent : pas de réglage conseillé.' : 'Les réglages s’affichent dès que le vent et son angle sont connus.') + '</p>';
      $('r-expert').innerHTML = ''; $('r-next').hidden = true;
    }
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
    if (a.startsWith('man-')) {
      const k = a.slice(4); S.man[k] = !S.man[k];
      if (S.man[k] && dernier) { if (k === 'reef') S.reef = dernier.c.reef; if (k === 'furl') S.furl = Math.max(0, PHY.FURL_MARKS.indexOf(dernier.c.furl)); }
    } else if (a === 'reef-' || a === 'reef+') S.reef = Math.max(0, Math.min(2, S.reef + (a === 'reef+' ? 1 : -1)));
    else if (a === 'furl-' || a === 'furl+') S.furl = Math.max(0, Math.min(PHY.FURL_MARKS.length - 1, S.furl + (a === 'furl+' ? 1 : -1)));
    else if (a === 'auto') { S.man = {}; }
    else if (/^hdg[-+]\d+$/.test(a)) { const d = parseInt(a.slice(3), 10); S.hdgSet = ((Math.round(S.hdgSet != null ? S.hdgSet : c.hdg != null ? c.hdg : 0) + d) % 360 + 360) % 360; }
    else if (a === 'hdgback') S.hdgSet = null;
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

  window.Reglages = {
    // ctx : { bord, last() → dernière position GPS, visible() → écran affiché }
    start(c) {
      if (!window.OTMoteur) return false;
      ctx = c; const m = window.OTMoteur.make('b31'); PHY = m.PHY; PHY.setGeo(window.OTMoteur.geo.b31);
      $('v-set').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) action(b.dataset.act); });
      meteo(); setInterval(meteo, 15 * 60 * 1000);
      setInterval(render, 1000);
      return true;
    },
    render
  };
})();
