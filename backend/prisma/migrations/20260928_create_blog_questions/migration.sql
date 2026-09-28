CREATE TYPE "BlogQuestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "BlogQuestion" (
    "id" TEXT NOT NULL,
    "blogPostId" TEXT NOT NULL,
    "askedById" TEXT NOT NULL,
    "question" VARCHAR(1000) NOT NULL,
    "answer" TEXT,
    "status" "BlogQuestionStatus" NOT NULL DEFAULT 'PENDING',
    "answeredById" TEXT,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogQuestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BlogQuestion_blogPostId_status_createdAt_idx" ON "BlogQuestion"("blogPostId", "status", "createdAt");
CREATE INDEX "BlogQuestion_askedById_createdAt_idx" ON "BlogQuestion"("askedById", "createdAt");

ALTER TABLE "BlogQuestion" ADD CONSTRAINT "BlogQuestion_blogPostId_fkey"
  FOREIGN KEY ("blogPostId") REFERENCES "BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BlogQuestion" ADD CONSTRAINT "BlogQuestion_askedById_fkey"
  FOREIGN KEY ("askedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BlogQuestion" ADD CONSTRAINT "BlogQuestion_answeredById_fkey"
  FOREIGN KEY ("answeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
