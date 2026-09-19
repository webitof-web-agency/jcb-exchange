const fs = require('fs');

const file = 'admin-portal/src/app/(admin)/superadmin/settings/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. SettingsResponse
content = content.replace(
  "  companyInvoice?: CompanyInvoiceFormState;\n};",
  "  companyInvoice?: CompanyInvoiceFormState;\n  mobileApp?: {\n    playStoreLink: string | null;\n    appStoreLink: string | null;\n  };\n};"
);

// 2. MobileAppFormState
content = content.replace(
  "type MobileOtpFormState = {",
  "type MobileAppFormState = {\n  playStoreLink: string;\n  appStoreLink: string;\n};\n\ntype MobileOtpFormState = {"
);

// 3. activeTab type
content = content.replace(
  "useState<'security' | 'leadRouting' | 'homepage' | 'payments' | 'invoice'>('security');",
  "useState<'security' | 'leadRouting' | 'homepage' | 'payments' | 'invoice' | 'mobileApp'>('security');"
);

// 4. state variables
content = content.replace(
  "const [emailOtpSaving, setEmailOtpSaving] = useState(false);",
  "const [emailOtpSaving, setEmailOtpSaving] = useState(false);\n  const [mobileAppForm, setMobileAppForm] = useState<MobileAppFormState>({\n    playStoreLink: '',\n    appStoreLink: '',\n  });\n  const [mobileAppSaving, setMobileAppSaving] = useState(false);"
);

// 5. loadSettings
content = content.replace(
  "      if (response.data.companyInvoice) {",
  "      setMobileAppForm({\n        playStoreLink: response.data.mobileApp?.playStoreLink || '',\n        appStoreLink: response.data.mobileApp?.appStoreLink || '',\n      });\n      if (response.data.companyInvoice) {"
);

// 6. submit handlers
content = content.replace(
  "  const rtgsReady = Boolean(",
  `  const handleMobileAppSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMobileAppSaving(true);

    try {
      const response = await api.patch<{
        message: string;
        mobileApp: SettingsResponse['mobileApp'];
      }>('/superadmin/settings', {
        mobileApp: {
          playStoreLink: mobileAppForm.playStoreLink,
          appStoreLink: mobileAppForm.appStoreLink,
        },
      });

      setMobileAppForm({
        playStoreLink: response.data.mobileApp?.playStoreLink || '',
        appStoreLink: response.data.mobileApp?.appStoreLink || '',
      });
      toast.success(response.data.message);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to save mobile app settings.'));
    } finally {
      setMobileAppSaving(false);
    }
  };

  const updateMobileAppForm = (nextState: Partial<MobileAppFormState>) => {
    setMobileAppForm((currentState) => ({
      ...currentState,
      ...nextState,
    }));
  };

  const rtgsReady = Boolean(`
);

// 7. Tab button
content = content.replace(
  "              <FileText className=\"h-4 w-4\" />\n              Invoice & GST\n            </button>",
  `              <FileText className="h-4 w-4" />
              Invoice & GST
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('mobileApp')}
              className={\`flex items-center gap-3 rounded-lg border-l-4 px-3 py-2.5 text-sm font-semibold transition-colors \${
                activeTab === 'mobileApp'
                  ? 'border-yellow-400 bg-yellow-50 text-yellow-800'
                  : 'border-transparent text-gray-600 hover:bg-gray-50'
              }\`}
            >
              <Phone className="h-4 w-4" />
              Mobile App
            </button>`
);

// 8. Tab content
const tabContent = `
          {activeTab === 'mobileApp' ? (
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Mobile Settings</p>
                <h3 className="mt-1 text-xl font-bold text-gray-900">Mobile App Links</h3>
              </div>
              <form onSubmit={handleMobileAppSubmit} className="space-y-6">
                <div className="grid gap-5 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-gray-700">Play Store Link</span>
                    <input
                      type="url"
                      value={mobileAppForm.playStoreLink}
                      onChange={(e) => updateMobileAppForm({ playStoreLink: e.target.value })}
                      placeholder="https://play.google.com/store/apps/details?id=..."
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-gray-700">App Store Link</span>
                    <input
                      type="url"
                      value={mobileAppForm.appStoreLink}
                      onChange={(e) => updateMobileAppForm({ appStoreLink: e.target.value })}
                      placeholder="https://apps.apple.com/app/..."
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                    />
                  </label>
                </div>
                <div className="flex justify-end border-t border-gray-100 pt-2">
                  <button
                    type="submit"
                    disabled={mobileAppSaving}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#FFC107] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[#E5AD06] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    {mobileAppSaving ? 'Saving...' : 'Save App Links'}
                  </button>
                </div>
              </form>
            </section>
          ) : null}
`;
content = content.replace(
  "          {activeTab === 'invoice' ? (",
  tabContent + "\n          {activeTab === 'invoice' ? ("
);

fs.writeFileSync(file, content);
console.log('Patched', file);
