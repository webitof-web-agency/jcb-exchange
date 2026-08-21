"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = __importDefault(require("../src/lib/prisma"));
async function migrate() {
    try {
        await prisma_1.default.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "LeadActivity" (
        "id" TEXT NOT NULL,
        "leadId" TEXT NOT NULL,
        "actorId" TEXT,
        "type" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "content" TEXT,
        "metadata" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
      );
    `);
        await prisma_1.default.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "LeadActivity_leadId_createdAt_idx" ON "LeadActivity"("leadId", "createdAt");
    `);
        await prisma_1.default.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'LeadActivity_leadId_fkey'
        ) THEN
          ALTER TABLE "LeadActivity" 
          ADD CONSTRAINT "LeadActivity_leadId_fkey" 
          FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `);
        await prisma_1.default.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'LeadActivity_actorId_fkey'
        ) THEN
          ALTER TABLE "LeadActivity" 
          ADD CONSTRAINT "LeadActivity_actorId_fkey" 
          FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$;
    `);
        console.log('LeadActivity table successfully created/verified.');
    }
    catch (error) {
        console.error('Migration error:', error);
    }
    finally {
        await prisma_1.default.$disconnect();
    }
}
migrate();
//# sourceMappingURL=migrate-lead-activity.js.map