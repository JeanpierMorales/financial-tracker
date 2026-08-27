import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "../config/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { getOrCreateUser } from "../utils/user.js";

const budgetSchema = z.object({
  amount: z.number().positive(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

const updateBudgetSchema = budgetSchema.partial();

const security = [
  {
    bearerAuth: [],
  },
];

export async function budgetRoutes(app: FastifyInstance) {
  // CREATE
  app.post(
    "/api/budgets",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Budgets"],
        summary: "Create budget",
        security,
      },
    },
    async (request, reply) => {
      const result = budgetSchema.safeParse(request.body);

      if (!result.success) {
        return reply.status(400).send({
          error: "Invalid data",
          details: result.error.flatten(),
        });
      }

      const data = result.data;

      if (data.endDate < data.startDate) {
        return reply.status(400).send({
          error: "End date must be after start date",
        });
      }

      const user = await getOrCreateUser(request.user);

      const budget = await prisma.budget.create({
        data: {
          userId: user.id,
          amount: data.amount,
          startDate: data.startDate,
          endDate: data.endDate,
        },
      });

      return reply.status(201).send(budget);
    },
  );

  // GET ALL
  app.get(
    "/api/budgets",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Budgets"],
        summary: "Get budgets",
        security,
      },
    },
    async (request, reply) => {
      const user = await getOrCreateUser(request.user);

      const budgets = await prisma.budget.findMany({
        where: {
          userId: user.id,
        },
        orderBy: {
          startDate: "desc",
        },
      });

      return reply.send(budgets);
    },
  );

  // GET BY ID
  app.get(
    "/api/budgets/:id",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Budgets"],
        summary: "Get budget by ID",
        security,
      },
    },
    async (request, reply) => {
      const { id } = request.params as {
        id: string;
      };

      const user = await getOrCreateUser(request.user);

      const budget = await prisma.budget.findFirst({
        where: {
          id,
          userId: user.id,
        },
      });

      if (!budget) {
        return reply.status(404).send({
          error: "Budget not found",
        });
      }

      return reply.send(budget);
    },
  );

  // UPDATE
  app.patch(
    "/api/budgets/:id",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Budgets"],
        summary: "Update budget",
        security,
      },
    },
    async (request, reply) => {
      const { id } = request.params as {
        id: string;
      };

      const result = updateBudgetSchema.safeParse(request.body);

      if (!result.success) {
        return reply.status(400).send({
          error: "Invalid data",
          details: result.error.flatten(),
        });
      }

      const user = await getOrCreateUser(request.user);

      const existing = await prisma.budget.findFirst({
        where: {
          id,
          userId: user.id,
        },
      });

      if (!existing) {
        return reply.status(404).send({
          error: "Budget not found",
        });
      }

      const data = result.data;

      const startDate = data.startDate ?? existing.startDate;
      const endDate = data.endDate ?? existing.endDate;

      if (endDate < startDate) {
        return reply.status(400).send({
          error: "End date must be after start date",
        });
      }

      const budget = await prisma.budget.update({
        where: {
          id,
        },
        data: {
          ...(data.amount !== undefined && {
            amount: data.amount,
          }),

          ...(data.startDate !== undefined && {
            startDate: data.startDate,
          }),

          ...(data.endDate !== undefined && {
            endDate: data.endDate,
          }),
        },
      });

      return reply.send(budget);
    },
  );

  // DELETE
  app.delete(
    "/api/budgets/:id",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Budgets"],
        summary: "Delete budget",
        security,
      },
    },
    async (request, reply) => {
      const { id } = request.params as {
        id: string;
      };

      const user = await getOrCreateUser(request.user);

      const existing = await prisma.budget.findFirst({
        where: {
          id,
          userId: user.id,
        },
      });

      if (!existing) {
        return reply.status(404).send({
          error: "Budget not found",
        });
      }

      await prisma.budget.delete({
        where: {
          id,
        },
      });

      return reply.send({
        message: "Budget deleted successfully",
      });
    },
  );
}