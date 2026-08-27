import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const secureConnectionString = new URL(connectionString);
if (!secureConnectionString.searchParams.has("sslmode")) secureConnectionString.searchParams.set("sslmode", "require");

const adapter = new PrismaPg({
  connectionString: secureConnectionString.toString(),
});

export const prisma = new PrismaClient({
  adapter,
});
