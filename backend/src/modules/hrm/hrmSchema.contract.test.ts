import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');

const modelBlock = (name: string) => {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `Expected Prisma model ${name}`);
  return match[1]!;
};

test('defines an HRM employee master separate from auth and finance party records', () => {
  const employee = modelBlock('HrmEmployee');
  assert.match(employee, /employeeCode\s+String\s+@unique/);
  assert.match(employee, /userId\s+String\?\s+@unique/);
  assert.match(employee, /status\s+HrmEmployeeStatus/);
  assert.match(employee, /source\s+HrmEmployeeSource/);
  assert.match(employee, /assignments\s+HrmEmploymentAssignment\[\]/);
  assert.doesNotMatch(employee, /FinParty/);
});

test('defines effective-dated organization, reporting and operator scope records', () => {
  const assignment = modelBlock('HrmEmploymentAssignment');
  const scope = modelBlock('HrmAccessScope');
  assert.match(assignment, /effectiveFrom\s+DateTime/);
  assert.match(assignment, /effectiveTo\s+DateTime\?/);
  assert.match(assignment, /managerEmployeeId\s+String\?/);
  assert.match(assignment, /orgUnitId\s+String/);
  assert.match(scope, /scopeType\s+HrmScopeType/);
  assert.match(scope, /userId\s+String/);
  assert.match(scope, /activeFrom\s+DateTime/);
  assert.match(scope, /activeTo\s+DateTime\?/);
});

test('defines all HRM foundation domains with employee-owned relations', () => {
  for (const model of [
    'HrmOnboardingCase',
    'HrmEmployeeDocument',
    'HrmAttendanceRecord',
    'HrmLeaveRequest',
    'HrmCompensationRevision',
    'HrmPerformanceReview',
    'HrmIncentive',
    'HrmExitCase',
  ]) {
    const block = modelBlock(model);
    assert.match(block, /employeeId\s+String/);
  }
});

test('keeps HRM data additive and does not replace existing User or FinParty masters', () => {
  assert.match(schema, /model User \{/);
  assert.match(schema, /model FinParty \{/);
  assert.match(schema, /model HrmEmployee \{/);
  assert.match(schema, /model HrmEmployeeDocument \{/);
  assert.match(schema, /model HrmCompensationRevision \{/);
});
