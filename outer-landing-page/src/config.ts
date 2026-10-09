// The main CuraPath web app.
export const MAIN_APP_URL = 'https://web.curapath.in'

// Where every "Visit Web App" button goes: straight to sign-in. The journey is
// landing page (this site) -> sign-in -> the app; someone already signed in
// is taken on to their dashboard from there.
export const LOGIN_URL = `${MAIN_APP_URL}/login`

// Google Play Store listing for the Android app (package com.bctpvtltd.curapath).
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.bctpvtltd.curapath'

// Legal pages live on the main app so both sites share one copy.
export const PRIVACY_URL = `${MAIN_APP_URL}/privacy`
export const TERMS_URL = `${MAIN_APP_URL}/terms`
export const DELETE_ACCOUNT_URL = `${MAIN_APP_URL}/delete-account`
