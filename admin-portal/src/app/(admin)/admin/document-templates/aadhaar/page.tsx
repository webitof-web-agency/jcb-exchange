'use client';

import React, { useState } from 'react';
import AadhaarCardTemplate, { AadhaarCardData } from '@/components/aadhaar/AadhaarCardTemplate';
import {
  CreditCard, RefreshCw, Printer, Copy, Check, Sparkles,
  User, Calendar, Hash, ShieldCheck, Code, Eye, MapPin
} from 'lucide-react';

const PRESETS: Record<string, AadhaarCardData> = {
  basant: {
    aadhaarNumber: '1234 5678 9101',
    vid: '9110 0445 8669 0808',
    enrolmentNo: '4049/30507/00690',
    issueDate: '10/07/2025',
    nameHindi: 'बसंत राज',
    nameEnglish: 'Basant Raj',
    careOf: 'Aadhar Card',
    vtc: 'Flat No 25',
    po: 'Grugram',
    subDistrict: 'Grugram',
    district: 'Grugram',
    state: 'New Delhi',
    pinCode: '110042',
    mobile: '9931971873',
    dob: '01/01/2000',
    gender: 'MALE',
    genderHindi: 'पुरुष',
    photoUrl: '/images/aadhaar/basant-raj.png',
    addressHindi: 'फ्लैट नं. 25, गुरुग्राम, नई दिल्ली, 110042',
    addressEnglish: 'Flat No 25, Grugram, New Delhi, 110042',
  },
  meraj: {
    aadhaarNumber: '2943 6593 3461',
    vid: '9110 0445 8669 0808',
    enrolmentNo: '4049/30507/00690',
    issueDate: '10/07/2025',
    nameHindi: 'मेराज खान',
    nameEnglish: 'MERAJ KHAN',
    careOf: 'सुध्दशन खांन',
    vtc: 'पूरे दुर्गी',
    po: 'फूलपुर',
    subDistrict: 'फूलपुर',
    district: 'इलाहाबाद',
    state: 'उत्तर प्रदेश',
    pinCode: '212402',
    mobile: '9876543210',
    fatherNameHindi: 'सुध्दशन खांन',
    fatherNameEnglish: 'Sudhdan Khan',
    dob: '12/12/1988',
    gender: 'Male',
    genderHindi: 'पुरुष',
    addressHindi: 'सरायं दान शाह, कतरौली, पूरे दुर्गी, फूलपुर, इलाहाबाद, उत्तर प्रदेश, 212402',
    addressEnglish: 'saray dan shah, KATRAULI, Poore Durgi, Phoolpur, Allahabad, Uttar Pradesh, 212402',
  },
  rohit: {
    aadhaarNumber: '5421 8904 2231',
    vid: '8220 9012 3412 1190',
    enrolmentNo: '2019/10204/99120',
    issueDate: '15/08/2023',
    nameHindi: 'रोहित कुमार',
    nameEnglish: 'ROHIT KUMAR',
    careOf: 'सुरेश कुमार',
    vtc: 'गांधी नगर',
    po: 'जयपुर',
    subDistrict: 'जयपुर',
    district: 'जयपुर',
    state: 'राजस्थान',
    pinCode: '302015',
    mobile: '9123456780',
    fatherNameHindi: 'सुरेश कुमार',
    fatherNameEnglish: 'Suresh Kumar',
    dob: '15/08/1990',
    gender: 'Male',
    genderHindi: 'पुरुष',
    photoUrl: '/images/pancard/rohit-kumar.png',
    addressHindi: 'मकान नं. 12, गांधी नगर, जयपुर, राजस्थान, 302015',
    addressEnglish: 'H No. 12, Gandhi Nagar, Jaipur, Rajasthan, 302015',
  },
  priya: {
    aadhaarNumber: '8839 2190 7712',
    vid: '7712 3490 8821 0019',
    enrolmentNo: '1109/44812/77210',
    issueDate: '22/11/2024',
    nameHindi: 'प्रिया शर्मा',
    nameEnglish: 'PRIYA SHARMA',
    careOf: 'रमेश शर्मा',
    vtc: 'सेक्टर 18',
    po: 'नोएडा',
    subDistrict: 'नोएडा',
    district: 'गौतम बुद्ध नगर',
    state: 'उत्तर प्रदेश',
    pinCode: '201301',
    mobile: '9988776655',
    fatherNameHindi: 'रमेश शर्मा',
    fatherNameEnglish: 'Ramesh Sharma',
    dob: '22/11/1994',
    gender: 'Female',
    genderHindi: 'महिला',
    photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&h=380&fit=crop&crop=faces',
    addressHindi: 'फ्लैट 402, शांति हाइट्स, सेक्टर 18, नोएडा, उत्तर प्रदेश, 201301',
    addressEnglish: 'Flat 402, Shanti Heights, Sector 18, Noida, Uttar Pradesh, 201301',
  },
};

