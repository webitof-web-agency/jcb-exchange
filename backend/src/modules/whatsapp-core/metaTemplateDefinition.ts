/**
 * Reads the template definition synced from Meta (WhatsAppMetaTemplate.components, the `components` array of the
 * message_templates API): which header it has, how many body placeholders, and which URL buttons take a value.
 * The send request must match that definition exactly (Meta rejects a missing or extra parameter), so the senders
 * build their parameters from what is read here. Types are compared case-insensitively: Meta returns upper case,
 * hand-entered definitions are not always. No database here: unit-tested.
 */

type DefinitionComponent = { type?: unknown; format?: unknown; text?: unknown; buttons?: unknown };

const componentType = (component: unknown) => (
  typeof component === 'object' && component !== null
    ? String((component as DefinitionComponent).type ?? '').trim().toUpperCase()
    : ''
);

/** True when a definition was synced (or entered) at all; an unsynced template has no components. */
export const isTemplateDefinitionKnown = (components: unknown): components is unknown[] =>
  Array.isArray(components) && components.length > 0;

export const findTemplateComponent = (components: unknown, type: string): DefinitionComponent | undefined => {
  if (!Array.isArray(components)) return undefined;
  const wanted = type.toUpperCase();
  return components.find((component) => componentType(component) === wanted) as DefinitionComponent | undefined;
};

/** 'DOCUMENT' | 'IMAGE' | 'VIDEO' | 'TEXT' | 'LOCATION' | ... in upper case; null when the template has no header. */
export const getTemplateHeaderFormat = (components: unknown): string | null => {
  const header = findTemplateComponent(components, 'HEADER');
  if (!header) return null;
  // Meta always sends a format; a header without one is a text header.
  return String(header.format ?? 'TEXT').trim().toUpperCase() || 'TEXT';
};

const placeholderIndexes = (text: string) => [...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => Number(match[1]));

/** Highest {{n}} in a text (Meta numbers placeholders 1..n), 0 when there is none. */
export const countTemplatePlaceholders = (text: unknown) => {
  if (typeof text !== 'string') return 0;
  const indexes = placeholderIndexes(text);
  return indexes.length ? Math.max(...indexes) : 0;
};

/**
 * Number of body placeholders, or null when the body is unknown (template not synced). 0 is a real answer: a body
 * without variables must get no body parameters, so callers must not fall back to a default count on 0.
 */
export const getTemplateBodyVariableCount = (components: unknown): number | null => {
  const body = findTemplateComponent(components, 'BODY');
  if (typeof body?.text !== 'string') return null;
  return countTemplatePlaceholders(body.text);
};

/** Number of placeholders in a TEXT header (0 for other headers and for none). */
export const getTemplateHeaderTextVariableCount = (components: unknown) => {
  const header = findTemplateComponent(components, 'HEADER');
  return header && getTemplateHeaderFormat(components) === 'TEXT' ? countTemplatePlaceholders(header.text) : 0;
};

export type TemplateButton = { index: number; type: string; text: string; url: string };

/** Every button in order; `index` is the button's position in the BUTTONS array, as Meta numbers them. */
export const getTemplateButtons = (components: unknown): TemplateButton[] => {
  const buttons = findTemplateComponent(components, 'BUTTONS')?.buttons;
  if (!Array.isArray(buttons)) return [];
  return buttons.map((button, index) => {
    const item = (typeof button === 'object' && button !== null ? button : {}) as { type?: unknown; text?: unknown; url?: unknown };
    return {
      index,
      type: String(item.type ?? '').trim().toUpperCase(),
      text: typeof item.text === 'string' ? item.text : '',
      url: typeof item.url === 'string' ? item.url : '',
    };
  });
};

/**
 * URL buttons whose link ends in a value filled at send time (url contains {{1}}, e.g. https://<site>/o/{{1}}).
 * Each needs a `button` component with sub_type url and that button's index; a static URL button needs nothing.
 */
export const findDynamicUrlButtons = (components: unknown) =>
  getTemplateButtons(components).filter((button) => button.type === 'URL' && /\{\{\s*1\s*\}\}/.test(button.url));

/** The send-request component that fills one dynamic URL button. */
export const buildUrlButtonParameter = (index: number, value: string) => ({
  type: 'button',
  sub_type: 'url',
  index: String(index),
  parameters: [{ type: 'text', text: value }],
});
