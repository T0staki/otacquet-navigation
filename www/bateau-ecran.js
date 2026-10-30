/* Onglet « Bateau » d'O'Tacquet et de Bord : le profil de l'utilisateur (son nom, son bateau) et l'écran partagé avec la console (fiche-bateau.js).
   Pas de compte ni d'adresse : le profil est lié à l'identité du téléphone, gardée dans le trousseau de l'iPhone. Bord reçoit à la compilation un profil
   par défaut, écrit sans rien demander ; O'Tacquet le demande une fois. Le bateau du profil choisit les tâches du carnet, les sorties et le modèle de Réglages. */
(function (root) {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LS = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
  const lu = k => { try { return JSON.parse(LS.get(k) || 'null'); } catch (e) { return null; } };

  let o = null, S = null, E = null, bateaux = [], sorties = [], choix = null, edition = false, attendu = false, dessine = null;
  const profil = () => lu('carnet-profil');   // { nom, bateau, envoye }
  // sans réseau au premier lancement : les bateaux connus des fiches
  const secours = () => { const F = root.OT_FLOTTE; return Object.keys(F.fiches.bateaux).map(id => ({ id, nom: F.fiches.bateaux[id].nom, modele: F.fiches.bateaux[id].modele, port: F.fiches.bateaux[id].port, simulateur: true })); };
  const choisis = () => { const p = profil(), ids = choix || [(p && p.bateau) || bateaux[0].id]; const l = bateaux.filter(b => ids.includes(b.id)); return l.length ? l : bateaux.slice(0, 1); };

  async function envoyerProfil() {
    const p = profil(); if (!p || p.envoye) return;
    await S.ecrireProfil({ nom: p.nom, bateau: p.bateau });
    LS.set('carnet-profil', JSON.stringify(Object.assign(p, { envoye: true })));
  }
  async function synchro() {
    if (!S) return;
    await o.pret;
    let change = false;
    try {
      const b = await S.lireBateaux(); if (b.length) { bateaux = b; LS.set('carnet-bateaux', JSON.stringify(b)); change = true; }
      sorties = await S.lireSorties(); change = true;
      await envoyerProfil();
      const distant = await S.lireProfil(), local = profil();
      if (distant) { if (!local || local.nom !== distant.nom || local.bateau !== distant.bateau) { const nouveauBateau = local && local.bateau !== distant.bateau; LS.set('carnet-profil', JSON.stringify({ nom: distant.nom, bateau: distant.bateau, envoye: true })); if (nouveauBateau) { location.reload(); return; } } }
      else if (local) { LS.set('carnet-profil', JSON.stringify(Object.assign(local, { envoye: false }))); await envoyerProfil(); }   // identité nouvelle sur ce téléphone : le profil gardé la suit
      else if (o.bord && o.config.profil_bord) { LS.set('carnet-profil', JSON.stringify({ nom: o.config.profil_bord.nom, bateau: o.config.profil_bord.bateau, envoye: false })); await envoyerProfil(); root.OT_BATEAU = profil().bateau; }
      else if (!attendu) { attendu = true; edition = true; o.tab('bat'); }   // O'Tacquet, première fois : une seule demande
    } catch (e) {}
    if (change || edition) dessiner();
  }

  function dessinerProfil() {
    const p = profil(), box = $('b-profil');
    if (!edition) {
      box.innerHTML = p ? `<div class="fb-tete"><span><span class="fb-lbl">Ton profil</span><br><b>${esc(p.nom)}</b> · ${esc((bateaux.find(b => b.id === p.bateau) || {}).nom || '')}</span><button type="button" class="fb-puce" id="pf-modif">Modifier</button></div>`
        : '<div class="fb-tete"><span class="fb-note">Pas encore de profil.</span><button type="button" class="fb-puce" id="pf-modif">Créer mon profil</button></div>';
      $('pf-modif').onclick = () => { edition = true; dessinerProfil(); };
      return;
    }
    if ($('pf-nom')) return;   // formulaire ouvert : on ne l'efface pas sous les doigts
    box.innerHTML = `<span class="fb-lbl">Ton profil</span><p class="fb-note">Ton nom accompagne ce que tu envoies au carnet ; ton bateau choisit tes tâches, tes sorties et le modèle de Réglages. Ni adresse ni mot de passe.</p>
      <label class="note" for="pf-nom">Nom</label><input class="name" id="pf-nom" autocomplete="off" maxlength="60" value="${esc(p ? p.nom : '')}">
      <label class="note" for="pf-bateau">Bateau</label><select class="name" id="pf-bateau">${bateaux.map(b => `<option value="${esc(b.id)}"${(p ? p.bateau : bateaux[0].id) === b.id ? ' selected' : ''}>${esc(b.nom)}${b.modele ? ' · ' + esc(b.modele) : ''}</option>`).join('')}</select>
      <div class="btns">${p ? '<button class="btn" id="pf-annuler">Annuler</button>' : ''}<button class="btn main" id="pf-ok">Enregistrer</button></div>`;
    if (p) $('pf-annuler').onclick = () => { edition = false; dessiner(); };
    $('pf-ok').onclick = () => {
      const nom = $('pf-nom').value.trim(), bateau = $('pf-bateau').value; if (!nom) { $('pf-nom').focus(); return; }
      const avant = profil(), autre = !avant || avant.bateau !== bateau;
      LS.set('carnet-profil', JSON.stringify({ nom, bateau, envoye: false }));
      edition = false; root.OT_BATEAU = bateau; choix = null;
      const fin = () => { if (autre) location.reload(); else dessiner(); };   // autre bateau : le carnet et Réglages repartent sur lui
      envoyerProfil().catch(() => {}).then(fin);
    };
  }
  function dessiner() {
    if (!S || !bateaux.length || !$('v-bat').classList.contains('on')) return;   // caché : rien à dessiner, l'onglet redessine en s'ouvrant
    dessinerProfil();
    const haut = $('b-corps').scrollTop, bs = choisis();
    $('b-choix').innerHTML = bateaux.map(b => `<button type="button" class="fb-puce" aria-pressed="${bs.some(x => x.id === b.id)}" data-bateau="${esc(b.id)}">${E.dot(b.id)}${esc(b.nom)}</button>`).join('');
    const h = E.html(bs); if (h !== dessine) { $('b-fiche').innerHTML = h; dessine = h; }
    $('b-corps').scrollTop = haut;
    if ($('v-bat').classList.contains('on')) E.preparer(bs);
  }

  function start(c) {
    if (!c.service || !root.OT_FLOTTE) return false;
    o = c; S = c.service;
    bateaux = lu('carnet-bateaux') || secours();
    root.OT_BATEAU = (profil() || {}).bateau || root.OT_BATEAU;
    E = new root.FicheBateau.Ecran({
      flotte: root.OT_FLOTTE, bateaux: () => bateaux, sorties: () => sorties, releves: id => S.releves(id), redessiner: dessiner,
      theme: () => root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches ? 'nuit' : 'jour'
    });
    $('b-fiche').addEventListener('click', e => { const el = e.target.closest('[data-fb]'); if (el) E.geste(el, choisis()); });
    $('b-choix').addEventListener('click', e => {
      const el = e.target.closest('[data-bateau]'); if (!el) return;
      const l = choisis().map(b => b.id), i = l.indexOf(el.dataset.bateau);
      if (i >= 0 && l.length === 1) return;
      if (i >= 0) l.splice(i, 1); else l.push(el.dataset.bateau);
      choix = l; dessiner();
    });
    root.addEventListener('online', synchro);
    if (root.matchMedia) root.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', dessiner);   // la polaire change de teintes avec l'iPhone
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') synchro(); });
    dessiner(); synchro();
    return true;
  }
  const nom = () => (profil() || {}).nom || null;
  const bateau = () => (profil() || {}).bateau || 'b31';
  root.BateauEcran = { start, dessiner, nom, bateau };
})(typeof self !== 'undefined' ? self : this);
