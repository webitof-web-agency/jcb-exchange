import { NativeModules, Platform } from 'react-native';

const DEV_WEB_PORT = 3000;
const DEV_API_PORT = 5000;
const DEV_LAN_HOST = '10.0.2.2';

export const RELEASE_WEB_URL = 'https://pucindia.com';
export const RELEASE_API_URL = 'https://api.pucindia.com';

function parseHost(scriptUrl) {
  if (!scriptUrl) {
    return '';
  }

  try {
    const normalizedUrl = scriptUrl.includes('://') ? scriptUrl : `http://${scriptUrl}`;
    return new URL(normalizedUrl).hostname;
  } catch {
    const match = scriptUrl.match(/^https?:\/\/([^/:]+)/i);
    return match?.[1] || '';
  }
}

export function getDevHost() {
  const scriptUrl = NativeModules?.SourceCode?.scriptURL || '';
  const host = parseHost(scriptUrl);

  if (
    host &&
    host !== 'localhost' &&
    host !== '127.0.0.1' &&
    host !== '10.0.2.2'
  ) {
    return host;
  }

  return Platform.OS === 'android' ? DEV_LAN_HOST : 'localhost';
}

export function getDevWebUrl() {
  return `http://${getDevHost()}:${DEV_WEB_PORT}`;
}

export function getDevApiUrl() {
  return `http://${getDevHost()}:${DEV_API_PORT}`;
}