export default function AadhaarCardPreviewPage() {
  const [formData, setFormData] = useState<AadhaarCardData>(PRESETS.basant);
  const [scale, setScale] = useState<number>(1);
  const [cardSide, setCardSide] = useState<'full' | 'front' | 'back' | 'both'>('full');
  const [isSimulatingApi, setIsSimulatingApi] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');

  const handleInputChange = (field: keyof AadhaarCardData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleLoadPreset = (key: keyof typeof PRESETS) => {
    setFormData(PRESETS[key]);
  };

  const handleSimulateApiFetch = () => {
    setIsSimulatingApi(true);
    setTimeout(() => {
      setFormData({
        aadhaarNumber: '7721 3490 1109',
        nameHindi: 'विक्रम सिंह',
        nameEnglish: 'VIKRAM SINGH',
        fatherNameHindi: 'हरपाल सिंह',
        fatherNameEnglish: 'Harpal Singh',
        dob: '10/05/1991',
        gender: 'Male',
        genderHindi: 'पुरुष',
        photoUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=300&h=380&fit=crop&crop=faces',
        addressHindi: 'प्लॉट नं. 45, सिविल लाइन्स, गुरुग्राम, हरियाणा, 122001',
        addressEnglish: 'Plot No. 45, Civil Lines, Gurugram, Haryana, 122001',
      });
      setIsSimulatingApi(false);
    }, 600);
  };

  const handlePrint = () => {
    window.print();
  };

  const sampleSnippet = `import AadhaarCardTemplate, { EAadhaarFullTemplate, AadhaarBackTemplate } from '@/components/aadhaar/AadhaarCardTemplate';
  
// 1. Render Official e-Aadhaar Full Sheet (Letter / PDF Format)
<AadhaarCardTemplate
  data={{
    aadhaarNumber: "${formData.aadhaarNumber}",
    vid: "${formData.vid || '9110 0445 8669 0808'}",
    enrolmentNo: "${formData.enrolmentNo || '4049/30507/00690'}",
    issueDate: "${formData.issueDate || '10/07/2025'}",
    nameEnglish: "${formData.nameEnglish}",
    nameHindi: "${formData.nameHindi}",
    careOf: "${formData.careOf || 'Aadhar Card'}",
    vtc: "${formData.vtc || 'Flat No 25'}",
    po: "${formData.po || 'Grugram'}",
    subDistrict: "${formData.subDistrict || 'Grugram'}",
    district: "${formData.district || 'Grugram'}",
    state: "${formData.state || 'New Delhi'}",
    pinCode: "${formData.pinCode || '110042'}",
    mobile: "${formData.mobile || '9931971873'}",
    dob: "${formData.dob}",
    gender: "${formData.gender}",
    photoUrl: "${formData.photoUrl || ''}",
  }}
  scale={1}
  interactive={true}
  side="full"
/>

// 2. Render Cut-out Wallet Card Front
<AadhaarCardTemplate
  data={{
    aadhaarNumber: "${formData.aadhaarNumber}",
    issueDate: "${formData.issueDate || '10/07/2025'}",
    nameEnglish: "${formData.nameEnglish}",
    nameHindi: "${formData.nameHindi}",
    dob: "${formData.dob}",
    gender: "${formData.gender}",
    photoUrl: "${formData.photoUrl || ''}",
  }}
  scale={1.2}
  interactive={true}
  side="front"
/>

// 3. Render Cut-out Wallet Card Back
<AadhaarCardTemplate
  data={{
    aadhaarNumber: "${formData.aadhaarNumber}",
    addressEnglish: "${formData.addressEnglish}",
    addressHindi: "${formData.addressHindi}",
  }}
  scale={1.2}
  interactive={true}
  side="back"
/>`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(sampleSnippet);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/80 px-6 py-4 backdrop-blur-md sticky top-0 z-30 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-400 border border-red-500/20">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
                UIDAI Aadhaar Card Template Studio
              </h1>
              <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                ID-1 Standard
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Reusable dynamic template for Government of India UIDAI Aadhaar Card (Front & Back)
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
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition"
          >
            {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
          </button>
        </div>
      </header>

      {/* Main Grid Workspace */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Controls & Dynamic Data Form (5 cols) */}
        <section className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Aadhaar Dynamic Data
              </h2>
              <p className="text-xs text-slate-400">
                Data changes reflect immediately on Front & Back sides
              </p>
            </div>
            <button
              type="button"
              onClick={handleSimulateApiFetch}
              disabled={isSimulatingApi}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 border border-red-500/20 px-2.5 py-1.5 text-[11px] font-bold text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition"
            >
              <RefreshCw className={`h-3 w-3 ${isSimulatingApi ? 'animate-spin' : ''}`} />
              <span>Simulate API</span>
            </button>
          </div>

          {/* Quick Presets */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2">
              Quick Test Presets
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleLoadPreset('basant')}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium border transition ${
                  formData.nameEnglish === 'Basant Raj'
                    ? 'border-red-500 bg-red-500/10 text-red-300 font-bold'
                    : 'border-slate-800 bg-slate-800/80 text-slate-400 hover:text-white'
                }`}
              >
                Basant Raj (Exact Image)
              </button>
              <button
                type="button"
                onClick={() => handleLoadPreset('meraj')}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium border transition ${
                  formData.nameEnglish === 'MERAJ KHAN'
                    ? 'border-red-500 bg-red-500/10 text-red-300'
                    : 'border-slate-800 bg-slate-800/80 text-slate-400 hover:text-white'
                }`}
              >
                Meraj Khan
              </button>
              <button
                type="button"
                onClick={() => handleLoadPreset('rohit')}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium border transition ${
                  formData.nameEnglish === 'ROHIT KUMAR'
                    ? 'border-red-500 bg-red-500/10 text-red-300'
                    : 'border-slate-800 bg-slate-800/80 text-slate-400 hover:text-white'
                }`}
              >
                Rohit Kumar
              </button>
              <button
                type="button"
                onClick={() => handleLoadPreset('priya')}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium border transition ${
                  formData.nameEnglish === 'PRIYA SHARMA'
                    ? 'border-red-500 bg-red-500/10 text-red-300'
                    : 'border-slate-800 bg-slate-800/80 text-slate-400 hover:text-white'
                }`}
              >
                Priya Sharma
              </button>
            </div>
          </div>

          {/* Input Fields */}
          <div className="space-y-3.5">
            {/* Aadhaar Number & VID */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Aadhaar Number (12 digits) <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    maxLength={14}
                    value={formData.aadhaarNumber}
                    onChange={(e) => handleInputChange('aadhaarNumber', e.target.value)}
                    placeholder="1234 5678 9101"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/80 pl-9 pr-3.5 py-2 text-sm font-mono font-bold text-white placeholder:text-slate-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  VID (16 digits)
                </label>
                <input
                  type="text"
                  value={formData.vid || ''}
                  onChange={(e) => handleInputChange('vid', e.target.value)}
                  placeholder="9110 0445 8669 0808"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2 text-sm font-mono text-white placeholder:text-slate-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                />
              </div>
            </div>

            {/* Enrolment No & Issue Date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Enrolment No.
                </label>
                <input
                  type="text"
                  value={formData.enrolmentNo || ''}
                  onChange={(e) => handleInputChange('enrolmentNo', e.target.value)}
                  placeholder="4049/30507/00690"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2 text-xs font-mono text-white placeholder:text-slate-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Aadhaar Issued Date
                </label>
                <input
                  type="text"
                  value={formData.issueDate || ''}
                  onChange={(e) => handleInputChange('issueDate', e.target.value)}
                  placeholder="10/07/2025"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2 text-xs font-mono text-white placeholder:text-slate-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Name (Hindi) <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.nameHindi || ''}
                  onChange={(e) => handleInputChange('nameHindi', e.target.value)}
                  placeholder="e.g. बसंत राज"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2 text-sm font-semibold text-white placeholder:text-slate-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Name (English) <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    value={formData.nameEnglish || ''}
                    onChange={(e) => handleInputChange('nameEnglish', e.target.value)}
                    placeholder="e.g. Basant Raj"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/80 pl-9 pr-3.5 py-2 text-sm font-semibold text-white placeholder:text-slate-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  C/O (Care Of)
                </label>
                <input
                  type="text"
                  value={formData.careOf || ''}
                  onChange={(e) => handleInputChange('careOf', e.target.value)}
                  placeholder="e.g. Aadhar Card"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2 text-sm text-white placeholder:text-slate-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Mobile Number
                </label>
                <input
                  type="text"
                  value={formData.mobile || ''}
                  onChange={(e) => handleInputChange('mobile', e.target.value)}
                  placeholder="e.g. 9931971873"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2 text-sm font-mono text-white placeholder:text-slate-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Date of Birth <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    value={formData.dob}
                    onChange={(e) => handleInputChange('dob', e.target.value)}
                    placeholder="DD/MM/YYYY"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/80 pl-9 pr-3.5 py-2 text-sm font-mono text-white placeholder:text-slate-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Gender
                </label>
                <select
                  value={formData.gender || 'MALE'}
                  onChange={(e) => {
                    const g = e.target.value;
                    handleInputChange('gender', g);
                    handleInputChange('genderHindi', g.toLowerCase().startsWith('f') ? 'महिला' : 'पुरुष');
                  }}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                >
                  <option value="MALE">पुरुष / MALE</option>
                  <option value="FEMALE">महिला / FEMALE</option>
                  <option value="OTHER">अन्य / OTHER</option>
                </select>
              </div>
            </div>

            {/* Address Hierarchy (VTC, PO, Sub-District, District, State, PIN) */}
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Letter Address Breakdown
              </span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={formData.vtc || ''}
                  onChange={(e) => handleInputChange('vtc', e.target.value)}
                  placeholder="VTC: Flat No 25"
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                />
                <input
                  type="text"
                  value={formData.po || ''}
                  onChange={(e) => handleInputChange('po', e.target.value)}
                  placeholder="PO: Grugram"
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={formData.subDistrict || ''}
                  onChange={(e) => handleInputChange('subDistrict', e.target.value)}
                  placeholder="Sub District: Grugram"
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                />
                <input
                  type="text"
                  value={formData.district || ''}
                  onChange={(e) => handleInputChange('district', e.target.value)}
                  placeholder="District: Grugram"
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={formData.state || ''}
                  onChange={(e) => handleInputChange('state', e.target.value)}
                  placeholder="State: New Delhi"
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                />
                <input
                  type="text"
                  value={formData.pinCode || ''}
                  onChange={(e) => handleInputChange('pinCode', e.target.value)}
                  placeholder="PIN Code: 110042"
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-mono text-white"
                />
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
                placeholder="https://... (Leave blank for vector silhouette)"
                className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2 text-xs text-white placeholder:text-slate-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Address (Hindi)
              </label>
              <textarea
                rows={2}
                value={formData.addressHindi || ''}
                onChange={(e) => handleInputChange('addressHindi', e.target.value)}
                placeholder="गाँव, पोस्ट, तहसील, जिला, राज्य, पिन"
                className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2 text-xs text-white placeholder:text-slate-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Address (English)
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <textarea
                  rows={2}
                  value={formData.addressEnglish || ''}
                  onChange={(e) => handleInputChange('addressEnglish', e.target.value)}
                  placeholder="Village, Post, Tehsil, District, State, PIN"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 pl-9 pr-3.5 py-2 text-xs text-white placeholder:text-slate-600 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 resize-none"
                />
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: Live Card Preview & Code Tab (7 cols) */}
        <section className="lg:col-span-7 flex flex-col gap-5">
          {/* View Mode Tabs */}
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl p-1.5 shadow-md">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
                  activeTab === 'preview'
                    ? 'bg-red-500 text-white shadow-sm'
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
                    ? 'bg-red-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Code className="h-3.5 w-3.5" />
                <span>React Component Code</span>
              </button>
            </div>

            {/* Scale Controller */}
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
                        ? 'border-red-500 bg-red-500/20 text-red-300'
                        : 'border-slate-800 bg-slate-800/60 text-slate-400 hover:text-white'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tab 1: Live Card Preview Display */}
          {activeTab === 'preview' ? (
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl flex flex-col items-center justify-center min-h-[460px] relative overflow-hidden backdrop-blur-sm">
              {/* Radial background ambient glow */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />

              {/* Side Selector (Full e-Aadhaar Letter / Front / Back / Both) */}
              <div className="relative z-20 mb-6 flex flex-wrap items-center justify-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/80 p-1.5 shadow-inner">
                <button
                  type="button"
                  onClick={() => setCardSide('full')}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition flex items-center gap-1.5 ${
                    cardSide === 'full'
                      ? 'bg-red-500 text-white shadow-md ring-1 ring-red-400'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>e-Aadhaar Full Letter (पूरा ई-आधार पत्र)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCardSide('front')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    cardSide === 'front'
                      ? 'bg-red-500 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Wallet Front (सामने)
                </button>
                <button
                  type="button"
                  onClick={() => setCardSide('back')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    cardSide === 'back'
                      ? 'bg-red-500 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Wallet Back (पीछे)
                </button>
                <button
                  type="button"
                  onClick={() => setCardSide('both')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    cardSide === 'both'
                      ? 'bg-red-500 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Both Wallet Sides (दोनों तरफ)
                </button>
              </div>

              {/* The Live Rendered Template */}
              <div className="relative z-10 transition-all duration-300 flex flex-col xl:flex-row items-center justify-center gap-8">
                {cardSide === 'full' && (
                  <div className="flex flex-col items-center gap-3">
                    <AadhaarCardTemplate
                      data={formData}
                      scale={scale}
                      interactive={true}
                      side="full"
                    />
                    <div className="flex items-center gap-4 mt-2">
                      <button
                        type="button"
                        onClick={() => setCardSide('front')}
                        className="text-xs font-semibold text-slate-400 hover:text-red-400 transition flex items-center gap-1.5"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        View Bottom Wallet Card Front →
                      </button>
                    </div>
                  </div>
                )}

                {cardSide === 'front' && (
                  <div className="flex flex-col items-center gap-3">
                    <AadhaarCardTemplate
                      data={formData}
                      scale={scale}
                      interactive={true}
                      side="front"
                    />
                    <div className="flex items-center gap-4 mt-2">
                      <button
                        type="button"
                        onClick={() => setCardSide('back')}
                        className="text-xs font-semibold text-slate-400 hover:text-red-400 transition flex items-center gap-1.5"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Click to view Back Side →
                      </button>
                      <span className="text-slate-600">|</span>
                      <button
                        type="button"
                        onClick={() => setCardSide('full')}
                        className="text-xs font-semibold text-slate-400 hover:text-red-400 transition flex items-center gap-1.5"
                      >
                        ← View Full e-Aadhaar Letter
                      </button>
                    </div>
                  </div>
                )}

                {cardSide === 'back' && (
                  <div className="flex flex-col items-center gap-3">
                    <AadhaarCardTemplate
                      data={formData}
                      scale={scale}
                      interactive={true}
                      side="back"
                    />
                    <div className="flex items-center gap-4 mt-2">
                      <button
                        type="button"
                        onClick={() => setCardSide('front')}
                        className="text-xs font-semibold text-slate-400 hover:text-red-400 transition flex items-center gap-1.5"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        ← Click to view Front Side
                      </button>
                      <span className="text-slate-600">|</span>
                      <button
                        type="button"
                        onClick={() => setCardSide('full')}
                        className="text-xs font-semibold text-slate-400 hover:text-red-400 transition flex items-center gap-1.5"
                      >
                        View Full Letter →
                      </button>
                    </div>
                  </div>
                )}

                {cardSide === 'both' && (
                  <div className="flex flex-col items-center gap-8 w-full">
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-[11px] font-bold text-red-400 uppercase tracking-wider">
                        Front Side (85.6mm × 53.98mm)
                      </span>
                      <AadhaarCardTemplate
                        data={formData}
                        scale={Math.min(scale, 1.1)}
                        interactive={true}
                        side="front"
                      />
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-[11px] font-bold text-red-400 uppercase tracking-wider">
                        Back Side (85.6mm × 53.98mm)
                      </span>
                      <AadhaarCardTemplate
                        data={formData}
                        scale={Math.min(scale, 1.1)}
                        interactive={true}
                        side="back"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Specs Badge */}
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-[11px] text-slate-400">
                <span className="flex items-center gap-1 bg-slate-800/80 px-2.5 py-1 rounded-full border border-slate-700/60">
                  <ShieldCheck className="h-3 w-3 text-emerald-400" />
                  Exact Aspect Ratio: 85.6mm × 53.98mm (ID-1)
                </span>
                <span className="bg-slate-800/80 px-2.5 py-1 rounded-full border border-slate-700/60">
                  UIDAI Official Saffron-Green Header
                </span>
                <span className="bg-slate-800/80 px-2.5 py-1 rounded-full border border-slate-700/60">
                  Dual-Script Hindi & English Address
                </span>
                <span className="bg-slate-800/80 px-2.5 py-1 rounded-full border border-slate-700/60">
                  1947 Helpline & UIDAI Fingerprint Logo
                </span>
              </div>
            </div>
          ) : (
            /* Tab 2: React Component Usage & Code Snippet */
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

              <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 font-mono text-xs text-red-200/90 leading-relaxed custom-scrollbar">
                <code>{sampleSnippet}</code>
              </pre>

              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-200 space-y-1">
                <p className="font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-red-400" />
                  UIDAI Verification & KYC Integration
                </p>
                <p>
                  Accepts standard Cashfree / Surepass / UIDAI OTP authentication responses directly. Automatically segments the 12-digit Aadhaar into 4-digit groups (e.g. <code>2943 6593 3461</code>) and renders both Front & Back seamlessly.
                </p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
