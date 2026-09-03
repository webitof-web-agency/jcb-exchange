import { Platform } from 'react-native';

const RELEASE_WEB_URL = 'https://jcb-exchange-frontend.vercel.app';

export function getWebAppUrl() {
  return RELEASE_WEB_URL;
}

export function getWebAppUrlHint() {
  return 'Using live domain: ' + RELEASE_WEB_URL;
}

export const APP_TITLE = 'JCB Exchange';

