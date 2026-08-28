import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { parsePostgresUrl } from "../src/utils/database-url.js";

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

const prisma = new PrismaClient({
  adapter,
});

const categories = [
  { name: "UNIVERSITY", icon: "graduation-cap", color: "#8B5CF6" },
  { name: "TRANSPORT", icon: "car", color: "#3B82F6" },
  { name: "FOOD", icon: "utensils", color: "#F59E0B" },
  { name: "ENTERTAINMENT", icon: "sparkles", color: "#EC4899" },
  { name: "CLOTHING", icon: "shirt", color: "#14B8A6" },
  { name: "TECHNOLOGY", icon: "laptop", color: "#6366F1" },
  { name: "OTHER", icon: "circle-ellipsis", color: "#64748B" },
];

async function main() {
  for (const category of categories) {
    const existing = await prisma.category.findFirst({
      where: {
        userId: null,
        name: category.name,
      },
    });

    if (existing) {
      await prisma.category.update({
        where: { id: existing.id },
        data: {
          ...category,
          isSystem: true,
          isActive: true,
        },
      });
    } else {
      await prisma.category.create({
        data: {
          ...category,
          isSystem: true,
        },
      });
    }
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
