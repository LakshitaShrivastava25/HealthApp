#!/usr/bin/env bash
# Build a signed App Store .ipa on this Mac — the local equivalent of
# `flutter build ipa`, no EAS needed.
#
#   ./scripts/build-ipa.sh <APPLE_TEAM_ID>
#
# Needs Xcode with an Apple Developer (not Personal Team) account signed in
# under Xcode → Settings → Accounts. Signing certificates and the App Store
# provisioning profile are created automatically. Output: build/ipa/CuraPath.ipa
# — upload it with the Transporter app or Xcode → Window → Organizer.
#
# Bump "ios.buildNumber" in app.json before every new upload.
#
# NOTE: this script and the EAS pipeline (.eas/workflows/release-ios.yml) count
# build numbers separately. EAS owns its own counter now that eas.json sets
# appVersionSource "remote", and ignores app.json. So if you release through
# EAS and then build here, this script can produce a number EAS has already
# used, and App Store Connect will reject the upload. Pick one route per
# release — EAS for releases, this script for a local build or when EAS is
# unavailable — and if you do use both, check the last build number in App
# Store Connect first.
set -euo pipefail

TEAM_ID="${1:?usage: $0 <APPLE_TEAM_ID>}"
cd "$(dirname "$0")/.."

export EXPO_PUBLIC_USE_PRODUCTION_API=true
export EXPO_PUBLIC_API_URL_PROD=https://healthapp-backend-li7g.onrender.com/api

# ios/ is generated from app.json and gitignored; regenerate it so config
# changes (version, permissions, icons) always make it into the build.
npx expo prebuild -p ios --clean --no-install
(cd ios && pod install)

ARCHIVE=build/CuraPath.xcarchive
rm -rf "$ARCHIVE" build/ipa
mkdir -p build

xcodebuild -workspace ios/CuraPath.xcworkspace -scheme CuraPath \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$TEAM_ID" CODE_SIGN_STYLE=Automatic \
  archive

cat > build/ExportOptions.plist <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>${TEAM_ID}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
</dict>
</plist>
PLIST

xcodebuild -exportArchive -archivePath "$ARCHIVE" \
  -exportOptionsPlist build/ExportOptions.plist \
  -exportPath build/ipa -allowProvisioningUpdates

# Also drop a copy where Xcode → Window → Organizer looks, so the build can
# be uploaded from there instead of with the .ipa file.
ORGANIZER=~/Library/Developer/Xcode/Archives/$(date +%Y-%m-%d)
mkdir -p "$ORGANIZER"
cp -R "$ARCHIVE" "$ORGANIZER/CuraPath $(date '+%d-%m-%Y, %H.%M').xcarchive"

echo "IPA ready: $(pwd)/build/ipa/CuraPath.ipa"
echo "Archive also in Xcode → Window → Organizer"
