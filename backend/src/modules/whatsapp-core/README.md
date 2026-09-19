# Reusable WhatsApp Cloud Core

This folder is portable: it has no Prisma schema, routes, UI, or JCB business rules.

Use `encryptWhatsAppCredential` / `decryptWhatsAppCredential` for encrypted credential storage and `sendWhatsAppText` for Meta Cloud API text delivery. Supply the access token, Phone Number ID, Graph API version, recipient, and text from the host application.

The host project must implement its own database adapter, role checks, templates, consent rules, logs, webhook routing, and event triggers. JCB Exchange does that in `src/services/whatsappIntegration.service.ts` and its WhatsApp controllers/routes.
