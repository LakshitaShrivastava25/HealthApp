const fs = require('fs');
const path = require('path');

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
module.exports = ({ config }) => {
  const local = path.join(__dirname, 'google-services.json');
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(local) ? './google-services.json' : null);
  if (googleServicesFile) {
    config.android = { ...config.android, googleServicesFile };
  }
  return config;
};
