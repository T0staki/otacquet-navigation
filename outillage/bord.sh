#!/bin/bash
# Compile l'appli « O'Tacquet Bord » (iPhone du père de Jérémie) : même code que O'Tacquet, en mode « bord »
# (Réglages sans vue 3D, Trace, envoi des données en un geste), nom et identifiant à part pour cohabiter avec O'Tacquet.
# Usage : bash outillage/bord.sh            → compile (Debug, signature de l'équipe personnelle)
#         bash outillage/bord.sh <UDID>     → compile et installe sur l'iPhone branché (xcrun devicectl list devices)
# Après, relancer « npm run moteur && npx cap sync ios » avant de recompiler O'Tacquet (le mode est écrit dans www/moteur/mode.js).
set -e
NAV="$(cd "$(dirname "$0")/.." && pwd)"
cd "$NAV"
OT_MODE=bord bash outillage/moteur.sh
npx cap sync ios >/dev/null
cd ios/App
xcodebuild -project App.xcodeproj -scheme App -configuration Debug -destination 'generic/platform=iOS' -derivedDataPath "$NAV/ios/build-bord" \
  -allowProvisioningUpdates OT_ID=io.github.t0staki.otacquet.bord OT_NOM_AFFICHE="O'Tacquet Bord" build | grep -E "BUILD|error:" | tail -3
APP="$NAV/ios/build-bord/Build/Products/Debug-iphoneos/App.app"
echo "Appli : $APP"
[ -n "$1" ] && xcrun devicectl device install app --device "$1" "$APP"
