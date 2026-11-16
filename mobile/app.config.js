const fs = require('fs');
const path = require('path');

const { withXcodeProject } = require('@expo/config-plugins');

/**
 * Extends app.json. Android push needs Firebase's google-services.json
 * (Firebase project "Curapath", Android app com.bctpvtltd.curapath). It is
 * kept out of git (it carries a Google API key that GitHub's secret
 * scanning blocks) and reaches the build one of two ways:
 *
 *   1. An EAS file environment variable named GOOGLE_SERVICES_JSON — EAS
 *      puts the uploaded file on disk and passes its path here. Works from
 *      any machine.
 *   2. mobile/google-services.json on this machine — .easignore keeps it in
 *      the build upload even though git ignores it.
 *
 * Without either the app still builds and runs; on-device medicine
 * reminders still work, only server-sent push is unavailable.
 */

/**
 * The Apple Developer team that signs iOS builds.
 *
 * `expo prebuild` regenerates ios/ from scratch, and the generated Xcode
 * project has no signing team — so opening it in Xcode gives "Signing for
 * CuraPath requires a development team" and every GUI build fails. The
 * command-line build passes DEVELOPMENT_TEAM itself and was unaffected,
 * which is exactly why this stayed hidden until someone pressed Build.
 *
 * Written here rather than into ios/ because ios/ is gitignored build
 * output and is wiped on the next prebuild. A team id is not a secret —
 * it ships inside every signed app — but APPLE_TEAM_ID still overrides it
 * so a different account can build without editing this file.
 */
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID || '53XKYJ62P9';

function withSigningTeam(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const buildConfigs = project.pbxXCBuildConfigurationSection();

    for (const key of Object.keys(buildConfigs)) {
      const settings = buildConfigs[key].buildSettings;
      // Entries are a mix of objects and comment strings, and the Pods
      // project's configurations have no PRODUCT_NAME — only the app
      // target's should be signed.
      if (!settings || settings.PRODUCT_NAME === undefined) continue;
      settings.DEVELOPMENT_TEAM = APPLE_TEAM_ID;
      settings.CODE_SIGN_STYLE = 'Automatic';
    }

    // Xcode reads the team from the target attributes too; without this the
    // Signing & Capabilities tab still shows "None" even though builds pass.
    const firstProject = project.getFirstProject().firstProject;
    const targetAttributes = firstProject.attributes?.TargetAttributes;
    if (targetAttributes) {
      for (const targetId of Object.keys(targetAttributes)) {
        targetAttributes[targetId].DevelopmentTeam = APPLE_TEAM_ID;
      }
    }

    return cfg;
  });
}

module.exports = ({ config }) => {
  const local = path.join(__dirname, 'google-services.json');
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(local) ? './google-services.json' : null);
  if (googleServicesFile) {
    config.android = { ...config.android, googleServicesFile };
  }
  return withSigningTeam(config);
};
