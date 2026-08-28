import type { Budget, Category } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "../config/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { getOrCreateUser } from "../utils/user.js";

const budgetSchema = z.object({
  amount: z.number().finite().positive().max(999_999_999_999.99),
  categoryId: z.string().uuid(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

const updateBudgetSchema = budgetSchema.partial();

const security = [
  {
    bearerAuth: [],
  },
];

const categoryIsAvailable = (userId: string, categoryId: string) =>
  prisma.category.findFirst({
    where: {
      id: categoryId,
      isActive: true,
      OR: [{ userId: null }, { userId }],
    },
  });

const enrichBudget = async (
  userId: string,
  budget: Budget & { category: Category },
) => {
  const inclusiveEnd = new Date(budget.endDate);
  inclusiveEnd.setUTCHours(23, 59, 59, 999);

  const expenses = await prisma.movement.aggregate({
    where: {
      userId,
      categoryId: budget.categoryId,
      type: "EXPENSE",
      date: {
        gte: budget.startDate,
        lte: inclusiveEnd,
      },
    },
    _sum: { amount: true },
  });
  const amount = Number(budget.amount);
  const spent = Number(expenses._sum.amount ?? 0);

  return {
    ...budget,
    amount,
    spent,
    remaining: amount - spent,
    percentage: amount > 0 ? (spent / amount) * 100 : 0,
  };
};

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

      if (!(await categoryIsAvailable(user.id, data.categoryId))) {
        return reply.status(400).send({ error: "Category is not available" });
      }

      const overlapping = await prisma.budget.findFirst({
        where: {
          userId: user.id,
          categoryId: data.categoryId,
          startDate: { lte: data.endDate },
          endDate: { gte: data.startDate },
        },
      });

      if (overlapping) {
        return reply.status(409).send({
          error: "A budget for this category already overlaps the selected dates",
        });
      }

      const budget = await prisma.budget.create({
        data: {
          userId: user.id,
          categoryId: data.categoryId,
          amount: data.amount,
          startDate: data.startDate,
          endDate: data.endDate,
        },
        include: { category: true },
      });

      return reply.status(201).send(await enrichBudget(user.id, budget));
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
        include: { category: true },
      });

      return reply.send(
        await Promise.all(budgets.map((budget) => enrichBudget(user.id, budget))),
      );
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
        include: { category: true },
      });

      if (!budget) {
        return reply.status(404).send({
          error: "Budget not found",
        });
      }

      return reply.send(await enrichBudget(user.id, budget));
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
      const categoryId = data.categoryId ?? existing.categoryId;

      if (endDate < startDate) {
        return reply.status(400).send({
          error: "End date must be after start date",
        });
      }

      if (!(await categoryIsAvailable(user.id, categoryId))) {
        return reply.status(400).send({ error: "Category is not available" });
      }

      const overlapping = await prisma.budget.findFirst({
        where: {
          id: { not: id },
          userId: user.id,
          categoryId,
          startDate: { lte: endDate },
          endDate: { gte: startDate },
        },
      });

      if (overlapping) {
        return reply.status(409).send({
          error: "A budget for this category already overlaps the selected dates",
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
          ...(data.categoryId !== undefined && { categoryId: data.categoryId }),

          ...(data.startDate !== undefined && {
            startDate: data.startDate,
          }),

          ...(data.endDate !== undefined && {
            endDate: data.endDate,
          }),
        },
        include: { category: true },
      });

      return reply.send(await enrichBudget(user.id, budget));
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
