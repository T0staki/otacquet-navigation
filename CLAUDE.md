# O'Tacquet en mer — consignes pour Claude

Appli de navigation et journal de bord d'O'Tacquet (Bavaria 31 Cruiser de Jérémie, Saint-Cast). Web (GitHub Pages) et iPhone (Capacitor 8.5.2).

## Langue et manière
- Tout en français : interface, commentaires, commits, documents. Tutoiement avec Jérémie ; Claude parle au féminin ; niveau de confiance en % en tête de réponse.
- Interface sans abréviations, sauf les termes et sigles du B&G Vulcan pour les données du bord (STW, SOG…), expliqués dans les légendes par appui long.
- Dépôt public : jamais de position réelle du bateau, de numéro de série, d'adresse MAC ni de donnée personnelle dans le code, les tests ou les commits. Les traces restent sur le téléphone.

## Structure
- `www/` : l'appli (une page `index.html` avec les écrans Réglages, Trace et Journal ; `trace.js` moteur de trace, `nmea.js` lecteur NMEA 0183, `reglages.js` écran Réglages, `vendor/leaflet`). Publiée telle quelle sur https://t0staki.github.io/otacquet-navigation/ par `.github/workflows/pages.yml` après les tests.
- `ios/` : projet Xcode généré par Capacitor. Le module natif « Bord » est à la fin de `ios/App/App/AppDelegate.swift` (TCP vers le B&G, GPS écran verrouillé, partage de fichier) ; le contrôleur `OTViewController` l'enregistre. Attention : avec Capacitor 8, c'est `SceneDelegate.swift` qui crée l'écran (pas le storyboard) ; il doit instancier `OTViewController()`, sinon « Bord » n'existe pas.
- Côté page, `Capacitor.registerPlugin` vient de `www/vendor/capacitor/capacitor.js` (copie de `@capacitor/core/dist/capacitor.js`, à recopier si on change de version de Capacitor) ; sans lui, le script plante au démarrage sur l'iPhone. Autorisations dans `Info.plist` (localisation, réseau local, mode d'arrière-plan « location »).
- Moteur du simulateur : `outillage/moteur.sh` copie l'objet `PHY` et la géométrie depuis le dépôt privé voisin (`../simulateur-voile_v0`, ou `SIMU_REPO`) dans `www/moteur/moteur.js`, **ignoré par Git** : il n'est jamais publié. L'écran Réglages n'existe donc que dans l'appli iPhone (onglet caché sur le web). Relancer `npm run moteur` après chaque version du simulateur.
- `design/` : sources de la maquette 3 (écrans Réglages, plein écran, journal), référence visuelle et données.
- `tests/` : `node tests/trace.test.js && node tests/nmea.test.js && node tests/mesures.test.js` (ou `npm test`). `tests/trames.txt` : phrases réelles du Vulcan, positions remplacées par 48° N 3° O.

## Commandes
- Tests : `npm test`.
- iPhone : `npm install`, puis `npm run moteur && npx cap sync ios` après chaque modification de `www/` ou du simulateur, puis `npx cap open ios` (ou `xcodebuild` puis `xcrun devicectl device install app`). Si l'appli refuse de s'ouvrir après installation : Réglages › Général › VPN et gestion de l'appareil › Vérifier l'app, avec internet (pas sur le Wi-Fi du Vulcan). Signature : équipe personnelle de Jérémie (identifiant Apple gratuit, profil valable 7 jours).

## Le bord
- B&G Vulcan 7R, logiciel 22.3. NMEA 0183 via le Wi-Fi : point d'accès du Vulcan 192.168.76.1, TCP 10110 (vérifié avec NMEAconnect le 25/10/2026). Phrases : RMC GGA GLL VTG HDG VHW VLW DPT DBT MTW MWD MWV(T) XDR(heel, trim, airtemp, baro) ZDA, AIS. Pas de RSA (angle de barre) ni de MWV « R » vus.
- À quai : eau 37,1 °C, assiette +6,3° et gîte −3,1° suspectes (étalonnages à faire sur le Vulcan) ; loch 3,6 % sous le GPS en cumul.
- Connecté au point d'accès du Vulcan, l'iPhone perd internet : piste = le Vulcan rejoint le partage de connexion de l'iPhone (adresse 172.20.10.x), à essayer.

## Pilotage
Feuille de route, décisions et passations : `../simulateur-voile_v0/docs/pilotage/` (dépôt privé, cloné à côté). Commencer chaque session par la passation la plus récente.

