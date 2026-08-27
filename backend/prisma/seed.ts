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

const prisma = new PrismaClient({
  adapter,
});

const categories = [
  "UNIVERSITY",
  "TRANSPORT",
  "FOOD",
  "ENTERTAINMENT",
  "CLOTHING",
  "TECHNOLOGY",
  "OTHER",
] as const;

async function main() {
  for (const name of categories) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  console.log("Seed completed successfully.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
