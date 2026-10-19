'use client';

import React, { useState } from 'react';
import PanCardTemplate, { PanCardData } from '@/components/pancard/PanCardTemplate';
import {
  CreditCard, RefreshCw, Printer, Copy, Check, Sparkles,
  User, Calendar, Hash, ShieldCheck, Code, Eye
} from 'lucide-react';

const PRESETS: Record<string, PanCardData> = {
  rohit: {
    panNumber: 'ABCDE1234F',
    name: 'ROHIT KUMAR',
    fatherName: 'SURESH KUMAR',
    dob: '15/08/1990',
    dateOfIssue: '20/05/2024',
    photoUrl: '/images/pancard/rohit-kumar.png',
    signatureUrl: '/images/pancard/rohit-signature.png',
    signatureText: 'Rohit Kumar',
  },
  priya: {
    panNumber: 'BNZPS8841M',
    name: 'PRIYA SHARMA',
    fatherName: 'RAMESH SHARMA',
    dob: '22/11/1994',
    dateOfIssue: '14/02/2023',
    photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&h=380&fit=crop&crop=faces',
    signatureText: 'Priya Sharma',
  },
  amit: {
    panNumber: 'CPDPA4920K',
    name: 'AMIT PATEL',
    fatherName: 'DINESH PATEL',
    dob: '05/03/1988',
    dateOfIssue: '11/09/2022',
    photoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&h=380&fit=crop&crop=faces',
    signatureText: 'Amit Patel',
  },
};

