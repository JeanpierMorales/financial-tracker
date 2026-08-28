import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "../config/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { getOrCreateUser } from "../utils/user.js";

const MAX_MONEY = 999_999_999_999.99;
const statusSchema = z.enum(["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"]);
const goalSchema = z.object({
  name: z.string().trim().min(2).max(100),
  targetAmount: z.number().finite().positive().max(MAX_MONEY),
  currentAmount: z.number().finite().min(0).max(MAX_MONEY).default(0),
  accountId: z.string().uuid().nullable().optional(),
  deadline: z.coerce.date().nullable().optional(),
  status: statusSchema.default("ACTIVE"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
});
const updateGoalSchema = goalSchema.partial();
const progressSchema = z.object({
  operation: z.enum(["ADD", "SUBTRACT", "SET"]),
  amount: z.number().finite().min(0).max(MAX_MONEY),
});
const security = [{ bearerAuth: [] }];

const withProgress = <T extends { targetAmount: unknown; currentAmount: unknown }>(goal: T) => {
  const targetAmount = Number(goal.targetAmount);
  const currentAmount = Number(goal.currentAmount);

  return {
    ...goal,
    targetAmount,
    currentAmount,
    remaining: Math.max(targetAmount - currentAmount, 0),
    percentage: targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0,
  };
};

const findGoalAccount = async (userId: string, accountId?: string | null) => {
  if (!accountId) return null;
  return prisma.account.findFirst({
    where: {
      id: accountId,
      userId,
      type: { in: ["SAVINGS", "INVESTMENT"] },
    },
  });
};

export async function savingsGoalRoutes(app: FastifyInstance) {
  app.post(
    "/api/savings-goals",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Savings goals"],
        summary: "Create a savings goal",
        security,
      },
    },
    async (request, reply) => {
      const result = goalSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({
          error: "Invalid data",
          details: result.error.flatten(),
        });
      }

      const user = await getOrCreateUser(request.user);
      if (result.data.accountId && !(await findGoalAccount(user.id, result.data.accountId))) {
        return reply.status(400).send({
          error: "Goals can only be linked to your savings or investment accounts",
        });
      }

      const status =
        result.data.currentAmount >= result.data.targetAmount
          ? "COMPLETED"
          : result.data.status;
      const goal = await prisma.savingsGoal.create({
        data: {
          userId: user.id,
          ...result.data,
          status,
        },
        include: { account: true },
      });

      return reply.status(201).send(withProgress(goal));
    },
  );

  app.get(
    "/api/savings-goals",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Savings goals"],
        summary: "Get savings goals",
        security,
      },
    },
    async (request, reply) => {
      const query = request.query as { status?: string };
      const parsedStatus = query.status ? statusSchema.safeParse(query.status) : null;
      if (parsedStatus && !parsedStatus.success) {
        return reply.status(400).send({ error: "Invalid goal status" });
      }

      const user = await getOrCreateUser(request.user);
      const goals = await prisma.savingsGoal.findMany({
        where: {
          userId: user.id,
          ...(parsedStatus?.success && { status: parsedStatus.data }),
        },
        include: { account: true },
        orderBy: [{ status: "asc" }, { deadline: "asc" }, { createdAt: "desc" }],
      });

      return reply.send(goals.map(withProgress));
    },
  );

  app.get(
    "/api/savings-goals/:id",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Savings goals"],
        summary: "Get a savings goal",
        security,
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = await getOrCreateUser(request.user);
      const goal = await prisma.savingsGoal.findFirst({
        where: { id, userId: user.id },
        include: { account: true },
      });

      if (!goal) return reply.status(404).send({ error: "Savings goal not found" });
      return reply.send(withProgress(goal));
    },
  );

  app.patch(
    "/api/savings-goals/:id",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Savings goals"],
        summary: "Update a savings goal",
        security,
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = updateGoalSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({
          error: "Invalid data",
          details: result.error.flatten(),
        });
      }

      const user = await getOrCreateUser(request.user);
      const existing = await prisma.savingsGoal.findFirst({
        where: { id, userId: user.id },
      });
      if (!existing) return reply.status(404).send({ error: "Savings goal not found" });

      if (result.data.accountId && !(await findGoalAccount(user.id, result.data.accountId))) {
        return reply.status(400).send({
          error: "Goals can only be linked to your savings or investment accounts",
        });
      }

      const target = result.data.targetAmount ?? Number(existing.targetAmount);
      const current = result.data.currentAmount ?? Number(existing.currentAmount);
      const requestedStatus = result.data.status ?? existing.status;
      const status =
        current >= target && !["PAUSED", "CANCELLED"].includes(requestedStatus)
          ? "COMPLETED"
          : requestedStatus === "COMPLETED" && current < target
            ? "ACTIVE"
            : requestedStatus;

      const goal = await prisma.savingsGoal.update({
        where: { id },
        data: {
          ...result.data,
          status,
        },
        include: { account: true },
      });

      return reply.send(withProgress(goal));
    },
  );

  app.post(
    "/api/savings-goals/:id/progress",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Savings goals"],
        summary: "Add, subtract, or set savings goal progress",
        security,
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = progressSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({
          error: "Invalid data",
          details: result.error.flatten(),
        });
      }

      const user = await getOrCreateUser(request.user);
      const existing = await prisma.savingsGoal.findFirst({
        where: { id, userId: user.id },
      });
      if (!existing) return reply.status(404).send({ error: "Savings goal not found" });

      const current = Number(existing.currentAmount);
      const next =
        result.data.operation === "SET"
          ? result.data.amount
          : result.data.operation === "ADD"
            ? current + result.data.amount
            : current - result.data.amount;

      if (next < 0 || next > MAX_MONEY) {
        return reply.status(400).send({ error: "Goal progress is outside the allowed range" });
      }

      const target = Number(existing.targetAmount);
      const status =
        existing.status === "CANCELLED" || existing.status === "PAUSED"
          ? existing.status
          : next >= target
            ? "COMPLETED"
            : "ACTIVE";
      const goal = await prisma.savingsGoal.update({
        where: { id },
        data: { currentAmount: next, status },
        include: { account: true },
      });

      return reply.send(withProgress(goal));
    },
  );

  app.delete(
    "/api/savings-goals/:id",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Savings goals"],
        summary: "Delete a savings goal",
        security,
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = await getOrCreateUser(request.user);
      const existing = await prisma.savingsGoal.findFirst({
        where: { id, userId: user.id },
        select: { id: true },
      });

      if (!existing) return reply.status(404).send({ error: "Savings goal not found" });
      await prisma.savingsGoal.delete({ where: { id } });
      return reply.send({ message: "Savings goal deleted successfully" });
    },
  );
}
