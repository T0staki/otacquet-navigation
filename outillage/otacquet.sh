#!/bin/bash
# Compile l'appli « O'Tacquet » (iPhone de Jérémie), avec les notifications du carnet de bord (droit « aps-environment »,
# réservé à O'Tacquet : Bord n'en reçoit pas). Signature : équipe 56737PA3L2 (compte développeur payant).
# Usage : bash outillage/otacquet.sh            → compile (Debug)
#         bash outillage/otacquet.sh <UDID>     → compile et installe sur l'iPhone branché (xcrun devicectl list devices)
set -e
NAV="$(cd "$(dirname "$0")/.." && pwd)"
cd "$NAV"
bash outillage/moteur.sh
npx cap sync ios >/dev/null
cd ios/App
xcodebuild -project App.xcodeproj -scheme App -configuration Debug -destination 'generic/platform=iOS' -derivedDataPath "$NAV/ios/build-otacquet" \
  -allowProvisioningUpdates DEVELOPMENT_TEAM=56737PA3L2 OT_DROITS=App/App.entitlements build | grep -E "BUILD|error:" | tail -3
APP="$NAV/ios/build-otacquet/Build/Products/Debug-iphoneos/App.app"
echo "Appli : $APP"
[ -n "$1" ] && xcrun devicectl device install app --device "$1" "$APP"
