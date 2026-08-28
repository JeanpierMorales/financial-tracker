ALTER TABLE "Budget" ADD COLUMN "categoryId" TEXT;
INSERT INTO "Category" ("id", "name", "createdAt") VALUES ('00000000-0000-0000-0000-000000000007', 'OTHER', CURRENT_TIMESTAMP) ON CONFLICT ("name") DO NOTHING;
UPDATE "Budget" SET "categoryId" = (SELECT "id" FROM "Category" WHERE "name" = 'OTHER' LIMIT 1) WHERE "categoryId" IS NULL;
ALTER TABLE "Budget" ALTER COLUMN "categoryId" SET NOT NULL;
CREATE INDEX "Budget_categoryId_idx" ON "Budget"("categoryId");
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
