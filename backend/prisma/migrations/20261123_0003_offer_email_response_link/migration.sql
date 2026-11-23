-- Backfill the existing system offer template with the secure candidate response link.
UPDATE "RecruitmentEmailTemplate"
SET
  "bodyHtml" = '<p>Dear {{candidate_name}},</p><p>We are delighted to extend an offer of employment for the <strong>{{job_title}}</strong> position at JCB Exchange.</p><p>Expected Joining Date: <strong>{{joining_date}}</strong></p><p>Please review the attached offer letter and use the secure link below to accept or decline the offer:</p><p><a href="{{offer_response_url}}">Review offer and respond</a></p><p>Best regards,<br/>Human Resources<br/>JCB Exchange</p>',
  "variables" = ARRAY['candidate_name', 'job_title', 'joining_date', 'company_name', 'designation', 'offer_response_url']
WHERE "code" = 'OFFER_SENT'
  AND "bodyHtml" NOT LIKE '%offer_response_url%';
