// @ts-ignore
import { WEB_APP_URL } from '@env';

const DEFAULT_WEB_URL = 'https://jcb-exchange-frontend.vercel.app';

export function getWebAppUrl() {
  return (typeof WEB_APP_URL === 'string' && WEB_APP_URL.trim() !== '') 
    ? WEB_APP_URL.trim() 
    : DEFAULT_WEB_URL;
}

export function getWebAppUrlHint() {
  return 'Using domain: ' + getWebAppUrl();
}

export const APP_TITLE = 'JCB Exchange';

