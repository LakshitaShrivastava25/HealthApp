# Release pipeline (iOS → TestFlight)

Tag a commit, and EAS builds the app and uploads it to TestFlight.

```bash
git tag ios-v1.0.8
git push origin ios-v1.0.8
```

Nothing else triggers a release. Ordinary pushes to `main` do not build — this
is a monorepo and most commits never touch `mobile/`.

The pieces: [`workflows/release-ios.yml`](workflows/release-ios.yml) (the
trigger and the two jobs) and [`../eas.json`](../eas.json) (build profiles,
versioning, and where to submit).

## One-time setup

Until all four are done the tag will fire and the build will fail.

### 1. Expo account — done

The project is **`@bc_expo/healthnow-mobile`** (`expo.owner` and
`extra.eas.projectId` in `app.json`). Sign in with:

```bash
npx eas-cli login
npx eas-cli whoami     # bc_expo
```

It was moved here on 19 Oct 2026 from `ayushdev14`, a personal account nobody
could sign into any more. Two consequences of that move:

- **iOS lost nothing.** Signing comes from the Apple Developer account
  (team `53XKYJ62P9`), not from Expo, so EAS regenerates the certificate and
  profile against the same team. The bundle id is unchanged, so App Store
  Connect still sees the same app.
- **The Android upload keystore did not come across** — it is still on the old
  account and was never backed up locally. See *Android* at the end.

`bc_expo` is a personal account, which is exactly the shape of the problem
that caused this. The organization `bcexpos-team` would be safer, but Expo
only links organization projects to *GitHub organization* repos, and
`LakshitaShrivastava25/HealthApp` is a personal repo. Move both together later
if you want that. In the meantime, back the Android keystore up the moment it
exists:

```bash
npx eas-cli credentials --platform android   # → download the keystore, store it somewhere safe
```

### 2. Connect the GitHub repo

On expo.dev → the project → GitHub settings: install the Expo GitHub App and
select `LakshitaShrivastava25/HealthApp`.

**Set the base directory to `mobile`.** The Expo project is not at the repo
root, and without this EAS looks for `app.json` in the wrong place.

### 3. App Store Connect API key

So the upload can authenticate without anyone typing an Apple password.

App Store Connect → Users and Access → Integrations → App Store Connect API →
generate a key with the **App Manager** role. Apple lets you download the
`.p8` **once**. Then hand it to EAS:

```bash
npx eas-cli credentials --platform ios
# → production → App Store Connect: Manage your API Key
# → Set up your project to use an API Key for EAS Submit
```

### 4. Initialise the build number

`eas.json` sets `appVersionSource: "remote"`, so EAS keeps the build number on
its servers and increments it per build. Point it at reality first, or the
first EAS build will collide with what is already uploaded:

```bash
npx eas-cli build:version:set   # choose iOS, enter the last build number
                                # that reached App Store Connect
```

Build **2** was uploaded manually on 12 Oct 2026, so the answer is `2` unless
something newer has gone up since. EAS then issues 3, 4, 5…

After this, `ios.buildNumber` in `app.json` is ignored for EAS builds. It is
left in place only because `scripts/build-ipa.sh` still reads it.

## Checking it works

```bash
npx eas-cli workflow:run .eas/workflows/release-ios.yml
```

That runs the same jobs without needing a tag — worth doing once before you
rely on the trigger.

## Two routes, one counter

`scripts/build-ipa.sh` builds and signs an IPA on your own Mac. It is the
fallback for when EAS is unavailable, and it reads `app.json` for the build
number, while EAS uses its own. Using both without checking App Store Connect
will eventually produce a duplicate build number and a rejected upload.

## Android — blocked until the upload key is sorted

CuraPath is already live on Google Play, signed with an upload key held by the
**old** `ayushdev14` EAS account. A build from this account gets a brand-new
keystore, and Play rejects a bundle signed with an unrecognised upload key.

Two ways out, in order of preference:

1. **Recover the old keystore.** If anyone regains access to `ayushdev14`, run
   `eas credentials --platform android` there and download it, then upload it
   to this account. Nothing else changes.
2. **Reset the upload key with Google.** Play Console → the app → Setup → App
   signing → request an upload key reset. Works when Play App Signing is on
   (the default) and takes a couple of days. The app's identity on the store
   is unaffected — only the key you sign uploads with changes.

Until one of those is done, do not add Android jobs to the workflow. iOS is
entirely independent and can ship now.

Once it is sorted, the same `production` profile already builds an app bundle,
so Android is a second pair of jobs in the workflow. **Never** build an Android
release outside EAS — a locally-signed bundle uses a different key and Play
rejects it.
