import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUrlButtonParameter,
  findDynamicUrlButtons,
  getTemplateBodyVariableCount,
  getTemplateButtons,
  getTemplateHeaderFormat,
  getTemplateHeaderTextVariableCount,
  isTemplateDefinitionKnown,
} from './metaTemplateDefinition';

// The shape returned by Meta's message_templates API.
const synced = [
  { type: 'HEADER', format: 'DOCUMENT', example: { header_handle: ['https://example.invalid/sample.pdf'] } },
  { type: 'BODY', text: 'Hello {{1}}, your offer for {{4}} is ready. Reply before {{7}}.' },
  { type: 'FOOTER', text: 'JCB Exchange' },
  {
    type: 'BUTTONS',
    buttons: [
      { type: 'QUICK_REPLY', text: 'Call me back' },
      { type: 'URL', text: 'Help', url: 'https://jcbexchange.com/help' },
      { type: 'URL', text: 'View offer', url: 'https://jcbexchange.com/o/{{1}}', example: ['https://jcbexchange.com/o/Ab3dEf7h'] },
    ],
  },
];

test('reads the header format, body placeholder count and buttons of a synced template', () => {
  assert.equal(isTemplateDefinitionKnown(synced), true);
  assert.equal(getTemplateHeaderFormat(synced), 'DOCUMENT');
  assert.equal(getTemplateBodyVariableCount(synced), 7);
  assert.deepEqual(getTemplateButtons(synced).map((button) => [button.index, button.type]), [[0, 'QUICK_REPLY'], [1, 'URL'], [2, 'URL']]);
});

test('only URL buttons with {{1}} are dynamic, and keep their index in the buttons array', () => {
  assert.deepEqual(findDynamicUrlButtons(synced), [{ index: 2, type: 'URL', text: 'View offer', url: 'https://jcbexchange.com/o/{{1}}' }]);
});

test('component and button types are matched case-insensitively, {{ 1 }} with spaces too', () => {
  const lower = [{ type: 'header', format: 'document' }, { type: 'buttons', buttons: [{ type: 'url', text: 'Open', url: 'https://x.test/o/{{ 1 }}' }] }];
  assert.equal(getTemplateHeaderFormat(lower), 'DOCUMENT');
  assert.equal(findDynamicUrlButtons(lower)[0]?.index, 0);
});

test('an unknown body is null, a body without placeholders is 0', () => {
  assert.equal(getTemplateBodyVariableCount(null), null);
  assert.equal(getTemplateBodyVariableCount([{ type: 'HEADER', format: 'DOCUMENT' }]), null);
  assert.equal(getTemplateBodyVariableCount([{ type: 'BODY', text: 'No variables here.' }]), 0);
});

test('no header, no buttons and unsynced definitions are reported as such', () => {
  assert.equal(getTemplateHeaderFormat([{ type: 'BODY', text: 'x' }]), null);
  assert.equal(getTemplateHeaderFormat([{ type: 'HEADER', text: 'Plain header' }]), 'TEXT');
  assert.deepEqual(findDynamicUrlButtons([{ type: 'BODY', text: 'x' }]), []);
  assert.deepEqual(findDynamicUrlButtons({ not: 'an array' }), []);
  assert.equal(isTemplateDefinitionKnown(null), false);
  assert.equal(isTemplateDefinitionKnown([]), false);
});

test('counts the variables of a text header only', () => {
  assert.equal(getTemplateHeaderTextVariableCount([{ type: 'HEADER', format: 'TEXT', text: 'Hi {{1}}' }]), 1);
  assert.equal(getTemplateHeaderTextVariableCount([{ type: 'HEADER', format: 'DOCUMENT' }]), 0);
});

test('builds the send-request button component Meta expects', () => {
  assert.deepEqual(buildUrlButtonParameter(2, 'Ab3dEf7h'), {
    type: 'button',
    sub_type: 'url',
    index: '2',
    parameters: [{ type: 'text', text: 'Ab3dEf7h' }],
  });
});
