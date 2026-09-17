-- Phase 4: distinguish internal recruiting recipients from superadmin audit recipients.
ALTER TYPE "WhatsAppRecipientType" ADD VALUE IF NOT EXISTS 'RECRUITER';
