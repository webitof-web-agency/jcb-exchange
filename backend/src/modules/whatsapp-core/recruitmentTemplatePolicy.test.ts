import test from 'node:test';
import assert from 'node:assert/strict';
import { getRecruitmentTemplateComponents } from './recruitmentTemplatePolicy';

test('recruitment WhatsApp template policy maps offer values into the approved body parameter order', () => {
    assert.deepEqual(getRecruitmentTemplateComponents('RECRUITMENT_OFFER_SENT', {
      candidateName: 'Asha',
      applicationId: 'app-1',
      applicationRef: 'JCB-001',
      jobTitle: 'Site Engineer',
      designation: 'Senior Site Engineer',
    }), [{
      type: 'body',
      parameters: [
        { type: 'text', text: 'Asha' },
        { type: 'text', text: 'app-1' },
        { type: 'text', text: 'JCB-001' },
        { type: 'text', text: 'Site Engineer' },
        { type: 'text', text: 'Senior Site Engineer' },
      ],
    }]);
});

test('uses the approved template placeholder count and includes interview status', () => {
    assert.deepEqual(getRecruitmentTemplateComponents('RECRUITMENT_INTERVIEW_SCHEDULED', {
      candidateName: 'Asha',
      applicationId: 'app-1',
      applicationRef: 'JCB-001',
      jobTitle: 'Site Engineer',
      scheduledAt: '04 Nov 2026, 10:00 AM',
      interviewType: 'VIDEO',
      status: 'SCHEDULED',
    }, [{ type: 'BODY', text: '{{1}} {{2}} {{3}} {{4}} {{5}} {{6}} {{7}}' }]), [{
      type: 'body',
      parameters: [
        { type: 'text', text: 'Asha' },
        { type: 'text', text: 'app-1' },
        { type: 'text', text: 'JCB-001' },
        { type: 'text', text: 'Site Engineer' },
        { type: 'text', text: '04 Nov 2026, 10:00 AM' },
        { type: 'text', text: 'VIDEO' },
        { type: 'text', text: 'SCHEDULED' },
      ],
    }]);
});

test('maps a published job to the five placeholders used by the approved template', () => {
    assert.deepEqual(getRecruitmentTemplateComponents('RECRUITMENT_NEW_JOB_PUBLISHED', {
      jobId: 'job-1',
      jobCode: 'JOB-0101',
      jobTitle: 'Operator',
      jobSlug: 'operator',
      locationCity: 'Raipur',
      locationState: 'Chhattisgarh',
    }, [{ type: 'BODY', text: '{{1}} {{2}} {{3}} {{4}} {{5}}' }]), [{
      type: 'body',
      parameters: [
        { type: 'text', text: 'job-1' },
        { type: 'text', text: 'JOB-0101' },
        { type: 'text', text: 'Operator' },
        { type: 'text', text: 'Raipur' },
        { type: 'text', text: 'Chhattisgarh' },
      ],
    }]);
});
