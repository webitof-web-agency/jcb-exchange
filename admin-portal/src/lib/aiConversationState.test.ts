import assert from 'node:assert/strict';
import test from 'node:test';
import { selectRestoredConversationId, type RestorableConversation } from './aiConversationState';

const conversations: RestorableConversation[] = [
  {
    id: 'older',
    status: 'ACTIVE',
    lastMessageAt: '2026-11-13T10:00:00.000Z',
    updatedAt: '2026-11-13T10:00:00.000Z',
    createdAt: '2026-11-13T09:00:00.000Z',
  },
  {
    id: 'last-viewed',
    status: 'ACTIVE',
    lastMessageAt: '2026-11-14T10:00:00.000Z',
    updatedAt: '2026-11-14T10:00:00.000Z',
    createdAt: '2026-11-14T09:00:00.000Z',
  },
];

test('restores the current conversation when the chat panel is reopened', () => {
  assert.equal(selectRestoredConversationId(conversations, 'last-viewed', null), 'last-viewed');
});

test('restores the remembered conversation after a component remount', () => {
  assert.equal(selectRestoredConversationId(conversations, null, 'last-viewed'), 'last-viewed');
});

test('falls back to the most recently active conversation when no id is remembered', () => {
  assert.equal(selectRestoredConversationId(conversations, null, null), 'last-viewed');
});

test('does not restore a deleted conversation id', () => {
  assert.equal(selectRestoredConversationId(conversations, null, 'deleted'), 'last-viewed');
});

