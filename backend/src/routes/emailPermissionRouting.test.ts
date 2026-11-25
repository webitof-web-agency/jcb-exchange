import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const emailRoutes = readFileSync(path.join(process.cwd(), 'src', 'routes', 'email.routes.ts'), 'utf8');
const recruitmentRoutes = readFileSync(path.join(process.cwd(), 'src', 'routes', 'recruitment.routes.ts'), 'utf8');

test('email settings and delivery APIs support admin operators as well as employees', () => {
  assert.match(emailRoutes, /requireAdminOrEmployeePermissions/);
  assert.match(emailRoutes, /const canReadEmail = requireAdminOrEmployeePermissions\(\['email\.read', 'email\.manage'\]\)/);
  assert.match(emailRoutes, /const canManageEmail = requireAdminOrEmployeePermissions\(\['email\.manage'\]\)/);
});

test('email templates use Email Communications permissions instead of recruitment settings permissions', () => {
  assert.match(recruitmentRoutes, /const canViewEmailTemplates = requireAdminOrEmployeePermissions\(\['email\.read', 'email\.manage'\]\)/);
  assert.match(recruitmentRoutes, /section === 'templates'[\s\S]*canViewEmailTemplates\(req, res, next\)/);
  assert.match(recruitmentRoutes, /const canUpdateEmailTemplate = requireAdminOrEmployeePermissions\(\['email\.manage'\]\)/);
  assert.match(recruitmentRoutes, /router\.put\('\/admin\/settings\/templates\/:id', canUpdateEmailTemplate, updateEmailTemplate\)/);
  assert.match(recruitmentRoutes, /router\.delete\('\/admin\/settings\/templates\/:id', canUpdateEmailTemplate, deleteEmailTemplate\)/);
});
