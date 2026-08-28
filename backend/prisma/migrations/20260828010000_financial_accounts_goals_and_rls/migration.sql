-- Flexible account, category, and goal models for a complete personal finance ledger.

CREATE TYPE "AccountType" AS ENUM ('CASH', 'BANK', 'WALLET', 'SAVINGS', 'INVESTMENT', 'OTHER');
CREATE TYPE "CurrencyCode" AS ENUM ('PEN', 'USD');
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- Categories remain backwards compatible (the existing enum values become system
-- category names) while allowing each user to add their own categories.
DROP INDEX "Category_name_key";
ALTER TABLE "Category" ALTER COLUMN "name" TYPE VARCHAR(80) USING "name"::text;
ALTER TABLE "Category" ADD COLUMN "userId" TEXT;
ALTER TABLE "Category" ADD COLUMN "icon" VARCHAR(40);
ALTER TABLE "Category" ADD COLUMN "color" VARCHAR(7);
ALTER TABLE "Category" ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Category" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Category" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "Category" SET "isSystem" = true WHERE "userId" IS NULL;
ALTER TABLE "Category" ALTER COLUMN "updatedAt" DROP DEFAULT;
DROP TYPE "CategoryType";

CREATE UNIQUE INDEX "Category_userId_name_key" ON "Category"("userId", "name");
CREATE UNIQUE INDEX "Category_system_name_key" ON "Category"("name") WHERE "userId" IS NULL;
CREATE INDEX "Category_userId_isActive_idx" ON "Category"("userId", "isActive");
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Account" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "type" "AccountType" NOT NULL,
  "currency" "CurrencyCode" NOT NULL DEFAULT 'PEN',
  "initialBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "institution" VARCHAR(80),
  "lastFour" VARCHAR(4),
  "color" VARCHAR(7),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Account_userId_name_key" ON "Account"("userId", "name");
CREATE INDEX "Account_userId_isActive_idx" ON "Account"("userId", "isActive");
CREATE INDEX "Account_userId_type_idx" ON "Account"("userId", "type");
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every existing user receives accounts corresponding to the legacy payment methods.
INSERT INTO "Account" (
  "id", "userId", "name", "type", "currency", "initialBalance", "createdAt", "updatedAt"
)
SELECT
  substr(md5(u."id" || ':cash'), 1, 8) || '-' ||
  substr(md5(u."id" || ':cash'), 9, 4) || '-' ||
  substr(md5(u."id" || ':cash'), 13, 4) || '-' ||
  substr(md5(u."id" || ':cash'), 17, 4) || '-' ||
  substr(md5(u."id" || ':cash'), 21, 12),
  u."id", 'Efectivo', 'CASH', 'PEN', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" u
ON CONFLICT ("userId", "name") DO NOTHING;

INSERT INTO "Account" (
  "id", "userId", "name", "type", "currency", "initialBalance", "institution", "createdAt", "updatedAt"
)
SELECT
  substr(md5(u."id" || ':yape'), 1, 8) || '-' ||
  substr(md5(u."id" || ':yape'), 9, 4) || '-' ||
  substr(md5(u."id" || ':yape'), 13, 4) || '-' ||
  substr(md5(u."id" || ':yape'), 17, 4) || '-' ||
  substr(md5(u."id" || ':yape'), 21, 12),
  u."id", 'Yape', 'WALLET', 'PEN', 0, 'Yape', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" u
ON CONFLICT ("userId", "name") DO NOTHING;

INSERT INTO "Account" (
  "id", "userId", "name", "type", "currency", "initialBalance", "createdAt", "updatedAt"
)
SELECT
  substr(md5(u."id" || ':bank'), 1, 8) || '-' ||
  substr(md5(u."id" || ':bank'), 9, 4) || '-' ||
  substr(md5(u."id" || ':bank'), 13, 4) || '-' ||
  substr(md5(u."id" || ':bank'), 17, 4) || '-' ||
  substr(md5(u."id" || ':bank'), 21, 12),
  u."id", 'Cuenta bancaria', 'BANK', 'PEN', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" u
ON CONFLICT ("userId", "name") DO NOTHING;

ALTER TABLE "Movement" ALTER COLUMN "amount" TYPE DECIMAL(14,2);
ALTER TABLE "Movement" ADD COLUMN "sourceAccountId" TEXT;
ALTER TABLE "Movement" ADD COLUMN "destinationAccountId" TEXT;

UPDATE "Movement" m
SET "sourceAccountId" = a."id"
FROM "Account" a
WHERE m."type" IN ('EXPENSE', 'TRANSFER')
  AND a."userId" = m."userId"
  AND a."name" = CASE m."paymentMethod"::text
    WHEN 'CASH' THEN 'Efectivo'
    WHEN 'YAPE' THEN 'Yape'
    ELSE 'Cuenta bancaria'
  END;

UPDATE "Movement" m
SET "destinationAccountId" = a."id"
FROM "Account" a
WHERE m."type" = 'INCOME'
  AND a."userId" = m."userId"
  AND a."name" = CASE m."paymentMethod"::text
    WHEN 'CASH' THEN 'Efectivo'
    WHEN 'YAPE' THEN 'Yape'
    ELSE 'Cuenta bancaria'
  END;

UPDATE "Movement" m
SET "destinationAccountId" = a."id"
FROM "Account" a
WHERE m."type" = 'TRANSFER'
  AND a."userId" = m."userId"
  AND a."name" = CASE m."destinationPaymentMethod"::text
    WHEN 'CASH' THEN 'Efectivo'
    WHEN 'YAPE' THEN 'Yape'
    ELSE 'Cuenta bancaria'
  END;

