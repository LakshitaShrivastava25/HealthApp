const fs = require('fs');
const path = require('path');

/**
 * Extends app.json. Android push needs Firebase: once google-services.json
 * (Firebase console → Project settings → Android app com.healthnow.mobile)
 * is placed next to this file, builds pick it up automatically. Without it
 * the app still builds and runs; on-device medicine reminders still work,
 * only server-sent push is unavailable.
 */
module.exports = ({ config }) => {
  const googleServices = path.join(__dirname, 'google-services.json');
  if (fs.existsSync(googleServices)) {
    config.android = { ...config.android, googleServicesFile: './google-services.json' };
  }
  return config;
};
