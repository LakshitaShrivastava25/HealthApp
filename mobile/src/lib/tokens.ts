import * as SecureStore from 'expo-secure-store';

/**
 * JWTs live in the OS keystore (Keychain / Android Keystore), not in
 * AsyncStorage. The web app uses localStorage because that is all a browser
 * offers; a native app has somewhere genuinely protected to put a
 * credential that unlocks someone's medical history, so it uses it.
 *
 * One session for the whole app, unlike the web build's three separate
 * token stores. The web app needs three because its portals are three
 * routes in one origin that a person might have open at once. A phone app
 * is one session for one person, and their role decides what they see.
 */

const ACCESS_KEY = 'healthnow_access_token';
const REFRESH_KEY = 'healthnow_refresh_token';
const API_OVERRIDE_KEY = 'healthnow_api_base_url';

export async function getAccessToken() {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

export async function getRefreshToken() {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

export async function setTokens(access: string, refresh: string) {
  await SecureStore.setItemAsync(ACCESS_KEY, access);
  await SecureStore.setItemAsync(REFRESH_KEY, refresh);
}

export async function setAccessToken(access: string) {
  await SecureStore.setItemAsync(ACCESS_KEY, access);
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

export async function getStoredApiBaseUrl() {
  return SecureStore.getItemAsync(API_OVERRIDE_KEY);
}

export async function storeApiBaseUrl(url: string | null) {
  if (url) await SecureStore.setItemAsync(API_OVERRIDE_KEY, url);
  else await SecureStore.deleteItemAsync(API_OVERRIDE_KEY);
}
