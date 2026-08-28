import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { parsePostgresUrl } from "../utils/database-url.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const secureConnectionString = parsePostgresUrl(connectionString);
secureConnectionString.searchParams.set("sslmode", "require");
secureConnectionString.searchParams.set("uselibpqcompat", "true");

const adapter = new PrismaPg({
  connectionString: secureConnectionString.toString(),
});

export const prisma = new PrismaClient({
  adapter,
});
