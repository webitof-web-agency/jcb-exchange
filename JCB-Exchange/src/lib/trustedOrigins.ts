// Which pages the mobile shell treats as "ours". Only these pages get the FCM bridge script injected
// (it carries the device push token), and plain http:// is only allowed in development builds.

function hostOf(url: string): string {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url.trim());
  if (!match) {
    return '';
  }
  // Drop credentials and port.
  return match[1].replace(/^.*@/, '').replace(/:\d+$/, '').toLowerCase();
}

// "www.jcbexchange.com" and "api.jcbexchange.com" both trust "jcbexchange.com" and its subdomains.
function baseDomainOf(host: string): string {
  if (!host || /^\d+(\.\d+){3}$/.test(host) || host === 'localhost') {
    return host;
  }
  const parts = host.split('.');
  return parts.length <= 2 ? host : parts.slice(-2).join('.');
}

export function buildTrustedHosts(urls: string[]): string[] {
  const hosts = new Set<string>();
  for (const url of urls) {
    const host = hostOf(url || '');
    if (host) {
      hosts.add(baseDomainOf(host));
    }
  }
  return Array.from(hosts);
}

export function isTrustedAppUrl(url: string, trustedHosts: string[], allowInsecure = false): boolean {
  const value = (url || '').trim();
  const isHttps = /^https:\/\//i.test(value);
  const isHttp = /^http:\/\//i.test(value);
  if (!isHttps && !(allowInsecure && isHttp)) {
    return false;
  }
  const host = hostOf(value);
  return trustedHosts.some((trusted) => host === trusted || host.endsWith(`.${trusted}`));
}

// Top-level navigation inside the WebView: https pages stay in the app (payment gateways and bank pages
// redirect through other domains), plain http only in development. Everything else goes to the OS.
export function shouldLoadInWebView(url: string, allowInsecure = false): boolean {
  const value = (url || '').trim();
  if (value === 'about:blank' || /^https:\/\//i.test(value)) {
    return true;
  }
  return allowInsecure && /^http:\/\//i.test(value);
}
