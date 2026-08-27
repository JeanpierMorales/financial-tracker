ALTER TYPE "MovementType" ADD VALUE 'TRANSFER';

ALTER TABLE "Movement" ADD COLUMN "destinationPaymentMethod" "PaymentMethod";
