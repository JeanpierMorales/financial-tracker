import "dotenv/config";
import { defineConfig } from "prisma/config";

const directUrl = process.env["DIRECT_URL"];
if (!directUrl) throw new Error("DIRECT_URL is not defined");
const secureDirectUrl = new URL(directUrl);
if (!secureDirectUrl.searchParams.has("sslmode")) secureDirectUrl.searchParams.set("sslmode", "require");

export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations",
  },

  datasource: {
    url: secureDirectUrl.toString(),
  },
});
