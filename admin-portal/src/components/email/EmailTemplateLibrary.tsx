'use client';

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  Bold,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Eye,
  FileText,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Type,
  Underline,
  X,
} from 'lucide-react';
import api from '@/lib/api';
import { captureEditorSelection, restoreEditorSelection } from './richEditorSelection';

type AttachmentMode =
  | 'NONE'
  | 'DYNAMIC_OFFER_PDF'
  | 'DYNAMIC_OFFER_ACCEPTANCE_PDF'
  | 'DYNAMIC_VEHICLE_INVOICE_PDF'
  | 'DYNAMIC_PAYMENT_RECEIPT_PDF'
  | 'DYNAMIC_PRIME_INVOICE_PDF';

/** What each attachment policy puts on the email (the backend decides it per event; HR cannot change it). */
const ATTACHMENT_DESCRIPTIONS: Record<AttachmentMode, string> = {
  NONE: 'This email notification will be delivered as pure responsive text/HTML without PDF attachments.',
  DYNAMIC_OFFER_PDF: 'The system attaches the current offer letter PDF at the moment of sending, so a revised letter is never missed.',
  DYNAMIC_OFFER_ACCEPTANCE_PDF: 'The system attaches the offer acceptance certificate PDF and the signed offer letter (signed on the link, uploaded by the candidate, or recorded by HR).',
  DYNAMIC_VEHICLE_INVOICE_PDF: 'The system generates and attaches the latest vehicle sale invoice PDF with official stamps and signatures.',
  DYNAMIC_PAYMENT_RECEIPT_PDF: 'The system generates and attaches the latest payment receipt PDF with official stamps and signatures.',
  DYNAMIC_PRIME_INVOICE_PDF: 'The system generates and attaches the latest Prime membership invoice PDF with official stamps and signatures.',
};
type EmailTemplate = { id: string; name: string; type: string; eventCode?: string; subject: string; body: string; variables: string[]; enabled: boolean; attachmentMode: AttachmentMode; isDefault: boolean };
type EmailEvent = { eventCode: string; name: string; variables: string[]; attachmentMode: AttachmentMode; templates: EmailTemplate[]; selectedTemplateId: string | null; enabled: boolean };
type EmailTemplateScope = 'MARKETPLACE' | 'RECRUITMENT';

export interface CustomDropdownOption {
  value: string;
  label: string;
  badge?: string;
  description?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}

const errorText = (error: unknown, fallback: string) => {
  if (!axios.isAxiosError(error)) return fallback;
  return error.response?.data?.error || error.response?.data?.message || fallback;
};

const initialMessageFor = (event: EmailEvent | undefined) => {
  const variable = event?.variables[0];
  return variable ? `<p>Hello {{${variable}}},</p><p>Write your message here.</p>` : '<p>Write your message here.</p>';
};

const initialSubjectFor = (event: EmailEvent | undefined) => {
  if (event?.variables.includes('job_title')) return 'Update for {{job_title}} - JCB Exchange';
  if (event?.variables.includes('listing_title')) return 'Listing update for {{listing_title}} - JCB Exchange';
  if (event?.variables.includes('customer_name')) return 'Update from JCB Exchange';
  return 'Update from JCB Exchange';
};

