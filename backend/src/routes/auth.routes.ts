import type { FastifyInstance } from "fastify";

import { authenticate } from "../middleware/auth.js";
import { getOrCreateUser } from "../utils/user.js";

export async function authRoutes(app: FastifyInstance) {
  app.get(
    "/api/auth/me",
    {
      preHandler: authenticate,

      schema: {
        tags: ["Auth"],
        summary: "Get authenticated user",
        security: [
          {
            bearerAuth: [],
          },
        ],
      },
    },

    async (request, reply) => {
      const user = await getOrCreateUser(request.user);

      return reply.send({
        id: user.id,
        authUserId: user.authUserId,
        email: request.user.email,
      });
    },
  );
}