#!/bin/bash
# Copie le moteur du simulateur (objet PHY et données des bateaux, dépôt privé voisin simulateur-voile_v0) dans www/moteur/,
# pour l'appli iPhone seulement. www/moteur/ est dans .gitignore : le moteur n'est jamais enregistré dans ce dépôt public
# ni publié sur le site. À lancer avant « npx cap sync ios » (npm run ios le fait).
set -e
NAV="$(cd "$(dirname "$0")/.." && pwd)"
SIMU="${SIMU_REPO:-$NAV/../simulateur-voile_v0}"
[ -f "$SIMU/simulateur.html" ] || { echo "Dépôt du simulateur introuvable : $SIMU (cloner T0staki/simulateur-voile_v0 à côté, ou définir SIMU_REPO)"; exit 1; }
TMP="$(mktemp -d)"
python3 "$SIMU/outillage/eng.py" "$SIMU/simulateur.html" "$TMP/engine.js" >/dev/null
VERSION="$(cd "$SIMU" && git log -1 --format='%h %s' 2>/dev/null | cut -c1-80)"
mkdir -p "$NAV/www/moteur"
{
  echo "// Moteur du simulateur (dépôt privé simulateur-voile_v0, $VERSION), généré par outillage/moteur.sh : ne pas publier."
  echo "(function(){const module={};"
  cat "$TMP/engine.js"
  echo ";window.OTMoteur={version:$(printf '%s' "$VERSION" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))'),make:module.exports,geo:"
  cat "$SIMU/outillage/geo.json"
  echo "};})();"
} > "$NAV/www/moteur/moteur.js"
# vue 3D plein écran (simulateur sans son interface) et Three.js local, installé par installer_mac.sh du simulateur
SIM="${SIMU_SIM:-$NAV/../sim}"
python3 "$NAV/outillage/bateau.py" "$SIMU/simulateur.html" "$NAV/www/moteur/bateau.html"
mkdir -p "$NAV/www/moteur/three"
cp "$SIM/t186/node_modules/three/build/three.module.js" "$SIM/t186/node_modules/three/build/three.core.js" "$SIM/t/node_modules/three/build/three.min.js" "$NAV/www/moteur/three/"
rm -rf "$TMP"
echo "Moteur copié : www/moteur/moteur.js et bateau.html ($VERSION)"
