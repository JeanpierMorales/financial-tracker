import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "../config/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { getOrCreateUser } from "../utils/user.js";

const movementSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
  amount: z.number().positive(),
  categoryId: z.string().uuid().optional(),
  description: z.string().max(255).optional(),
  date: z.coerce.date(),
  paymentMethod: z.enum([
    "CASH",
    "YAPE",
    "BANK_TRANSFER",
  ]),
  destinationPaymentMethod: z.enum([
    "CASH",
    "YAPE",
    "BANK_TRANSFER",
  ]).optional(),
});

const updateMovementSchema = movementSchema.partial();

const security = [
  {
    bearerAuth: [],
  },
];

const endOfDay = (value: string) => {
  const date = new Date(value);
  if (!value.includes("T")) date.setUTCHours(23, 59, 59, 999);
  return date;
};

export async function movementRoutes(app: FastifyInstance) {
  app.post(
    "/api/movements",
    {
      preHandler: authenticate,

      schema: {
        tags: ["Movements"],
        summary: "Create a movement",
        security,
      },
    },

    async (request, reply) => {
      const result = movementSchema.safeParse(request.body);

      if (!result.success) {
        return reply.status(400).send({
          error: "Invalid data",
          details: result.error.flatten(),
        });
      }

      const data = result.data;

      if (data.type === "EXPENSE" && !data.categoryId) {
        return reply.status(400).send({
          error: "Category is required for expenses",
        });
      }

      if (data.type === "TRANSFER" && (!data.destinationPaymentMethod || data.destinationPaymentMethod === data.paymentMethod)) {
        return reply.status(400).send({ error: "A transfer requires a different destination" });
      }

      const user = await getOrCreateUser(request.user);

      const movement = await prisma.movement.create({
        data: {
          userId: user.id,
          type: data.type,
          amount: data.amount,
          categoryId: data.categoryId,
          description: data.description,
          date: data.date,
          paymentMethod: data.paymentMethod,
          destinationPaymentMethod: data.type === "TRANSFER" ? data.destinationPaymentMethod : null,
        },

        include: {
          category: true,
        },
      });

      return reply.status(201).send(movement);
    },
  );

  app.get(
    "/api/movements",
    {
      preHandler: authenticate,

      schema: {
        tags: ["Movements"],
        summary: "Get user movements",
        security,
      },
    },

    async (request, reply) => {
      const query = request.query as {
        type?: "INCOME" | "EXPENSE" | "TRANSFER";
        categoryId?: string;
        paymentMethod?: "CASH" | "YAPE" | "BANK_TRANSFER";
        startDate?: string;
        endDate?: string;
      };

      const user = await getOrCreateUser(request.user);

      const movements = await prisma.movement.findMany({
        where: {
          userId: user.id,

          ...(query.type && {
            type: query.type,
          }),

          ...(query.categoryId && {
            categoryId: query.categoryId,
          }),

          ...(query.paymentMethod && {
            OR: [
              { paymentMethod: query.paymentMethod },
              { destinationPaymentMethod: query.paymentMethod },
            ],
          }),

          ...(query.startDate || query.endDate
            ? {
                date: {
                  ...(query.startDate && {
                    gte: new Date(query.startDate),
                  }),

                  ...(query.endDate && {
                    lte: endOfDay(query.endDate),
                  }),
                },
              }
            : {}),
        },

        include: {
          category: true,
        },

        orderBy: {
          date: "desc",
        },
      });

      return reply.send(movements);
    },
  );

  app.get(
    "/api/movements/:id",
    {
      preHandler: authenticate,

      schema: {
        tags: ["Movements"],
        summary: "Get movement by ID",
        security,
      },
    },

    async (request, reply) => {
      const { id } = request.params as {
        id: string;
      };

      const user = await getOrCreateUser(request.user);

      const movement = await prisma.movement.findFirst({
        where: {
          id,
          userId: user.id,
        },

        include: {
          category: true,
        },
      });

      if (!movement) {
        return reply.status(404).send({
          error: "Movement not found",
        });
      }

      return reply.send(movement);
    },
  );

  app.patch(
    "/api/movements/:id",
    {
      preHandler: authenticate,

      schema: {
        tags: ["Movements"],
        summary: "Update movement",
        security,
      },
    },

    async (request, reply) => {
      const { id } = request.params as {
        id: string;
      };

      const result = updateMovementSchema.safeParse(
        request.body,
      );

      if (!result.success) {
        return reply.status(400).send({
          error: "Invalid data",
          details: result.error.flatten(),
        });
      }

      const user = await getOrCreateUser(request.user);

      const existing = await prisma.movement.findFirst({
        where: {
          id,
          userId: user.id,
        },
      });

      if (!existing) {
        return reply.status(404).send({
          error: "Movement not found",
        });
      }

      const data = result.data;

      const nextType = data.type ?? existing.type;
      const nextSource = data.paymentMethod ?? existing.paymentMethod;
      const nextDestination = data.destinationPaymentMethod ?? existing.destinationPaymentMethod;

      if (
        nextType === "EXPENSE" &&
        data.categoryId === undefined &&
        existing.categoryId === null
      ) {
        return reply.status(400).send({
          error: "Category is required for expenses",
        });
      }


      if (nextType === "TRANSFER" && (!nextDestination || nextDestination === nextSource)) {
        return reply.status(400).send({ error: "A transfer requires a different destination" });
      }

      const movement = await prisma.movement.update({
        where: {
          id,
        },

        data: {
          ...(data.type !== undefined && {
            type: data.type,
          }),

          ...(data.amount !== undefined && {
            amount: data.amount,
          }),

          ...(data.categoryId !== undefined && {
            categoryId: data.categoryId,
          }),

          ...(nextType !== "EXPENSE" && {
            categoryId: null,
          }),

          ...(data.description !== undefined && {
            description: data.description,
          }),

          ...(data.date !== undefined && {
            date: data.date,
          }),

          ...(data.paymentMethod !== undefined && {
            paymentMethod: data.paymentMethod,
          }),

          destinationPaymentMethod: nextType === "TRANSFER" ? nextDestination : null,
        },

        include: {
          category: true,
        },
      });

      return reply.send(movement);
    },
  );

  app.delete(
    "/api/movements/:id",
    {
      preHandler: authenticate,

      schema: {
        tags: ["Movements"],
        summary: "Delete movement",
        security,
      },
    },

    async (request, reply) => {
      const { id } = request.params as {
        id: string;
      };

      const user = await getOrCreateUser(request.user);

      const existing = await prisma.movement.findFirst({
        where: {
          id,
          userId: user.id,
        },
      });

      if (!existing) {
        return reply.status(404).send({
          error: "Movement not found",
        });
      }

      await prisma.movement.delete({
        where: {
          id,
        },
      });

      return reply.send({
        message: "Movement deleted successfully",
      });
    },
  );
}
