import { buildTrustedHosts, isTrustedAppUrl, shouldLoadInWebView } from '../src/lib/trustedOrigins';

describe('trusted origins', () => {
  const hosts = buildTrustedHosts(['https://jcbexchange.com', 'https://api.jcbexchange.com']);

  it('trusts the app domain and its subdomains over https', () => {
    expect(hosts).toEqual(['jcbexchange.com']);
    expect(isTrustedAppUrl('https://jcbexchange.com/machines', hosts)).toBe(true);
    expect(isTrustedAppUrl('https://portal.jcbexchange.com/partner', hosts)).toBe(true);
  });

  it('rejects look-alike, foreign and insecure pages', () => {
    expect(isTrustedAppUrl('https://jcbexchange.com.evil.io/', hosts)).toBe(false);
    expect(isTrustedAppUrl('https://evil.io/?jcbexchange.com', hosts)).toBe(false);
    expect(isTrustedAppUrl('https://user@evil.io/', hosts)).toBe(false);
    expect(isTrustedAppUrl('http://jcbexchange.com/', hosts)).toBe(false);
    expect(isTrustedAppUrl('http://jcbexchange.com/', hosts, true)).toBe(true);
  });

  it('keeps https in the WebView and sends http out in release builds', () => {
    expect(shouldLoadInWebView('https://checkout.razorpay.com/x')).toBe(true);
    expect(shouldLoadInWebView('about:blank')).toBe(true);
    expect(shouldLoadInWebView('http://example.com/')).toBe(false);
    expect(shouldLoadInWebView('http://192.168.1.5:3000/', true)).toBe(true);
    expect(shouldLoadInWebView('tel:123')).toBe(false);
  });
});
