import { WEB_APP_URL, API_BASE_URL } from "@env";

const DEFAULT_URL = "https://jcb-exchange-frontend.vercel.app";

export function getWebAppUrl() {
  return (typeof WEB_APP_URL === "string" && WEB_APP_URL.trim() !== "")
    ? WEB_APP_URL.trim()
    : DEFAULT_URL;
}

export function getApiBaseUrl() {
  return (typeof API_BASE_URL === "string" && API_BASE_URL.trim() !== "")
    ? API_BASE_URL.trim()
    : DEFAULT_URL;
}

export function getReleaseWebUrl() {
  return getWebAppUrl();
}
