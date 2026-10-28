// Content-Security-Policy for every page. Scripts run only when they carry this request's nonce (Next.js
// adds it to its own scripts) or are loaded by such a script ('strict-dynamic': the DigiLocker SDK). An
// injected <script> or inline event handler therefore never runs. Styles stay 'unsafe-inline' because
// React style attributes need it; styles cannot run code.

type CspOptions = { nonce: string; apiOrigin?: string | undefined; isDev?: boolean };

export const apiOriginFrom = (apiUrl: string | undefined) => {
  try {
    return apiUrl ? new URL(apiUrl).origin : '';
  } catch {
    return '';
  }
};

export const buildContentSecurityPolicy = ({ nonce, apiOrigin = '', isDev = false }: CspOptions) => {
  const api = apiOrigin ? ` ${apiOrigin}` : '';
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https:${api}`,
    `media-src 'self' data: blob: https:${api}`,
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src 'self' blob: data: https: wss:${api}${isDev ? ' ws:' : ''}`,
    // Document previews (Drive, PDFs as blob URLs) and the DigiLocker consent window.
    `frame-src 'self' blob: data: https:${api}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ];
  return directives.join('; ');
};
