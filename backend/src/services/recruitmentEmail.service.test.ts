import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getEmailAttachmentMode,
  renderRecruitmentEmail,
} from './recruitmentEmail.service';

test('renders subject and HTML body with escaped recipient variables', () => {
  const rendered = renderRecruitmentEmail(
    {
      subject: 'Offer for {{candidate_name}} - {{job_title}}',
      bodyHtml: '<p>Dear {{candidate_name}}</p><p>{{joining_date}}</p>',
    },
    {
      candidate_name: '<Asha>',
      job_title: 'State Manager',
      joining_date: '21/11/2026',
    },
  );

  assert.equal(rendered.subject, 'Offer for <Asha> - State Manager');
  assert.equal(rendered.bodyHtml, '<p>Dear &lt;Asha&gt;</p><p>21/11/2026</p>');
});

test('keeps safe response links while stripping unsafe markup', () => {
  const rendered = renderRecruitmentEmail(
    { subject: 'Offer', bodyHtml: '<p><a href="{{offer_response_url}}">Respond</a><script>alert(1)</script></p>' },
    { offer_response_url: 'https://portal.example.test/offer-response/token' },
  );
  assert.match(rendered.bodyHtml, /href="https:\/\/portal\.example\.test\/offer-response\/token"/);
  assert.doesNotMatch(rendered.bodyHtml, /script|alert/);
});

test('attachment modes are restricted to supported delivery policies', () => {
  assert.equal(getEmailAttachmentMode('DYNAMIC_OFFER_PDF'), 'DYNAMIC_OFFER_PDF');
  assert.equal(getEmailAttachmentMode('NONE'), 'NONE');
  assert.equal(getEmailAttachmentMode('dummy.pdf'), 'NONE');
});
