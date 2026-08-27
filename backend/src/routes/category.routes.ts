import type { FastifyInstance } from "fastify";

import { prisma } from "../config/prisma.js";
import { authenticate } from "../middleware/auth.js";

export async function categoryRoutes(app: FastifyInstance) {
  app.get(
    "/api/categories",
    {
      preHandler: authenticate,

      schema: {
        tags: ["Categories"],
        summary: "Get all categories",
        security: [
          {
            bearerAuth: [],
          },
        ],
      },
    },

    async (request, reply) => {
      const categories = await prisma.category.findMany({
        orderBy: {
          name: "asc",
        },
      });

      return reply.send(categories);
    },
  );
}