export default function PanCardPreviewPage() {
  const [formData, setFormData] = useState<PanCardData>(PRESETS.rohit);
  const [scale, setScale] = useState<number>(1.2);
  const [isSimulatingApi, setIsSimulatingApi] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');

  const handleInputChange = (field: keyof PanCardData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleLoadPreset = (key: keyof typeof PRESETS) => {
    setFormData(PRESETS[key]);
  };

  const handleSimulateApiFetch = () => {
    setIsSimulatingApi(true);
    setTimeout(() => {
      setFormData({
        panNumber: 'FGHIJ5678K',
        name: 'VIKRAM SINGH',
        fatherName: 'HARPAL SINGH',
        dob: '12/04/1992',
        dateOfIssue: '01/06/2024',
        photoUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=300&h=380&fit=crop&crop=faces',
        signatureText: 'Vikram Singh',
      });
      setIsSimulatingApi(false);
    }, 700);
  };

  const handlePrint = () => {
    window.print();
  };

  const sampleSnippet = `import PanCardTemplate from '@/components/pancard/PanCardTemplate';

// Example: Rendering PAN Card with dynamic API data
export default function UserVerificationView({ kycRecord }) {
  return (
    <PanCardTemplate
      data={{
        panNumber: kycRecord.pan,              // e.g. "${formData.panNumber}"
        name: kycRecord.fullName,              // e.g. "${formData.name}"
        fatherName: kycRecord.fatherName,      // e.g. "${formData.fatherName}"
        dob: kycRecord.dob,                    // e.g. "${formData.dob}"
        dateOfIssue: kycRecord.dateOfIssue,    // e.g. "${formData.dateOfIssue}"
        photoUrl: kycRecord.photoUrl,          // e.g. URL to avatar/photo
        signatureUrl: kycRecord.signatureUrl,  // e.g. URL to signature or text fallback
      }}
      scale={1.2}
      interactive={true}
    />
  );
}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(sampleSnippet);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900/80 px-6 py-4 backdrop-blur-md sticky top-0 z-30 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Indian PAN Card Template Studio
              </h1>
              <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                ID-1 Standard
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Reusable dynamic template for Income Tax Department PAN Card
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
          >
            <Printer className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Print Card</span>
          </button>

          <button
            type="button"
            onClick={copyToClipboard}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 transition"
          >
            {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Dynamic Data Inputs
              </h2>
              <p className="text-xs text-slate-400">
                Data changes reflect immediately on the PAN template
              </p>
            </div>
            <button
              type="button"
              onClick={handleSimulateApiFetch}
              disabled={isSimulatingApi}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 text-[11px] font-bold text-amber-400 hover:bg-amber-500/20 disabled:opacity-50 transition"
            >
              <RefreshCw className={`h-3 w-3 ${isSimulatingApi ? 'animate-spin' : ''}`} />
              <span>Simulate API</span>
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2">
              Quick Test Presets
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleLoadPreset('rohit')}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium border transition ${
                  formData.name === 'ROHIT KUMAR'
                    ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                    : 'border-slate-800 bg-slate-800/80 text-slate-400 hover:text-white'
                }`}
              >
                Rohit Kumar (Screenshot)
              </button>
              <button
                type="button"
                onClick={() => handleLoadPreset('priya')}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium border transition ${
                  formData.name === 'PRIYA SHARMA'
                    ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                    : 'border-slate-800 bg-slate-800/80 text-slate-400 hover:text-white'
                }`}
              >
                Priya Sharma
              </button>
              <button
                type="button"
                onClick={() => handleLoadPreset('amit')}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium border transition ${
                  formData.name === 'AMIT PATEL'
                    ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                    : 'border-slate-800 bg-slate-800/80 text-slate-400 hover:text-white'
                }`}
              >
                Amit Patel
              </button>
            </div>
          </div>

          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                PAN Number <span className="text-amber-400">*</span>
              </label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  maxLength={10}
                  value={formData.panNumber}
                  onChange={(e) => handleInputChange('panNumber', e.target.value.toUpperCase())}
                  placeholder="e.g. ABCDE1234F"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 pl-9 pr-3.5 py-2 text-sm font-mono font-bold text-white placeholder:text-slate-600 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Full Name <span className="text-amber-400">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    handleInputChange('name', e.target.value);
                    handleInputChange('signatureText', e.target.value);
                  }}
                  placeholder="e.g. ROHIT KUMAR"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 pl-9 pr-3.5 py-2 text-sm font-semibold uppercase text-white placeholder:text-slate-600 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Father&apos;s Name <span className="text-amber-400">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  value={formData.fatherName}
                  onChange={(e) => handleInputChange('fatherName', e.target.value)}
                  placeholder="e.g. SURESH KUMAR"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 pl-9 pr-3.5 py-2 text-sm font-semibold uppercase text-white placeholder:text-slate-600 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Date of Birth <span className="text-amber-400">*</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    value={formData.dob}
                    onChange={(e) => handleInputChange('dob', e.target.value)}
                    placeholder="DD/MM/YYYY"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/80 pl-9 pr-3.5 py-2 text-sm font-mono text-white placeholder:text-slate-600 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Date of Issue
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    value={formData.dateOfIssue}
                    onChange={(e) => handleInputChange('dateOfIssue', e.target.value)}
                    placeholder="DD/MM/YYYY"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/80 pl-9 pr-3.5 py-2 text-sm font-mono text-white placeholder:text-slate-600 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Photo URL
              </label>
              <input
                type="text"
                value={formData.photoUrl || ''}
                onChange={(e) => handleInputChange('photoUrl', e.target.value)}
                placeholder="https://... (Leave blank for vector fallback)"
                className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2 text-xs text-white placeholder:text-slate-600 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Signature Style / Text
              </label>
              <input
                type="text"
                value={formData.signatureText || ''}
                onChange={(e) => handleInputChange('signatureText', e.target.value)}
                placeholder="Rohit Kumar (Handwritten Cursive fallback)"
                className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2 text-xs text-white placeholder:text-slate-600 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
          </div>
        </section>

        <section className="lg:col-span-7 flex flex-col gap-5">
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl p-1.5 shadow-md">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
                  activeTab === 'preview'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                <span>Live Card Preview</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('code')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
                  activeTab === 'code'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Code className="h-3.5 w-3.5" />
                <span>React Component Code</span>
              </button>
            </div>

            {activeTab === 'preview' && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400 pr-2">
                <span className="hidden sm:inline">Zoom:</span>
                {[1, 1.2, 1.35].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScale(s)}
                    className={`rounded-md px-2 py-1 text-[11px] font-bold border transition ${
                      scale === s
                        ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                        : 'border-slate-800 bg-slate-800/60 text-slate-400 hover:text-white'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {activeTab === 'preview' ? (
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 sm:p-10 shadow-2xl flex flex-col items-center justify-center min-h-[460px] relative overflow-hidden backdrop-blur-sm">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 transition-all duration-300">
                <PanCardTemplate
                  data={formData}
                  scale={scale}
                  interactive={true}
                />
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-[11px] text-slate-400">
                <span className="flex items-center gap-1 bg-slate-800/80 px-2.5 py-1 rounded-full border border-slate-700/60">
                  <ShieldCheck className="h-3 w-3 text-emerald-400" />
                  Exact Aspect Ratio: 85.6mm × 53.98mm
                </span>
                <span className="bg-slate-800/80 px-2.5 py-1 rounded-full border border-slate-700/60">
                  Clean Security Background
                </span>
                <span className="bg-slate-800/80 px-2.5 py-1 rounded-full border border-slate-700/60">
                  State Emblem of India
                </span>
                <span className="bg-slate-800/80 px-2.5 py-1 rounded-full border border-slate-700/60">
                  Iridescent Hologram
                </span>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <p className="text-xs font-semibold text-slate-300">
                  Import and use anywhere in your application:
                </p>
                <button
                  type="button"
                  onClick={copyToClipboard}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
                >
                  {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
                </button>
              </div>

              <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 font-mono text-xs text-amber-200/90 leading-relaxed custom-scrollbar">
                <code>{sampleSnippet}</code>
              </pre>

              <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 text-xs text-blue-200 space-y-1">
                <p className="font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-blue-400" />
                  Dynamic API Support
                </p>
                <p>
                  Accepts standard Surepass / Cashfree / Income Tax API JSON responses directly. Handles both camelCase (<code>panNumber</code>, <code>fatherName</code>) and snake_case (<code>pan_number</code>, <code>father_name</code>, <code>dob</code>).
                </p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