CREATE INDEX "Movement_userId_date_idx" ON "Movement"("userId", "date");
CREATE INDEX "Movement_userId_type_date_idx" ON "Movement"("userId", "type", "date");
CREATE INDEX "Movement_sourceAccountId_date_idx" ON "Movement"("sourceAccountId", "date");
CREATE INDEX "Movement_destinationAccountId_date_idx" ON "Movement"("destinationAccountId", "date");
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_sourceAccountId_fkey"
  FOREIGN KEY ("sourceAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_destinationAccountId_fkey"
  FOREIGN KEY ("destinationAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Budget" ALTER COLUMN "amount" TYPE DECIMAL(14,2);
CREATE INDEX "Budget_userId_categoryId_startDate_endDate_idx"
  ON "Budget"("userId", "categoryId", "startDate", "endDate");

CREATE TABLE "SavingsGoal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accountId" TEXT,
  "name" VARCHAR(100) NOT NULL,
  "targetAmount" DECIMAL(14,2) NOT NULL,
  "currentAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "deadline" TIMESTAMP(3),
  "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
  "color" VARCHAR(7),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SavingsGoal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SavingsGoal_userId_status_idx" ON "SavingsGoal"("userId", "status");
CREATE INDEX "SavingsGoal_accountId_idx" ON "SavingsGoal"("accountId");
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Defense in depth for Supabase's exposed public schema. The backend's database
-- role continues to work, while Data API callers can only access their own rows.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Movement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Budget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SavingsGoal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "_prisma_migrations" FROM anon, authenticated;

CREATE POLICY "user_select_own" ON "User"
  FOR SELECT TO authenticated
  USING ("authUserId" = (SELECT auth.uid())::text);

CREATE POLICY "category_select_available" ON "Category"
  FOR SELECT TO authenticated
  USING (
    "userId" IS NULL OR EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."id" = "Category"."userId"
        AND u."authUserId" = (SELECT auth.uid())::text
    )
  );
CREATE POLICY "category_insert_own" ON "Category"
  FOR INSERT TO authenticated
  WITH CHECK (
    NOT "isSystem" AND EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."id" = "Category"."userId"
        AND u."authUserId" = (SELECT auth.uid())::text
    )
  );
CREATE POLICY "category_update_own" ON "Category"
  FOR UPDATE TO authenticated
  USING (
    NOT "isSystem" AND EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."id" = "Category"."userId"
        AND u."authUserId" = (SELECT auth.uid())::text
    )
  )
  WITH CHECK (
    NOT "isSystem" AND EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."id" = "Category"."userId"
        AND u."authUserId" = (SELECT auth.uid())::text
    )
  );
CREATE POLICY "category_delete_own" ON "Category"
  FOR DELETE TO authenticated
  USING (
    NOT "isSystem" AND EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."id" = "Category"."userId"
        AND u."authUserId" = (SELECT auth.uid())::text
    )
  );

CREATE POLICY "account_manage_own" ON "Account"
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."id" = "Account"."userId"
        AND u."authUserId" = (SELECT auth.uid())::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."id" = "Account"."userId"
        AND u."authUserId" = (SELECT auth.uid())::text
    )
  );

CREATE POLICY "movement_manage_own" ON "Movement"
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."id" = "Movement"."userId"
        AND u."authUserId" = (SELECT auth.uid())::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."id" = "Movement"."userId"
        AND u."authUserId" = (SELECT auth.uid())::text
    )
    AND (
      "sourceAccountId" IS NULL OR EXISTS (
        SELECT 1 FROM "Account" a
        WHERE a."id" = "Movement"."sourceAccountId"
          AND a."userId" = "Movement"."userId"
      )
    )
    AND (
      "destinationAccountId" IS NULL OR EXISTS (
        SELECT 1 FROM "Account" a
        WHERE a."id" = "Movement"."destinationAccountId"
          AND a."userId" = "Movement"."userId"
      )
    )
    AND (
      "categoryId" IS NULL OR EXISTS (
        SELECT 1 FROM "Category" c
        WHERE c."id" = "Movement"."categoryId"
          AND (c."userId" IS NULL OR c."userId" = "Movement"."userId")
      )
    )
  );

CREATE POLICY "budget_manage_own" ON "Budget"
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."id" = "Budget"."userId"
        AND u."authUserId" = (SELECT auth.uid())::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."id" = "Budget"."userId"
        AND u."authUserId" = (SELECT auth.uid())::text
    )
    AND EXISTS (
      SELECT 1 FROM "Category" c
      WHERE c."id" = "Budget"."categoryId"
        AND (c."userId" IS NULL OR c."userId" = "Budget"."userId")
    )
  );

CREATE POLICY "savings_goal_manage_own" ON "SavingsGoal"
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."id" = "SavingsGoal"."userId"
        AND u."authUserId" = (SELECT auth.uid())::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."id" = "SavingsGoal"."userId"
        AND u."authUserId" = (SELECT auth.uid())::text
    )
    AND (
      "accountId" IS NULL OR EXISTS (
        SELECT 1 FROM "Account" a
        WHERE a."id" = "SavingsGoal"."accountId"
          AND a."userId" = "SavingsGoal"."userId"
          AND a."type" IN ('SAVINGS', 'INVESTMENT')
      )
    )
  );
