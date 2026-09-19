const fs = require('fs');

// Patch globals.css
let cssFile = 'frontend/src/app/globals.css';
let cssContent = fs.readFileSync(cssFile, 'utf8');

const remoteCss = `
/* Toast Notification High Z-Index Overrides */
.Toastify__toast-container,
.Toastify__toast-container--top-right,
.Toastify__toast-container--top-center,
.Toastify__toast-container--top-left,
.Toastify__toast-container--bottom-right,
.Toastify__toast-container--bottom-center,
.Toastify__toast-container--bottom-left {
  z-index: 999999 !important;
}

/* ── Brand Loader Ring Animation ── */
@keyframes brandSpin {
  0%   { stroke-dashoffset: 0; transform: rotate(0deg); }
  100% { stroke-dashoffset: 0; transform: rotate(360deg); }
}

@keyframes brandPulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.65; }
}

.brand-loader-text {
  animation: brandPulse 2s ease-in-out infinite;
}
`;

if (!cssContent.includes('.brand-loader-text')) {
  cssContent = cssContent + '\\n' + remoteCss;
  fs.writeFileSync(cssFile, cssContent);
  console.log('Patched globals.css');
}

// Patch layout.tsx
let layoutFile = 'frontend/src/app/layout.tsx';
let layoutContent = fs.readFileSync(layoutFile, 'utf8');

if (!layoutContent.includes('SITE_KEYWORDS')) {
  layoutContent = layoutContent.replace(
    "SITE_DESCRIPTION,",
    "SITE_DESCRIPTION,\n  SITE_KEYWORDS,"
  );
  layoutContent = layoutContent.replace(
    "description: SITE_DESCRIPTION,",
    "description: SITE_DESCRIPTION,\n    keywords: SITE_KEYWORDS,"
  );
}

if (!layoutContent.includes('__JCB_SITE_LOGO__')) {
  layoutContent = layoutContent.replace(
    "<html lang={locale} suppressHydrationWarning>\n      <body className=\"min-h-screen flex flex-col bg-gray-50 text-gray-900 antialiased pb-16 lg:pb-0\">",
    "<html lang={locale} suppressHydrationWarning>\n      <body className=\"min-h-screen flex flex-col bg-gray-50 text-gray-900 antialiased pb-16 lg:pb-0\">\n        {(branding.darkLogoUrl || branding.logoUrl) && (\n          <link rel=\"preload\" as=\"image\" href={branding.darkLogoUrl || branding.logoUrl || undefined} />\n        )}\n        <script\n          dangerouslySetInnerHTML={{ __html: `window.__JCB_SITE_LOGO__=\\${JSON.stringify({ logoUrl: branding.logoUrl, darkLogoUrl: branding.darkLogoUrl }).replace(/</g, '\\\\u003c')};` }}\n        />"
  );
}

// Keep the user's ToastContainer position (bottom-right) but update the zIndex like the remote did
layoutContent = layoutContent.replace(
  "<ToastContainer position=\"bottom-right\" />",
  "<ToastContainer position=\"bottom-right\" style={{ zIndex: 999999 }} />"
);

fs.writeFileSync(layoutFile, layoutContent);
console.log('Patched layout.tsx');
