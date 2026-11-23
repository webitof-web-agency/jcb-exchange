import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTransactionalEmailTestMessage,
  getTransactionalEmailReadiness,
  normalizeTransactionalEmailInput,
} from './transactionalEmail.service';

const current = {
  enabled: false,
  smtpHost: 'smtp.gmail.com',
  smtpPort: 465,
  smtpSecure: true,
  senderEmail: null,
  senderName: 'JCB Exchange',
  replyToEmail: null,
};

test('normalizes SMTP settings while preserving existing values omitted by the form', () => {
  const normalized = normalizeTransactionalEmailInput({
    smtpHost: 'smtp.example.com',
    smtpPort: '587',
    smtpSecure: false,
    senderEmail: 'HR@Example.com',
    replyToEmail: 'replies@example.com',
  }, current);

  assert.deepEqual(normalized, {
    enabled: false,
    smtpHost: 'smtp.example.com',
    smtpPort: 587,
    smtpSecure: false,
    senderEmail: 'hr@example.com',
    senderName: 'JCB Exchange',
    replyToEmail: 'replies@example.com',
  });
});

test('requires valid SMTP host, port and email addresses', () => {
  assert.throws(() => normalizeTransactionalEmailInput({ smtpHost: 'smtp example.com' }, current), /valid SMTP host/);
  assert.throws(() => normalizeTransactionalEmailInput({ smtpPort: 70000 }, current), /SMTP port/);
  assert.throws(() => normalizeTransactionalEmailInput({ senderEmail: 'not-an-email' }, current), /sender email/);
});

test('only reports readiness when sender, password and encryption key are configured', () => {
  const originalSecret = process.env.EMAIL_SETTINGS_SECRET;
  process.env.EMAIL_SETTINGS_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  assert.deepEqual(getTransactionalEmailReadiness({ senderEmail: 'hr@example.com', encryptedSmtpPassword: 'encrypted' }), {
    senderConfigured: true,
    passwordConfigured: true,
    encryptionKeyConfigured: true,
    ready: true,
  });
  if (originalSecret === undefined) delete process.env.EMAIL_SETTINGS_SECRET;
  else process.env.EMAIL_SETTINGS_SECRET = originalSecret;
});

test('builds a safe SMTP test message with reply-to when configured', () => {
  const message = buildTransactionalEmailTestMessage({
    enabled: true,
    smtpHost: 'smtp.example.com',
    smtpPort: 587,
    smtpSecure: false,
    senderEmail: 'hr@example.com',
    senderName: 'JCB Exchange HR',
    replyToEmail: 'replies@example.com',
    smtpPassword: 'secret',
  }, 'admin@example.com');

  assert.equal(message.to, 'admin@example.com');
  assert.equal(message.replyTo, 'replies@example.com');
  assert.match(String(message.subject), /SMTP test email/);
});

