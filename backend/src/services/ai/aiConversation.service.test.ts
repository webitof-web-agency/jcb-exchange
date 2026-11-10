import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AiConversationError,
  AiConversationService,
  type AiConversationMessageRole,
  type AiConversationRepository,
} from './aiConversation.service';

const repositoryMock = (): AiConversationRepository & { calls: Record<string, unknown[]> } => {
  const calls: Record<string, unknown[]> = {};
  const track = <TInput, TResult>(name: string, result: TResult) => async (input: TInput): Promise<TResult> => {
    (calls[name] ??= []).push(input);
    return result;
  };

  return {
    calls,
    createConversation: track('createConversation', { id: 'conversation-1' }),
    listConversations: track('listConversations', []),
    findConversation: track('findConversation', { id: 'conversation-1', actorUserId: 'user-1' }),
    listMessages: track('listMessages', []),
    renameConversation: track('renameConversation', { id: 'conversation-1' }),
    archiveConversation: track('archiveConversation', { id: 'conversation-1' }),
    appendMessage: track('appendMessage', { id: 'message-1' }),
  };
};

test('creates and appends redacted conversation messages without storing raw PII', async () => {
  const repository = repositoryMock();
  const service = new AiConversationService(repository);

  const conversation = await service.createConversation('user-1', 'Review dealer@example.com today');
  assert.equal(conversation.id, 'conversation-1');

  await service.appendMessage('user-1', 'conversation-1', {
    role: 'USER' satisfies AiConversationMessageRole,
    content: 'Review dealer@example.com and 9876543210 today',
    requestId: 'request-1',
  });

  const created = repository.calls.appendMessage?.[0] as { contentRedacted: string; contentHash: string; contentHmac: string };
  assert.equal(created.contentRedacted.includes('dealer@example.com'), false);
  assert.equal(created.contentRedacted.includes('9876543210'), false);
  assert.match(created.contentHash, /^[a-f0-9]{64}$/);
  assert.match(created.contentHmac, /^[a-f0-9]{64}$/);
});

test('rejects appending to a conversation owned by another operator', async () => {
  const repository = repositoryMock();
  repository.findConversation = async () => ({ id: 'conversation-1', actorUserId: 'other-user' });
  const service = new AiConversationService(repository);

  await assert.rejects(
    () => service.appendMessage('user-1', 'conversation-1', { role: 'ASSISTANT', content: 'Safe response' }),
    (error: unknown) => error instanceof AiConversationError && error.code === 'AI_CONVERSATION_FORBIDDEN',
  );
  assert.equal(repository.calls.appendMessage, undefined);
});

test('validates conversation titles and message content', async () => {
  const repository = repositoryMock();
  const service = new AiConversationService(repository);

  await assert.rejects(
    () => service.createConversation('user-1', '   '),
    (error: unknown) => error instanceof AiConversationError && error.code === 'AI_CONVERSATION_TITLE_INVALID',
  );
  await assert.rejects(
    () => service.appendMessage('user-1', 'conversation-1', { role: 'SYSTEM', content: 'unsafe role' }),
    (error: unknown) => error instanceof AiConversationError && error.code === 'AI_CONVERSATION_ROLE_INVALID',
  );
});
