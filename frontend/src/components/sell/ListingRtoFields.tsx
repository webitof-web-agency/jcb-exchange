'use client';

import type { ChangeEvent, ReactNode } from 'react';
import type { ListingRtoFormState } from '@/lib/listingRtoForm';

const inputClass = 'w-full rounded-lg border border-gray-200 bg-[#F8FAFC] px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#FFC107]';
const options = {
  hirePurchaseStatus: [['PENDING', 'Pending'], ['ACTIVE', 'Active'], ['TERMINATED', 'Terminated'], ['NOT_APPLICABLE', 'Not Applicable']],
  validity: [['VALID', 'Valid'], ['EXPIRED', 'Expired']], hsrpStatus: [['YES', 'Yes'], ['NO', 'No']],
} as const;
function Field({ label, children, required }: { label: string; children: ReactNode; required: boolean }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label} {required ? <span className="text-red-500">*</span> : null}</span>{children}</label>; }

export default function ListingRtoFields({ value, onChange, insuranceExpiry, onInsuranceExpiryChange, required = true }: {
  value: ListingRtoFormState;
  onChange: <K extends keyof ListingRtoFormState>(key: K, next: ListingRtoFormState[K]) => void;
  insuranceExpiry: string;
  onInsuranceExpiryChange: (next: string) => void;
  required?: boolean;
}) {
  const select = <K extends keyof ListingRtoFormState>(key: K, items: readonly (readonly [string, string])[]) => <select value={String(value[key])} onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(key, event.target.value as ListingRtoFormState[K])} className={inputClass}>{items.map(([itemValue, label]) => <option key={itemValue} value={itemValue}>{label}</option>)}</select>;
  const dateField = <S extends keyof ListingRtoFormState, D extends keyof ListingRtoFormState>(statusKey: S, dateKey: D, label: string) => <Field label={label} required={required}><div className="space-y-2">{select(statusKey, options.validity)}<input type="date" required={required} value={String(value[dateKey] || '')} onChange={(event) => onChange(dateKey, event.target.value as ListingRtoFormState[D])} className={inputClass} /></div></Field>;
  return <section className="rounded-2xl border border-gray-200 p-5"><div className="mb-4 flex items-center gap-2 text-gray-900"><h3 className="text-base font-semibold">RTO & Vehicle Compliance</h3></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><Field label="Hire Purchase" required={required}>{select('hirePurchaseStatus', options.hirePurchaseStatus)}</Field>{dateField('taxStatus', 'taxValidUntil', 'Tax Validity')}{dateField('fitnessStatus', 'fitnessValidUntil', 'Fitness Validity')}<Field label="Insurance Validity" required={required}><div className="space-y-2">{select('insuranceStatus', options.validity)}<input type="date" required={required} value={insuranceExpiry} onChange={(event) => onInsuranceExpiryChange(event.target.value)} className={inputClass} /></div></Field>{dateField('pucStatus', 'pucValidUntil', 'PUC Validity')}<Field label="HSRP Valid" required={required}>{select('hsrpStatus', options.hsrpStatus)}</Field><Field label="RTO Office" required={required}><input required={required} value={value.rtoOffice} onChange={(event) => onChange('rtoOffice', event.target.value)} className={inputClass} /></Field><Field label="RTO Agent Name" required={required}><input required={required} value={value.rtoAgentName} onChange={(event) => onChange('rtoAgentName', event.target.value)} className={inputClass} /></Field><Field label="RTO Expenses" required={required}><input required={required} type="number" min={1} step={1} inputMode="numeric" value={value.rtoExpenses} onChange={(event) => onChange('rtoExpenses', event.target.value.replace(/\D/g, ''))} className={inputClass} /></Field><Field label="Vehicle Maintenance Cost" required={required}><input required={required} type="number" min={1} step={1} inputMode="numeric" value={value.vehicleMaintenanceCost} onChange={(event) => onChange('vehicleMaintenanceCost', event.target.value.replace(/\D/g, ''))} className={inputClass} /></Field></div><p className="mt-3 text-xs text-gray-500">Vehicle Type uses the existing Category field and Hours Running uses the existing Operating Hours field.</p></section>;
}