## Où en est le projet (26/10/2026)
- V0.1 web : trace GPS, carte, journal, cumul de saison, GPX.
- Carte (25/10) : carte littorale SHOM/IGN de la Géoplateforme (`GEOGRAPHICALGRIDSYSTEMS.COASTALMAPS`, sans clé, niveaux 6 à 16, « non destinée à la navigation », licence non vérifiée), OSM dessous hors couverture ; OpenSeaMap retiré (doublon, secteurs de feux encombrants). Jérémie n'est « pas convaincu encore » : à retravailler.
- V0.2 : appli iPhone (Capacitor) avec lecture du B&G, instruments, échantillon toutes les 5 s pendant l'enregistrement, export CSV. Compilée et installée sur l'iPhone 15 Pro le 25/10/2026 : GPS natif vérifié (autorisation, positions chaque seconde) ; lecture du B&G à vérifier à bord.
- V0.2.3 : onglet « En mer » renommé « Trace » (demande de Jérémie), mesures compactes et repliables, légende par appui long sur chaque mesure.
- V0.3 (25/10) : écran Réglages (maquette 3) : vent du B&G, sinon Open-Meteo corrigeable ; cap du B&G, sinon route fond, ou choisi aux boutons ; moteur `PHY` (optimum, sensibilités, prochain ris ou génois roulé). Vent lissé (≈ 6 s) et arrondi (1 nd, 5°) pour le calcul. Pas encore fait : mode nuit, plein écran. Testé au navigateur avec un faux B&G ; à essayer à bord.
- Plein écran 3D (25/10) : bouton dans l'en-tête de Réglages ; `outillage/bateau.py` (lancé par `moteur.sh`) fait de `simulateur.html` une vue seule (`www/moteur/bateau.html`, Three.js local dans `www/moteur/three/`, ignorés par Git) ; l'appli lui envoie TWS, TWD, TWA (pilote du simulateur en mode vent, bateau posé au cap TWD − TWA) et le ris ou le génois choisis ; réglages auto du simulateur. Informations par-dessus : TWS · TWA, gîte (B&G, sinon modèle), STW, max théorique et écart. La vue 3D n'est chargée que pendant l'affichage.
- Réglages (25/10) : curseurs modifiables, toucher = manuel ; « au mieux » (tout en auto) et cadre « Avec tes réglages » (vitesse, gîte, barre) séparés. Icône A22 (`design/icone/`).
- V0.4.1-V0.4.2 (26/10) : caméra au doigt dans la vue 3D (glisser, pincer ; appui court pour les informations) ; chaque réglage passé en manuel est repris par la vue 3D.
- V0.5 (26/10) : vitesses en « nd » ; conseils pratiques (choquer, border, enrouler…, idéal théorique et gain possible en gris) ; alerte de départ au lof (dès 20° de gîte ou 14° de barre en rafale, probable au-delà de 25° ou 20°) ; gîte en direct avec le B&G (rafale = vent au-dessus du vent lissé, recalage ≈ 6 s, à ajuster avec les enregistrements), sinon au vent moyen et dans la rafale annoncée ; ligne TWS · Rafales · Mer en évidence ; écran Trace personnalisable comme l'écran d'accueil de l'iPhone (`www/mesures.js` : catalogue, ordre gardé dans `localStorage` « mesures-trace » ; appui long ≈ 1 s, glisser, « − », « + Ajouter »).
- V0.5.1 (26/10) : vue 3D limitée à 30 images/s (`outillage/bateau.py`, `#ips=60` pour lever la limite) ; diagnostic n° 3 : 30 images/s tenues sur toute la série.
- Diagnostic du rendu 3D : `DIAG3D = true` dans `www/reglages.js` (vue avec `#diag=1`, essais chronométrés dans `outillage/bateau.py`). Résultats iPhone du 26/10 dans la passation.
- Suite, dans l'ordre validé par Jérémie : journal enrichi ; partage avec les proches (Supabase envisagé ; Anne-Laure sur Android suit en web).
- Documents de conception : `docs/notes/version-navigation.md` du dépôt privé du simulateur (`T0staki/simulateur-voile_v0`, avec son propre CLAUDE.md : préférences de Jérémie, contexte, historique complet). Pour travailler sur les deux, cloner les deux dépôts côte à côte dans un même dossier et lancer Claude Code dans ce dossier.