const extractUsedVariables = (value: string) => new Set([...value.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((match) => match[1]));

const availableVariablesFor = (variables: string[], value: string) => {
  const usedVariables = extractUsedVariables(value);
  return variables.filter((variable) => !usedVariables.has(variable));
};

function Toggle({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#FFC107] focus:ring-offset-2 ${
        checked ? 'bg-emerald-500' : 'bg-gray-300'
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      <span
        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function CustomDropdown({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  disabled = false,
  className = '',
  buttonClassName = '',
  menuClassName = '',
  compact = false,
  onBeforeChange,
}: {
  options: CustomDropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  compact?: boolean;
  onBeforeChange?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const selected = options.find((opt) => opt.value === value);

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onMouseDown={() => onBeforeChange?.()}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 transition-all hover:border-slate-300 hover:bg-slate-50/60 focus:border-[#FFC107] focus:outline-none focus:ring-2 focus:ring-[#FFC107]/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${
          compact ? 'h-8 px-2.5 text-xs' : 'h-10 px-3.5 text-xs'
        } ${open ? 'border-[#FFC107] ring-2 ring-[#FFC107]/20' : ''} ${buttonClassName}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate flex items-center gap-1.5 text-left">
          {selected?.icon}
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          {selected?.badge && (
            <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
              {selected.badge}
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200 ${
            open ? 'rotate-180 text-amber-600' : ''
          }`}
        />
      </button>

      {open && (
        <div
          className={`absolute left-0 z-50 mt-1.5 min-w-[190px] max-w-[340px] rounded-xl border border-slate-200 bg-white p-1 shadow-xl ring-1 ring-black/5 ${menuClassName}`}
          role="listbox"
        >
          <div className="max-h-56 overflow-y-auto custom-scrollbar space-y-0.5">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-400 text-center">No options available</div>
            ) : (
              options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <div key={opt.value} className="flex items-stretch gap-1 rounded-lg">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        onBeforeChange?.();
                      }}
                      onClick={() => {
                        onBeforeChange?.();
                        onChange(opt.value);
                        setOpen(false);
                      }}
                      className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                        isSelected
                          ? 'bg-amber-50 font-bold text-amber-950'
                          : 'font-medium text-slate-700 hover:bg-slate-100/70 hover:text-slate-900'
                      }`}
                    >
                      <div className="flex min-w-0 flex-col pr-2">
                        <div className="flex items-center gap-1.5 truncate">
                          {opt.icon}
                          <span className="truncate">{opt.label}</span>
                          {opt.badge && (
                            <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
                              {opt.badge}
                            </span>
                          )}
                        </div>
                        {opt.description && (
                          <span className="mt-0.5 truncate text-[10px] font-normal text-slate-400">
                            {opt.description}
                          </span>
                        )}
                      </div>
                      {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-amber-600" />}
                    </button>
                    {opt.actions ? (
                      <div
                        className="flex shrink-0 items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-1"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpen(false);
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                      >
                        {opt.actions}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const FORMAT_OPTIONS: CustomDropdownOption[] = [
  { value: 'p', label: 'Paragraph', description: 'Body text', icon: <Type className="h-3.5 w-3.5 text-slate-500" /> },
  { value: 'h2', label: 'Heading 2', description: 'Section title (20px)', icon: <Heading2 className="h-3.5 w-3.5 text-slate-700" /> },
  { value: 'h3', label: 'Subheading', description: 'Subsection title (16px)', icon: <Heading3 className="h-3.5 w-3.5 text-slate-600" /> },
];

const FONT_SIZE_OPTIONS: CustomDropdownOption[] = [
  { value: '2', label: 'Small', description: '12px compact' },
  { value: '3', label: 'Normal', description: '14px standard' },
  { value: '4', label: 'Large', description: '18px large' },
  { value: '5', label: 'Extra Large', description: '24px hero' },
];

function RichEmailEditor({
  value,
  onChange,
  variables,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  variables: string[];
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Range | null>(null);
  const [currentFormat, setCurrentFormat] = useState('p');
  const [currentSize, setCurrentSize] = useState('3');

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value;
    }
  }, [value]);

  const saveSelection = () => {
    selectionRef.current = captureEditorSelection(ref.current, window.getSelection());
  };

  const restoreSelection = () => {
    restoreEditorSelection(ref.current, window.getSelection(), selectionRef.current);
  };

  const command = (name: string, commandValue?: string) => {
    restoreSelection();
    document.execCommand(name, false, commandValue);
    saveSelection();
    onChange(ref.current?.innerHTML || '');
  };

  const insertVariable = (variable: string) => {
    restoreSelection();
    document.execCommand('insertText', false, `{{${variable}}}`);
    saveSelection();
    onChange(ref.current?.innerHTML || '');
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs transition focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-[#FFC107]/20">
      {/* Editor Toolbar with Custom Dropdowns */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200/80 bg-slate-50/80 p-2 sm:gap-2">
        <div className="flex items-center gap-0.5 rounded-lg border border-slate-200/70 bg-white p-0.5 shadow-2xs">
          <button
            type="button"
            title="Bold"
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => command('bold')}
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 disabled:opacity-40"
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Italic"
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => command('italic')}
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 disabled:opacity-40"
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Underline"
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => command('underline')}
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 disabled:opacity-40"
          >
            <Underline className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="h-4 w-px bg-slate-200" />

        <div className="flex items-center gap-0.5 rounded-lg border border-slate-200/70 bg-white p-0.5 shadow-2xs">
          <button
            type="button"
            title="Bullet list"
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => command('insertUnorderedList')}
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 disabled:opacity-40"
          >
            <List className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Numbered list"
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => command('insertOrderedList')}
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 disabled:opacity-40"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="h-4 w-px bg-slate-200" />

        {/* Custom Dropdown 1: Text Style */}
        <CustomDropdown
          options={FORMAT_OPTIONS}
          value={currentFormat}
          onChange={(val) => {
            setCurrentFormat(val);
            command('formatBlock', val);
          }}
          onBeforeChange={saveSelection}
          compact
          disabled={disabled}
          className="w-32"
          buttonClassName="h-8 text-xs font-semibold"
          menuClassName="w-48"
        />

        {/* Custom Dropdown 2: Font Size */}
        <CustomDropdown
          options={FONT_SIZE_OPTIONS}
          value={currentSize}
          onChange={(val) => {
            setCurrentSize(val);
            command('fontSize', val);
          }}
          onBeforeChange={saveSelection}
          compact
          disabled={disabled}
          className="w-28"
          buttonClassName="h-8 text-xs font-semibold"
          menuClassName="w-40"
        />

        <div className="h-4 w-px bg-slate-200" />

        <button
          type="button"
          title="Insert link"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const url = window.prompt('Enter an https or mailto link:');
            if (url && /^(https:\/\/|mailto:)/i.test(url)) command('createLink', url);
          }}
          className="rounded-lg border border-slate-200/70 bg-white p-1.5 text-slate-600 shadow-2xs hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 disabled:opacity-40"
        >
          <Link2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Variables Bar with Custom Scroll */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-amber-50/60 px-3 py-1.5 text-[11px] font-medium text-amber-900">
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-amber-600" />
          Click a tag to insert at cursor position:
        </span>
      </div>

      <div className="max-h-24 overflow-y-auto custom-scrollbar flex flex-wrap gap-1.5 border-b border-slate-100 bg-slate-50/40 px-3 py-2">
        {variables.length > 0 ? (
          variables.map((variable) => (
            <button
              key={variable}
              type="button"
              disabled={disabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertVariable(variable)}
              title="Click to insert at cursor"
              className="group inline-flex items-center gap-1 rounded-md border border-violet-200/90 bg-white px-2.5 py-0.5 font-mono text-[10px] font-bold text-violet-700 shadow-2xs transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800 disabled:opacity-40"
            >
              <Plus className="h-2.5 w-2.5 text-violet-500 transition-transform group-hover:rotate-90" />
              <span>{`{{${variable}}}`}</span>
            </button>
          ))
        ) : (
          <span className="text-[11px] text-slate-400 italic">
            All supported variables are already present in this template.
          </span>
        )}
      </div>

      {/* ContentEditable Area with Custom Scroll */}
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={() => {
          saveSelection();
          onChange(ref.current?.innerHTML || '');
        }}
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
        onFocus={saveSelection}
        className="min-h-[220px] max-h-[380px] overflow-y-auto custom-scrollbar p-4 text-sm leading-6 outline-none text-slate-800 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-slate-900 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-slate-900 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-1 [&_p]:mb-2.5"
      />
    </div>
  );
}

const belongsToScope = (event: EmailEvent, scope: EmailTemplateScope) =>
  scope === 'RECRUITMENT' ? event.eventCode.startsWith('RECRUITMENT_') : !event.eventCode.startsWith('RECRUITMENT_');

export default function EmailTemplateLibrary({ canManage, scope = 'RECRUITMENT' }: { canManage: boolean; scope?: EmailTemplateScope }) {
  const [events, setEvents] = useState<EmailEvent[]>([]);
  const [eventCode, setEventCode] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [attachmentMode, setAttachmentMode] = useState<AttachmentMode>('NONE');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplateIsDefault, setEditingTemplateIsDefault] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EmailTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState('');
  const [createSubject, setCreateSubject] = useState('');
  const [createBody, setCreateBody] = useState('<p>Dear {{candidate_name}},</p><p>Write your message here.</p>');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [eventFilter, setEventFilter] = useState('');

  const visibleEvents = events.filter((event) => belongsToScope(event, scope));
  const filteredEvents = visibleEvents.filter(
    (event) =>
      event.name.toLowerCase().includes(eventFilter.toLowerCase()) ||
      event.eventCode.toLowerCase().includes(eventFilter.toLowerCase())
  );
  const selectedEvent = visibleEvents.find((event) => event.eventCode === eventCode);
  const selectedTemplate = selectedEvent?.templates.find((template) => template.id === templateId);

  const load = async (preferredEvent = eventCode, preferredTemplate = templateId) => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<{ data?: { emailEvents?: EmailEvent[] }; emailEvents?: EmailEvent[] }>('/recruitment/admin/settings', {
        params: { section: 'templates' },
      });
      const next = response.data.data?.emailEvents || response.data.emailEvents || [];
      const scopedNext = next.filter((item) => belongsToScope(item, scope));
      setEvents(next);
      const event = scopedNext.find((item) => item.eventCode === preferredEvent) || scopedNext[0];
      const nextTemplateId = preferredTemplate || event?.selectedTemplateId || event?.templates[0]?.id || '';
      const template = event?.templates.find((item) => item.id === nextTemplateId);
      setEventCode(event?.eventCode || '');
      setTemplateId(nextTemplateId);
      setEnabled(event?.enabled ?? true);
      setAttachmentMode(event?.attachmentMode || 'NONE');
      setSubject(template?.subject || '');
      setBody(template?.body || '');
    } catch (requestError) {
      setError(errorText(requestError, 'Unable to load email templates.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [scope]);

  const selectEvent = (nextEvent: EmailEvent) => {
    const nextId = nextEvent.selectedTemplateId || nextEvent.templates[0]?.id || '';
    const template = nextEvent.templates.find((item) => item.id === nextId);
    setEventCode(nextEvent.eventCode);
    setTemplateId(nextId);
    setEnabled(nextEvent.enabled);
    setAttachmentMode(nextEvent.attachmentMode);
    setSubject(template?.subject || '');
    setBody(template?.body || '');
  };

  const selectTemplate = (nextId: string) => {
    const template = selectedEvent?.templates.find((item) => item.id === nextId);
    if (!template) return;
    setTemplateId(nextId);
    setSubject(template.subject);
    setBody(template.body);
    setAttachmentMode(template.attachmentMode);
    void updateRule(nextId, enabled);
  };

  const openCreateModal = () => {
    setModalMode('create');
    setEditingTemplateId(null);
    setEditingTemplateIsDefault(false);
    setName('');
    setCreateSubject(initialSubjectFor(selectedEvent));
    setCreateBody(initialMessageFor(selectedEvent));
    setModal(true);
  };

  const openEditModal = (template: EmailTemplate) => {
    setModalMode('edit');
    setEditingTemplateId(template.id);
    setEditingTemplateIsDefault(template.isDefault);
    setName(template.name);
    setCreateSubject(template.subject);
    setCreateBody(template.body);
    setModal(true);
  };

  const closeTemplateModal = () => {
    setModal(false);
    setEditingTemplateId(null);
    setEditingTemplateIsDefault(false);
  };

  const updateRule = async (nextTemplateId = templateId, nextEnabled = enabled) => {
    if (!canManage || !eventCode) return;
    setSaving(true);
    setError('');
    try {
      await api.put(`/recruitment/admin/settings/email-rules/${eventCode}`, {
        templateId: nextTemplateId || null,
        enabled: nextEnabled,
      });
      setEnabled(nextEnabled);
      setEvents((current) =>
        current.map((event) =>
          event.eventCode === eventCode ? { ...event, enabled: nextEnabled, selectedTemplateId: nextTemplateId || null } : event
        )
      );
      setNotice('Email delivery rule saved.');
      toast.success('Email delivery rule saved.');
    } catch (requestError) {
      const message = errorText(requestError, 'Unable to save email delivery rule.');
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const saveTemplateModal = async () => {
    if (!canManage || !eventCode || !createSubject.trim() || !createBody.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (modalMode === 'edit' && editingTemplateId) {
        await api.put(`/recruitment/admin/settings/templates/${editingTemplateId}`, {
          name: name.trim(),
          subject: createSubject,
          bodyHtml: createBody,
          enabled,
          attachmentMode,
        });
        setNotice('Email template updated successfully.');
        toast.success('Email template updated successfully.');
        closeTemplateModal();
        await load(eventCode, editingTemplateId);
      } else {
        const response = await api.post<{ template: EmailTemplate }>('/recruitment/admin/settings/templates', {
          eventCode,
          name: name.trim(),
          subject: createSubject,
          bodyHtml: createBody,
          enabled: true,
          select: true,
        });
        await api.put(`/recruitment/admin/settings/email-rules/${eventCode}`, { templateId: response.data.template.id, enabled: true });
        setNotice('Email template created and selected.');
        toast.success('Email template created and selected.');
        closeTemplateModal();
        await load(eventCode, response.data.template.id);
      }
    } catch (requestError) {
      const message = errorText(requestError, modalMode === 'edit' ? 'Unable to update email template.' : 'Unable to create email template.');
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async () => {
    if (!canManage || !deleteTarget) return;
    setDeleting(true);
    setError('');
    try {
      const response = await api.delete<{ fallbackTemplateId?: string | null }>(`/recruitment/admin/settings/templates/${deleteTarget.id}`);
      setDeleteTarget(null);
      setNotice('Email template deleted. The event now uses its default template.');
      toast.success('Email template deleted successfully. The default template is active now.');
      await load(eventCode, response.data.fallbackTemplateId || '');
    } catch (requestError) {
      const message = errorText(requestError, 'Unable to delete email template.');
      setError(message);
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  };

  const templateOptions: CustomDropdownOption[] =
    selectedEvent?.templates.map((template) => ({
      value: template.id,
      label: template.name,
      badge: template.isDefault ? 'Default' : undefined,
      description: template.isDefault ? 'System template' : 'Custom template',
      actions: canManage ? (
        <>
          <button
            type="button"
            aria-label={`Edit ${template.name}`}
            title="Edit template"
            onClick={() => {
              openEditModal(template);
              setNotice('');
            }}
            className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {!template.isDefault ? (
            <button
              type="button"
              aria-label={`Delete ${template.name}`}
              title="Delete template"
              onClick={() => {
                setDeleteTarget(template);
                setNotice('');
              }}
              className="rounded-md p-1.5 text-red-500 transition hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </>
      ) : null,
    })) || [];

  return (
    <section className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm sm:p-6 lg:p-7">
      {/* Header Bar */}
      <div className="flex flex-col gap-3 border-b border-gray-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-amber-50 p-2.5 text-[#d99d00]">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {scope === 'RECRUITMENT' ? 'Recruitment Email Automations' : 'Marketplace Email Automations'}
            </h2>
            <p className="mt-1 text-xs text-gray-500 sm:text-sm">
              Event-driven email templates with real-time dynamic attachments and customizable messaging.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
          <Code2 className="h-3.5 w-3.5" /> Event Based
        </span>
      </div>

      {/* Alert Notices */}
      {error ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-[10px] font-bold text-red-700 hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
          {notice}
        </div>
      ) : null}

      {/* Main Layout Grid */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[290px_1fr]">
        {/* Left Column: Events Sidebar with Custom Scroll */}
        <div className="flex flex-col">
          {/* Event Filter & Counter */}
          <div className="relative mb-2.5">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              placeholder="Search events..."
              className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-8.5 pr-8 text-xs font-medium outline-none transition focus:border-[#FFC107] focus:bg-white focus:ring-2 focus:ring-[#FFC107]/20"
            />
            {eventFilter && (
              <button
                type="button"
                onClick={() => setEventFilter('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="mb-2 flex items-center justify-between px-1 text-[11px] font-semibold text-slate-400">
            <span>TRIGGER EVENTS</span>
            <span>{filteredEvents.length} items</span>
          </div>

          {/* Scrollable Event List */}
          <div className="max-h-[640px] overflow-y-auto custom-scrollbar pr-1.5 space-y-2">
            {loading ? (
              <div className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-400">Loading events...</div>
            ) : filteredEvents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-xs text-slate-400">
                {eventFilter ? 'No events matching filter.' : 'No email events found.'}
              </div>
            ) : (
              filteredEvents.map((event) => {
                const isSelected = eventCode === event.eventCode;
                return (
                  <button
                    key={event.eventCode}
                    type="button"
                    onClick={() => selectEvent(event)}
                    className={`group relative w-full rounded-xl border p-3 text-left transition-all duration-150 ${
                      isSelected
                        ? 'border-[#FFC107] bg-gradient-to-r from-amber-50/90 to-amber-50/40 text-amber-950 shadow-sm ring-1 ring-[#FFC107]/40'
                        : 'border-slate-200/90 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold leading-snug line-clamp-2">{event.name}</span>
                      <span
                        className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                          event.enabled ? 'bg-emerald-500 ring-2 ring-emerald-100' : 'bg-slate-300'
                        }`}
                        title={event.enabled ? 'Automation enabled' : 'Automation disabled'}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] text-slate-400 truncate max-w-[150px]">{event.eventCode}</span>
                      <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500 group-hover:bg-slate-200/60">
                        {event.templates.length} {event.templates.length === 1 ? 'tpl' : 'tpls'}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Template Editor & Preview */}
        <div className="min-w-0 space-y-5">
          {selectedEvent ? (
            <>
              {/* Event Automation Status Bar */}
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between shadow-2xs">
                <div>
                  <p className="text-xs font-extrabold text-slate-900">{selectedEvent.name} Automation</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    When turned off, system triggers for this event will be silently ignored.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {enabled ? 'Active' : 'Paused'}
                  </span>
                  <Toggle
                    checked={enabled}
                    disabled={!canManage || saving}
                    onChange={(value) => {
                      setEnabled(value);
                      void updateRule(templateId, value);
                    }}
                  />
                </div>
              </div>

              {/* Template Selection Row with Custom Dropdown */}
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 sm:flex-row sm:items-center sm:justify-between shadow-2xs">
                <div>
                  <p className="text-xs font-extrabold text-slate-900">Email Template Variant</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Choose which template gets dispatched, or design a new one.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <CustomDropdown
                    options={templateOptions}
                    value={templateId}
                    onChange={(val) => selectTemplate(val)}
                    placeholder="Select email template"
                    disabled={!canManage || saving}
                    className="w-full sm:w-72"
                    buttonClassName="w-full font-semibold"
                    menuClassName="w-full sm:w-72"
                  />
                  <button
                    type="button"
                    disabled={!canManage}
                    onClick={openCreateModal}
                    className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#FFC107] px-3.5 text-xs font-bold text-black shadow-xs transition hover:bg-[#E5AD06] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Create</span>
                  </button>
                </div>
              </div>

              {selectedTemplate ? (
                <>
                  {/* Read-only template preview. Editing is intentionally isolated in the modal. */}
                  <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Eye className="h-4 w-4 text-slate-500" />
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-700">Template Preview</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        Read only
                      </span>
                    </div>
                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
                      <div className="mb-3 border-b border-slate-200/70 pb-3 text-sm">
                        <span className="font-bold text-slate-500">Subject: </span>
                        <span className="font-semibold text-slate-900">{subject || '(No subject entered)'}</span>
                      </div>
                      <div
                        className="max-h-[340px] overflow-y-auto custom-scrollbar text-sm leading-6 text-slate-700 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-slate-900 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-slate-900 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-2"
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(body || '<p class="text-slate-400 italic">No template content.</p>'),
                        }}
                      />
                    </div>
                  </div>

                  {/* Attachment Rule Box */}
                  <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-amber-50 p-2 text-amber-700">
                          <Paperclip className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs font-extrabold text-slate-900">Attachment Policy</p>
                          <p className="text-[11px] text-slate-500">Live dynamic attachments generated at dispatch</p>
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase ${
                          attachmentMode === 'NONE'
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                        }`}
                      >
                        {attachmentMode === 'NONE' ? 'Text / HTML Only' : 'Auto PDF Attached'}
                      </span>
                    </div>
                    <div
                      className={`mt-3 rounded-xl p-3 text-xs leading-relaxed ${
                        attachmentMode === 'NONE'
                          ? 'bg-slate-50 text-slate-600 border border-slate-200/60'
                          : 'bg-emerald-50/70 text-emerald-900 border border-emerald-200/60'
                      }`}
                    >
                      <strong className="block font-semibold">
                        {attachmentMode === 'NONE' ? 'No document attached' : 'Attached automatically when the email is sent'}
                      </strong>
                      <span className="text-[11px] text-slate-600">
                        {ATTACHMENT_DESCRIPTIONS[attachmentMode] ?? ATTACHMENT_DESCRIPTIONS.NONE}
                      </span>
                    </div>
                  </div>

                  {/* Supported event values */}
                  <div>
                    {/* Supported Variables */}
                    <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-700">Supported Values</p>
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800">
                          {selectedEvent.variables.length} available
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Click any value tag below to quickly copy it to clipboard.
                      </p>
                      <div className="mt-3 max-h-[260px] overflow-y-auto custom-scrollbar flex flex-wrap gap-1.5 pr-1">
                        {selectedEvent.variables.map((variable) => (
                          <button
                            key={variable}
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(`{{${variable}}}`);
                              setNotice(`Copied {{${variable}}} to clipboard!`);
                              setTimeout(() => setNotice(''), 2500);
                            }}
                            title="Click to copy"
                            className="group inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50/80 px-2.5 py-1 font-mono text-[11px] font-semibold text-violet-700 shadow-2xs transition hover:border-violet-300 hover:bg-violet-100"
                          >
                            <span>{`{{${variable}}}`}</span>
                            <Copy className="h-2.5 w-2.5 opacity-40 transition group-hover:opacity-100" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/80 p-8 text-center text-sm text-amber-900">
                  <p className="font-bold">No template exists for this event yet.</p>
                  <p className="mt-1 text-xs text-amber-700">Click &quot;Create&quot; above to add the first template for this event.</p>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-12 text-center text-sm text-slate-500">
              Select an event from the left list to configure its email template.
            </div>
          )}
        </div>
      </div>

      {/* Shared create/edit modal. The page behind it remains preview-only. */}
      {modal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {modalMode === 'edit' ? 'Edit Email Template' : 'Create Email Template'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Event: <span className="font-semibold text-slate-800">{selectedEvent?.name}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={closeTemplateModal}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body with Custom Scroll */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Template Name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={modalMode === 'edit' && editingTemplateIsDefault}
                  placeholder="Example: Offer Letter - Formal Standard"
                  className="mt-1.5 h-11 w-full rounded-xl border border-slate-200/90 px-3.5 text-sm font-medium normal-case outline-none transition focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                />
                {modalMode === 'edit' && editingTemplateIsDefault ? (
                  <span className="mt-1 block text-[11px] font-normal normal-case text-slate-400">
                    System template names are fixed; subject and message can still be edited.
                  </span>
                ) : null}
              </label>

              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Subject Line
                <input
                  value={createSubject}
                  onChange={(e) => setCreateSubject(e.target.value)}
                  placeholder="Enter email subject line..."
                  className="mt-1.5 h-11 w-full rounded-xl border border-slate-200/90 px-3.5 text-sm font-medium normal-case outline-none transition focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20"
                />
              </label>

              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">Message Body</p>
                <RichEmailEditor
                  value={createBody}
                  onChange={setCreateBody}
                  variables={availableVariablesFor(selectedEvent?.variables || [], createBody)}
                  disabled={saving}
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4 bg-slate-50/60 rounded-b-2xl">
              <button
                type="button"
                onClick={closeTemplateModal}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canManage || saving || !name.trim() || !createSubject.trim() || !createBody.trim()}
                onClick={() => void saveTemplateModal()}
                className="rounded-xl bg-[#FFC107] px-5 py-2.5 text-xs font-bold text-black shadow-xs transition hover:bg-[#E5AD06] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Saving...' : modalMode === 'edit' ? 'Save Changes' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-red-50 p-2.5 text-red-600">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete email template?</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  “{deleteTarget.name}” will be removed from this event. Existing delivery history will remain, and future deliveries will safely use the default template.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void deleteTemplate()}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete template'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
