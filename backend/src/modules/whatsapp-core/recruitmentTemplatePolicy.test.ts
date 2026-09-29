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
