'use client';

import React, { useState } from 'react';
import RcCardTemplatePreview, { RcCardData } from '@/components/rcLookup/RcCardTemplatePreview';
import {
  CarFront,
  Check,
  Copy,
  FileCheck2,
  Printer,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

const PRESETS: Record<string, RcCardData> = {
  chhattisgarhCar: {
    rcNumber: 'CG 04 MB 1234',
    registrationDate: '12/05/2018',
    registrationUpto: '11/05/2033',
    ownerNumber: '1',
    vehicleChasiNumber: 'MA3ERLF3S00123456',
    vehicleEngineNumber: 'K12MN1234567',
    ownerName: 'RAMESH KUMAR DEWANGAN',
    fatherName: 'S/O: DAULAT RAM DEWANGAN',
    presentAddress: 'H NO 12, STREET 3, KUSHALPUR, PROFESSOR COLONY, RAIPUR, CHHATTISGARH - 492001',
    fuelType: 'DIESEL',
    normsType: 'BHARAT STAGE IV',
    vehicleCategoryDescription: 'LMV (LIGHT MOTOR VEHICLE)',
    manufacturingDateFormatted: '04/2018',
    noCylinders: '4',
    makerDescription: 'MARUTI SUZUKI INDIA LTD',
    makerModel: 'SWIFT DZIRE VDI',
    color: 'WHITE',
    bodyType: 'SALOON',
    seatCapacity: '5',
    unladenWeight: '1050',
    cubicCapacity: '1248',
    wheelbase: '2430',
    financer: 'HDFC BANK LTD',
    registeredAt: 'RTO, RAIPUR, CHHATTISGARH',
  },
  jcbMachine: {
    rcNumber: 'CG 04 JB 5678',
    registrationDate: '20/11/2020',
    registrationUpto: '19/11/2035',
    ownerNumber: '1',
    vehicleChasiNumber: 'HAR3DX2020E891234',
    vehicleEngineNumber: 'JCB448TA4G09871',
    ownerName: 'MEGHRAJ INFRA & EARTHMOVERS',
    fatherName: 'C/O: MEGHRAJ DEWANGAN',
    presentAddress: 'PLOT 45, INDUSTRIAL AREA, BHILAI, DURG, CHHATTISGARH - 490026',
    fuelType: 'DIESEL',
    normsType: 'CEV STAGE IV',
    vehicleCategoryDescription: 'EARTH MOVING EQUIPMENT (JCB)',
    manufacturingDateFormatted: '10/2020',
    noCylinders: '4',
    makerDescription: 'JCB INDIA LIMITED',
    makerModel: 'JCB 3DX BACKHOE LOADER',
    color: 'YELLOW',
    bodyType: 'CONSTRUCTION EQUIPMENT',
    seatCapacity: '1',
    unladenWeight: '7460',
    cubicCapacity: '4400',
    wheelbase: '2170',
    financer: 'TATA CAPITAL FINANCIAL SERVICES',
    registeredAt: 'RTO, DURG, CHHATTISGARH',
  },
};

export default function RcPreviewPage() {
  const [formData, setFormData] = useState<RcCardData>(PRESETS.chhattisgarhCar);
  const [activePreset, setActivePreset] = useState<string>('chhattisgarhCar');

  const handleInputChange = (field: keyof RcCardData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSelectPreset = (key: string) => {
    setActivePreset(key);
    setFormData(PRESETS[key]);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                <CarFront className="h-5 w-5" />
              </span>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-950">
                Vehicle Registration Certificate (RC) Card Preview
              </h1>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-slate-500">
              Live interactive preview of the official Indian Union Form 23A RC Card template with dynamic Surepass data.
            </p>
          </div>

          {/* Preset Buttons */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Presets:</span>
            {Object.keys(PRESETS).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handleSelectPreset(key)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  activePreset === key
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {key === 'chhattisgarhCar' ? 'Chhattisgarh Car' : 'JCB 3DX Equipment'}
              </button>
            ))}
          </div>
        </div>

        {/* Live Template Preview */}
        <RcCardTemplatePreview data={formData} />

        {/* Live Interactive Form Editor */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Live Field Editor (Test Any Dynamic Value)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Modify any field below to verify instant pixel-accurate positioning on the canvas above.
            </p>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            <div>
              <label className="font-bold text-slate-700">Registration Number</label>
              <input
                type="text"
                value={String(formData.rcNumber || '')}
                onChange={(e) => handleInputChange('rcNumber', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 font-mono"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700">Date of Registration</label>
              <input
                type="text"
                value={String(formData.registrationDate || '')}
                onChange={(e) => handleInputChange('registrationDate', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700">Registration Validity</label>
              <input
                type="text"
                value={String(formData.registrationUpto || '')}
                onChange={(e) => handleInputChange('registrationUpto', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700">Owner Serial</label>
              <input
                type="text"
                value={String(formData.ownerNumber || '')}
                onChange={(e) => handleInputChange('ownerNumber', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700">Chassis Number</label>
              <input
                type="text"
                value={String(formData.vehicleChasiNumber || '')}
                onChange={(e) => handleInputChange('vehicleChasiNumber', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 font-mono"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700">Engine / Motor Number</label>
              <input
                type="text"
                value={String(formData.vehicleEngineNumber || '')}
                onChange={(e) => handleInputChange('vehicleEngineNumber', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900 font-mono"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="font-bold text-slate-700">Owner Name</label>
              <input
                type="text"
                value={String(formData.ownerName || '')}
                onChange={(e) => handleInputChange('ownerName', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700">Son/Daughter/Wife of</label>
              <input
                type="text"
                value={String(formData.fatherName || '')}
                onChange={(e) => handleInputChange('fatherName', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="font-bold text-slate-700">Address</label>
              <input
                type="text"
                value={String(formData.presentAddress || '')}
                onChange={(e) => handleInputChange('presentAddress', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700">Fuel Type</label>
              <input
                type="text"
                value={String(formData.fuelType || '')}
                onChange={(e) => handleInputChange('fuelType', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700">Emission Norms</label>
              <input
                type="text"
                value={String(formData.normsType || '')}
                onChange={(e) => handleInputChange('normsType', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700">Vehicle Class</label>
              <input
                type="text"
                value={String(formData.vehicleCategoryDescription || '')}
                onChange={(e) => handleInputChange('vehicleCategoryDescription', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700">Maker Description</label>
              <input
                type="text"
                value={String(formData.makerDescription || '')}
                onChange={(e) => handleInputChange('makerDescription', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700">Model</label>
              <input
                type="text"
                value={String(formData.makerModel || '')}
                onChange={(e) => handleInputChange('makerModel', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700">Color</label>
              <input
                type="text"
                value={String(formData.color || '')}
                onChange={(e) => handleInputChange('color', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700">Body Type</label>
              <input
                type="text"
                value={String(formData.bodyType || '')}
                onChange={(e) => handleInputChange('bodyType', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700">Seating Capacity</label>
              <input
                type="text"
                value={String(formData.seatCapacity || '')}
                onChange={(e) => handleInputChange('seatCapacity', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700">Unladen Weight (Kg)</label>
              <input
                type="text"
                value={String(formData.unladenWeight || '')}
                onChange={(e) => handleInputChange('unladenWeight', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700">Financier</label>
              <input
                type="text"
                value={String(formData.financer || '')}
                onChange={(e) => handleInputChange('financer', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="font-bold text-slate-700">Registration Authority</label>
              <input
                type="text"
                value={String(formData.registeredAt || '')}
                onChange={(e) => handleInputChange('registeredAt', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

