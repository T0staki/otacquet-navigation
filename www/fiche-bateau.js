/* Écran « Bateaux », le même dans la console du Mac, O'Tacquet et Bord : plans, confiance dans la modélisation, caractéristiques, polaire du modèle
   et sorties en surimpression. Ce fichier ne contient que l'affichage. Les données (fiches, plans, polaires) viennent du dépôt privé, copiées à la compilation
   dans window.OT_FLOTTE (moteur/flotte.js, jamais publié) ; sans elles, l'écran n'existe pas. */
(function (root) {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fr = (x, d) => x == null || !isFinite(x) ? '–' : Number(x).toFixed(d == null ? 1 : d).replace('.', ',').replace(/^-/, '−');
  const pc = x => x == null ? '–' : (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(0) + ' %';
  const jour = t => t ? new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '';
  const ALERTE = { estimé: true, conflit: true, 'à vérifier': true, manquant: true };
  const VOILE = { 0: 'pleine', 1: '1 ris', 2: '2 ris' }, GENOIS = { deroule: 'génois déroulé', roule: 'génois roulé' };
  const voilure = s => [s.ris != null ? (s.ris === 0 ? 'Grand-voile pleine' : 'Grand-voile, ' + VOILE[s.ris]) : null, GENOIS[s.genois] || null].filter(Boolean).join(', ');

  // plan de voilure tiré des cotes de la fiche, à la même échelle pour tous
  function planVoilure(v, m) {
    const k = 17, Y = y => 26 + (m.h - y) * k, x0 = 34, xm = x0 + (v.J + 0.3) * k, c = t => t.toFixed(2).replace('.', ',') + ' m', larg = (v.loa * k + 2 * x0 + 40).toFixed(0);
    const pt = (x, y) => x.toFixed(1) + ' ' + Y(y).toFixed(1), haut = v.deck + v.BAD + v.P, cote = (x, y, t, a) => `<text x="${x.toFixed(0)}" y="${Y(y).toFixed(0)}" font-size="13" fill="var(--ink2)" text-anchor="${a || 'start'}">${t}</text>`;
    const coque = `M${pt(x0, v.deck + 0.15)} L${pt(x0 + v.loa * k, v.deck - 0.1)} L${pt(x0 + (v.loa - 0.3) * k, 0.1)} L${pt(x0 + 0.5 * k, 0.05)}Z`;
    return `<svg viewBox="0 0 ${larg} ${(m.h * k + 54).toFixed(0)}" role="img" aria-label="Plan de voilure" font-family="var(--f-data)">
      <path d="M0 ${Y(0).toFixed(1)} H${larg}" stroke="var(--water)"/>
      <path d="${coque}" fill="var(--deck)" stroke="var(--ink)" stroke-width="1.5"/>
      <path d="M${pt(x0 + 0.1 * k, v.deck + 0.4)} L${pt(xm, v.deck + v.I)} L${pt(x0 + (0.1 + v.LP) * k, v.deck + 0.55)}Z" fill="var(--deck)" stroke="var(--ink2)"/>
      <path d="M${pt(xm + 3, v.deck + v.BAD)} L${pt(xm + 3, haut)} L${pt(xm + 3 + v.E * k, v.deck + v.BAD)}Z" fill="var(--deck)" stroke="var(--ink2)"/>
      <path d="M${pt(xm, v.deck)} L${pt(xm, haut + 0.2)}" stroke="var(--ink)" stroke-width="3"/>
      ${cote(xm + v.E * k / 2 + 12, v.deck + v.BAD + 0.25, 'E ' + c(v.E), 'middle')}${cote(xm + v.E * k * 0.3 + 12, v.deck + v.BAD + v.P * 0.55, 'P ' + c(v.P))}
      ${cote(x0 + v.J * k * 0.45 - 6, v.deck + v.I * 0.62, 'I ' + c(v.I), 'end')}${cote(x0 + v.J * k / 2, v.deck + 0.05 - 0.75, 'J ' + c(v.J), 'middle')}
    </svg>`;
  }

  // o : flotte, bateaux() (tous, dans l'ordre), sorties() (sans relevés), releves(id) → promesse, redessiner(), theme() → 'nuit' | 'jour', exporter (facultatif)
  class Ecran {
    constructor(o) { this.o = o; this.F = o.flotte; this.vents = [6, 10, 15, 20]; this.surimp = null; this.polaires = {}; this.fen = {}; this.prepare = false; }
    fiche(id) { return this.F.fiches.bateaux[id] || null; }
    rang(id) { return this.o.bateaux().findIndex(b => b.id === id); }
    dot(id) { const r = this.rang(id); return `<span class="fb-dot${r >= 0 && r < 2 ? ' b' + (r + 1) : ''}"></span>`; }
    coul(id) { const r = this.rang(id); return r >= 0 && r < 2 ? `var(--bat${r + 1})` : 'var(--ink2)'; }

    html(bs) { return `<div class="fb">${this.plans(bs)}${this.confiance(bs)}${this.caracteristiques(bs)}${this.polaire(bs)}</div>`; }

    // même échelle pour tous : les dessins sont à 80 pixels par mètre, la largeur suit donc la longueur du bateau
    plans(bs) {
      const larg = svg => { const m = svg && svg.match(/viewBox="0 0 (\d+)/); return m ? +m[1] : 0; };
      const max = Math.max(1, ...bs.map(b => larg((this.F.plans[b.id] || {}).profil)));
      const vs = bs.map(b => this.fiche(b.id) && this.fiche(b.id).voilure).filter(Boolean), echelle = { h: Math.max(1, ...vs.map(v => v.deck + v.BAD + v.P + 0.5)) }, maxV = Math.max(1, ...vs.map(v => v.loa));
      return `<section class="fb-plans" aria-label="Plans">${bs.map(b => {
        const p = this.F.plans[b.id], f = this.fiche(b.id);
        return `<article class="fb-card"><h2 class="fb-nom">${this.dot(b.id)}${esc(b.nom)}<small>${esc(b.modele || '')}${b.port ? ' · ' + esc(b.port) : ''}</small></h2>
          ${f ? `<p class="fb-note">${esc(f.resume)}</p>` : ''}
          ${f && f.voilure ? `<span class="fb-lbl">Plan de voilure</span><div class="fb-plan" style="width:${(f.voilure.loa / maxV * 100).toFixed(1)}%">${planVoilure(f.voilure, echelle)}</div>` : ''}
          ${p ? `<span class="fb-lbl">Profil</span><div class="fb-plan" style="width:${(larg(p.profil) / max * 100).toFixed(1)}%">${p.profil}</div><span class="fb-lbl">Vue de dessus</span><div class="fb-plan" style="width:${(larg(p.dessus) / max * 100).toFixed(1)}%">${p.dessus}</div><p class="fb-note">Dessins tirés des cotes du simulateur, à la même échelle pour tous les bateaux.</p>` : '<p class="fb-gris">Pas encore de plan : le bateau reste à modéliser.</p>'}
        </article>`; }).join('')}</section>`;
    }
    confiance(bs) {
      const f0 = this.F.fiches, perime = f0.version && this.F.version && f0.version !== this.F.version;
      return `<section class="fb-card"><h2 class="fb-lbl">Confiance dans la modélisation</h2><p class="fb-note">${esc(f0.regle || '')} Notes du ${esc(jour(f0.le))}, version ${esc(f0.version || '')}.${perime ? ` <b class="fb-alerte">Le simulateur est passé en version ${esc(this.F.version)} : notes à relire.</b>` : ''}</p>
        <div class="fb-plans">${bs.map(b => {
          const f = this.fiche(b.id);
          if (!f) return `<div class="fb-col"><b>${esc(b.nom)}</b><p class="fb-note">Pas encore modélisé.</p></div>`;
          return `<div class="fb-col"><div class="fb-globale">${this.dot(b.id)}<span>${esc(b.nom)}</span><b>${f.confiance.ensemble} %</b><small>dans l'ensemble</small></div>
            ${f.confiance.domaines.map(d => `<div class="fb-dom"><b>${esc(d.nom)}</b><i>${d.pc} %</i><div class="fb-barre" aria-hidden="true"><span style="width:${d.pc}%;background:${this.coul(b.id)}"></span></div><small>${esc(d.pourquoi)}</small><small><b class="fb-statut">Pour monter :</b> ${esc(d.monter)}</small></div>`).join('')}</div>`;
        }).join('')}</div></section>`;
    }
    caracteristiques(bs) {
      const cel = (b, k) => { const f = this.fiche(b.id), v = f && f.valeurs[k]; if (!v) return '<td class="fb-gris">–</td>'; return `<td>${esc(v[0])}<small><span class="fb-statut${ALERTE[v[1]] ? ' fb-alerte' : ''}">${esc(v[1])}</span>${v[2] ? ' · ' + esc(v[2]) : ''}</small></td>`; };
      return `<section class="fb-card"><h2 class="fb-lbl">Caractéristiques</h2><div class="fb-tab"><table style="min-width:${130 + bs.length * 190}px"><thead><tr><th scope="col">Caractéristique</th>${bs.map(b => `<th scope="col">${esc(b.nom)}</th>`).join('')}</tr></thead><tbody>
        ${this.F.fiches.groupes.map(g => `<tr><th scope="rowgroup" colspan="${bs.length + 1}" class="fb-groupe">${esc(g.titre)}</th></tr>${g.lignes.map(([k, lib]) => `<tr><td>${esc(lib)}</td>${bs.map(b => cel(b, k)).join('')}</tr>`).join('')}`).join('')}
      </tbody></table></div><p class="fb-note">Chaque valeur dit d'où elle vient. En orange, ce qui reste à confirmer.</p></section>`;
    }

    /* ---------- Polaire : le modèle, et en surimpression les sorties choisies ---------- */
    // par défaut, la dernière sortie de chaque bateau affiché
    sortiesSurimp(bs) {
      const dispo = this.o.sorties().filter(s => bs.some(b => b.id === s.bateau));
      if (this.surimp) return this.surimp.map(id => dispo.find(s => s.id === id)).filter(Boolean);
      return bs.map(b => dispo.find(s => s.bateau === b.id)).filter(Boolean);
    }
    fenDe(l) { return l.flatMap(s => this.fen[s.id] || []); }
    polaire(bs) {
      const P = root.Polaire, sim = bs.filter(b => b.simulateur);
      for (const b of sim) { const q = this.polaires[b.id] || (this.polaires[b.id] = {}); if (!q.mod) q.mod = P.gardee(b.id); }   // polaire gardée : affichée d'emblée, sans passer par « Calcul »
      const prets = sim.filter(b => this.polaires[b.id].mod);
      const titre = '<h2 class="fb-lbl">Polaire calculée par le modèle mathématique</h2>';
      if (!sim.length) return `<section class="fb-card" id="polaire">${titre}<p class="fb-gris">Le simulateur ne sait pas encore faire naviguer ce bateau : il faut d'abord le modéliser.</p></section>`;
      if (!prets.length) { const q = this.polaires[sim[0].id]; return `<section class="fb-card" id="polaire">${titre}<p class="fb-gris">Calcul de la polaire avec le moteur du simulateur… ${q && q.progres ? Math.round(q.progres * 100) + ' %' : ''}</p></section>`; }
      const av = prets.some(b => b.id === 'b31') ? this.F.avalon || null : null, version = this.polaires[prets[0].id].mod.version;
      const dispo = this.o.sorties().filter(s => bs.some(b => b.id === s.bateau)), choisies = this.sortiesSurimp(bs);
      const proche = tws => this.vents.some(w => Math.abs(w - tws) <= 1.5);
      let cachees = 0;
      const mesures = choisies.flatMap((s, i) => P.pointsMesures(this.fen[s.id] || []).filter(m => proche(m.tws) || (cachees++, false)).map(m => Object.assign(m, { forme: P.FORMES[i], nom: esc(s.nom) })));
      const trait = (c, tiret) => `<svg width="24" height="4" aria-hidden="true"><path d="M0 2h24" stroke="${c}" stroke-width="2"${tiret ? ' stroke-dasharray="4 4"' : ''}/></svg>`;
      const forme = f => `<svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true">${P.marque(f, 0, 0, 4.5, 'fill="currentColor"')}</svg>`;
      return `<section class="fb-card" id="polaire"><div class="fb-tete">${titre}<span class="fb-note">Modèle en version ${esc(version)}</span></div>
        <div class="fb-choix" role="group" aria-label="Vents affichés"><span class="fb-note">Vent</span>${P.TWS.map(w => `<button type="button" class="fb-puce" aria-pressed="${this.vents.includes(w)}" data-fb="vent" data-v="${w}">${w} nds</button>`).join('')}</div>
        <div class="fb-choix" role="group" aria-label="Sorties en surimpression"><span class="fb-note">Sorties en surimpression</span>${dispo.length ? dispo.map(s => { const i = choisies.indexOf(s); return `<button type="button" class="fb-puce" aria-pressed="${i >= 0}" data-fb="surimp" data-v="${esc(s.id)}">${i >= 0 ? forme(P.FORMES[i]) : ''}${esc(s.nom)}<small>${esc(jour(s.debut))}</small></button>`; }).join('') : '<span class="fb-gris">Aucune sortie reçue pour l\'instant.</span>'}</div>
        <div class="fb-deux"><div class="fb-dessin">
          <div class="fb-legende">${prets.map(b => `<span>${trait(this.coul(b.id))}${esc(b.nom)}, modèle</span>`).join('')}${av ? `<span>${trait('var(--bat1)', true)}Polaire Avalon (repère)</span>` : ''}${choisies.map((s, i) => `<span>${forme(P.FORMES[i])}${esc(s.nom)}</span>`).join('')}</div>
          ${P.dessin({ series: prets.map(b => ({ nom: esc(b.nom), mod: this.polaires[b.id].mod })), vents: this.vents, avalon: av, mesures, theme: this.o.theme() })}
          <p class="fb-note">Angle au vent réel (TWA), vitesse en nœuds. Au survol ou au toucher long, chaque courbe et chaque point donnent leur valeur.${cachees ? ` ${cachees} point${cachees > 1 ? 's' : ''} mesuré${cachees > 1 ? 's' : ''} par un autre vent, masqué${cachees > 1 ? 's' : ''} : coche ce vent pour ${cachees > 1 ? 'les' : 'le'} voir.` : ''}</p>
        </div>
        <div class="fb-droite">
          ${prets.some(b => b.id === 'b31') ? this.repere() : ''}
          ${prets.map(b => this.cases(b, choisies)).join('')}
          ${this.rejeu(prets)}
          ${prets.map(b => this.table(b, b.id === 'b31' ? av : null)).join('')}
        </div></div></section>`;
    }
    repere() {
      const r = this.polaires.b31.mod.repere; if (!r) return '';
      return `<section class="fb-bloc"><span class="fb-lbl">Repère du bord au près, O'Tacquet</span><div class="fb-cases"><div><span>Repère</span><b>4,5 nds</b></div><div><span>Modèle</span><b>${fr(r.V)} nds</b></div><div><span>Écart</span><b class="fb-alerte">${pc(r.V / 4.5 - 1)}</b></div></div><p class="fb-note">Par 15 nœuds de vent, ${Math.round(r.awa)}° de vent apparent (TWA ${r.twa}°, dérive non comptée). À comparer aux mesures du B&amp;G : ce repère vérifie le modèle, il ne le règle pas.</p></section>`;
    }
    cases(b, choisies) {
      const l = choisies.filter(s => s.bateau === b.id), fen = this.fenDe(l); if (!fen.length) return '';
      const cs = root.Polaire.cases(fen, this.polaires[b.id].mod), v = l.map(s => voilure(s) ? esc(s.nom) + ' : ' + esc(voilure(s)).toLowerCase() : null).filter(Boolean).join(' ; ');
      return `<section class="fb-bloc"><span class="fb-lbl">${esc(b.nom)} : mesuré, par force de vent et par allure</span><div class="fb-tab"><table class="fb-num" style="min-width:520px"><thead><tr><th scope="col">Vent</th><th scope="col">Allure</th><th scope="col">Minutes</th><th scope="col">STW réelle</th><th scope="col">Modèle</th><th scope="col">Écart</th><th scope="col">Gîte réelle</th></tr></thead><tbody>${cs.map(c => `<tr><td>${c.vent}</td><td>${c.allure}</td><td>${fr(c.minutes, 1)}</td><td>${fr(c.reel, 2)}</td><td>${fr(c.modele, 2)}</td><td>${pc(c.ecart)}</td><td>${c.gite == null ? '–' : fr(c.gite) + '°'}</td></tr>`).join('')}</tbody></table></div><p class="fb-note">Fenêtres stables de 30 secondes ; une case de moins de 5 minutes ne dit presque rien. ${v ? 'Voilure notée : ' + v + '. ' : 'Voilure non notée. '}Le modèle suppose la meilleure voilure et des réglages parfaits ; écoutes et chariots ne sont pas relevés : un écart ne dit pas encore d'où il vient. Il ne sert jamais à recaler le modèle.</p></section>`;
    }
    // la preuve : toutes les sorties rejouées sur chaque version gardée du modèle
    rejeu(prets) {
      const P = root.Polaire;
      return `<section class="fb-bloc"><span class="fb-lbl">Le modèle se rapproche-t-il du réel ?</span>${prets.map(b => {
        const so = this.o.sorties().filter(s => s.bateau === b.id), fen = this.fenDe(so), vers = P.versionsDe(b.id);
        if (!fen.length) return `<p class="fb-note"><b class="fb-statut">${esc(b.nom)} :</b> toutes les sorties seront rejouées sur chaque version du modèle, dès la première sortie. Version${vers.length > 1 ? 's' : ''} gardée${vers.length > 1 ? 's' : ''} : ${vers.map(v => esc(v.version)).join(', ') || 'aucune'}.</p>`;
        const pleine = this.fenDe(so.filter(s => s.ris === 0 && s.genois === 'deroule'));
        const ligne = (v, f, lib) => { const e = P.ecart(f, v), c = x => `<td>${x ? pc(x.ecart) + `<small>${fr(x.minutes, 0)} minutes</small>` : '–'}</td>`; return `<tr><td>${lib}</td>${c(e.ensemble)}${e.allures.map(a => c(a.res)).join('')}</tr>`; };
        const lignes = vers.map(v => ligne(v, fen, esc(v.version)) + (pleine.length ? ligne(v, pleine, esc(v.version) + '<small>pleine toile seulement</small>') : '')).join('');
        const al = P.ecart([], vers[0] || { V: {} }).allures.map(a => `<th scope="col">${a.allure}</th>`).join('');
        return `<div class="fb-rejeu"><b class="fb-statut">${esc(b.nom)} · ${so.length} sortie${so.length > 1 ? 's' : ''} rejouée${so.length > 1 ? 's' : ''}</b><div class="fb-tab"><table class="fb-num" style="min-width:520px"><thead><tr><th scope="col">Version</th><th scope="col">Ensemble</th>${al}</tr></thead><tbody>${lignes}</tbody></table></div></div>`;
      }).join('')}<p class="fb-note">Écart médian entre la STW réelle et la vitesse maximale théorique du modèle. Négatif : le modèle va trop vite. Plus la valeur se rapproche de zéro d'une version à l'autre, mieux c'est ; une allure qui s'éloigne est un recul à expliquer.</p></section>`;
    }
    table(b, av) {
      const mod = this.polaires[b.id].mod, valAv = (w, a) => { if (!av || !av.V[w]) return null; const i = av.TWA.indexOf(a); return i < 0 ? null : av.V[w][i]; };
      return `<section class="fb-bloc"><div class="fb-tete"><span class="fb-lbl">${esc(b.nom)} : modèle${av ? ' et polaire Avalon' : ''}, en nœuds</span>${this.o.exporter ? `<button type="button" class="fb-puce" data-fb="exporter" data-v="${esc(b.id)}">Exporter la polaire</button>` : ''}</div><div class="fb-tab"><table class="fb-num" style="min-width:${80 + this.vents.length * 80}px"><thead><tr><th scope="col">TWA</th>${this.vents.map(w => `<th scope="col">${w} nds</th>`).join('')}</tr></thead><tbody>${mod.TWA.map((a, i) => `<tr><td><b>${a}°</b></td>${this.vents.map(w => `<td>${fr(mod.V[w][i])}${av ? ' · ' + fr(valAv(w, a)) : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${av ? '<p class="fb-note">Dans chaque case : modèle, puis polaire Avalon. Avalon n\'est pas exactement O\'Tacquet ; elle n\'a pas de valeurs sous 50°.</p>' : ''}</section>`;
    }

    /* ---------- Gestes et préparation ---------- */
    // renvoie true si le geste concerne cet écran
    geste(el, bs) {
      const P = root.Polaire, a = el.dataset.fb, v = el.dataset.v;
      if (a === 'vent') { const w = +v, i = this.vents.indexOf(w); if (i >= 0 && this.vents.length === 1) return true; if (i >= 0) this.vents.splice(i, 1); else this.vents = P.TWS.filter(x => x === w || this.vents.includes(x)); this.o.redessiner(); return true; }
      if (a === 'surimp') {
        const l = this.sortiesSurimp(bs).map(s => s.id), i = l.indexOf(v);
        if (i >= 0) l.splice(i, 1); else if (l.length >= P.FORMES.length) { if (this.o.signaler) this.o.signaler('Quatre sorties au plus sur la polaire.'); return true; } else l.push(v);
        this.surimp = l; this.o.redessiner(); return true;
      }
      if (a === 'exporter' && this.o.exporter) { const q = this.polaires[v]; if (q && q.mod) this.o.exporter(v, q.mod); return true; }
      return false;
    }
    // polaires et relevés des bateaux affichés ; un seul passage à la fois, l'écran se redessine quand quelque chose arrive
    async preparer(bs, seulementDerniere) {
      if (this.prepare) return;
      this.prepare = true; let change = false;
      try {
        for (const b of bs.filter(x => x.simulateur)) {
          const q = this.polaires[b.id] || (this.polaires[b.id] = {});
          if (!q.mod) {
            try { q.mod = await root.Polaire.modele(b.id, p => { q.progres = p; }); change = true; }
            catch (e) { if (this.o.signaler) this.o.signaler(e.message); return; }
          }
          const so = this.o.sorties().filter(s => s.bateau === b.id);
          for (const s of seulementDerniere ? so.slice(0, 1) : so) {
            if (this.fen[s.id]) continue;
            try { this.fen[s.id] = root.Polaire.fenetres(await this.o.releves(s.id)); } catch (e) { this.fen[s.id] = []; }
            change = true;
          }
        }
      } finally { this.prepare = false; }
      if (change) this.o.redessiner();
    }
  }
  root.FicheBateau = { Ecran, voilure };
})(typeof self !== 'undefined' ? self : this);
