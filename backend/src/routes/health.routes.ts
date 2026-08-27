import type { FastifyInstance } from "fastify";
import { prisma } from "../config/prisma.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get(
    "/health",
    {
      schema: {
        tags: ["Health"],
        summary: "Check API status",
      },
    },
    async () => {
      return {
        status: "ok",
        message: "Financial Tracker API running",
      };
    },
  );

  app.get(
    "/health/db",
    {
      schema: {
        tags: ["Health"],
        summary: "Check database connection",
      },
    },
    async () => {
      await prisma.$queryRaw`SELECT 1`;

      return {
        status: "ok",
        database: "connected",
      };
    },
  );
}