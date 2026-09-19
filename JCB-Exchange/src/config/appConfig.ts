import {
  API_BASE_URL,
  BUSINESS_EMAIL,
  SUPPORT_EMAIL,
  WEB_APP_URL,
  WHATSAPP_SUPPORT_NUMBER,
} from '@env';
import { getDevApiUrl, getDevWebUrl } from './devNetwork';

function normalizeText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

function normalizeUrl(value: unknown, fallback = '') {
  const normalized = normalizeText(value, fallback);
  return normalized.replace(/\/+$/, '');
}

function resolveAppUrl(value: unknown, devFallback: string) {
  const envValue = normalizeUrl(value);
  if (envValue) {
    return envValue;
  }

  return __DEV__ ? normalizeUrl(devFallback) : '';
}

function normalizePhoneNumber(value: unknown) {
  return normalizeText(value).replace(/[^\d+]/g, '');
}

export function getWebAppUrl() {
  return resolveAppUrl(WEB_APP_URL, getDevWebUrl());
}

export function getApiBaseUrl() {
  return resolveAppUrl(API_BASE_URL, getDevApiUrl());
}

export function getWebAppUrlHint() {
  return `Using domain: ${getWebAppUrl()}`;
}

export function getReleaseWebUrl() {
  return getWebAppUrl();
}

export function getSupportEmail() {
  return normalizeText(SUPPORT_EMAIL);
}

export function getBusinessEmail() {
  return normalizeText(BUSINESS_EMAIL);
}

export function getWhatsappSupportNumber() {
  return normalizePhoneNumber(WHATSAPP_SUPPORT_NUMBER);
}

export function getSupportMailtoUrl(email: string) {
  return email ? `mailto:${email}` : '';
}

export function getWhatsappSupportUrl() {
  const phoneNumber = getWhatsappSupportNumber();
  return phoneNumber ? `whatsapp://send?phone=${phoneNumber}` : '';
}

export const RELEASE_WEB_URL = getWebAppUrl();
export const RELEASE_API_URL = getApiBaseUrl();
export const APP_TITLE = 'JCB Exchange';
