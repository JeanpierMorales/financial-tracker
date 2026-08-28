import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "../config/prisma.js";
import { authenticate } from "../middleware/auth.js";
import {
  ensureDefaultAccounts,
  getAccountBalances,
} from "../utils/accounts.js";
import { getOrCreateUser } from "../utils/user.js";

const security = [{ bearerAuth: [] }];
const rangeSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
const trendSchema = rangeSchema.extend({
  interval: z.enum(["weekly", "monthly"]).default("monthly"),
});

const endOfDay = (value: string) => {
  const date = new Date(value);
  if (!value.includes("T")) date.setUTCHours(23, 59, 59, 999);
  return date;
};

const parseRange = (query: unknown) => {
  const result = rangeSchema.safeParse(query);
  if (!result.success) return { error: result.error.flatten() } as const;

  const startDate = result.data.startDate ? new Date(result.data.startDate) : undefined;
  const endDate = result.data.endDate ? endOfDay(result.data.endDate) : undefined;
  if (
    (startDate && Number.isNaN(startDate.getTime())) ||
    (endDate && Number.isNaN(endDate.getTime())) ||
    (startDate && endDate && endDate < startDate)
  ) {
    return { error: "Invalid date range" } as const;
  }

  return { startDate, endDate } as const;
};

const dateWhere = (startDate?: Date, endDate?: Date) =>
  startDate || endDate
    ? {
        date: {
          ...(startDate && { gte: startDate }),
          ...(endDate && { lte: endDate }),
        },
      }
    : {};

const toMonthKey = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

const toWeekKey = (date: Date) => {
  const monday = new Date(date);
  const daysSinceMonday = (monday.getUTCDay() + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
};

const buildTrends = (
  movements: Array<{ type: "INCOME" | "EXPENSE" | "TRANSFER"; amount: unknown; date: Date }>,
  interval: "weekly" | "monthly",
) => {
  const buckets = new Map<
    string,
    { income: number; expenses: number; transfers: number }
  >();

  for (const movement of movements) {
    const key = interval === "weekly" ? toWeekKey(movement.date) : toMonthKey(movement.date);
    const current = buckets.get(key) ?? { income: 0, expenses: 0, transfers: 0 };
    const amount = Number(movement.amount);

    if (movement.type === "INCOME") current.income += amount;
    else if (movement.type === "EXPENSE") current.expenses += amount;
    else current.transfers += amount;
    buckets.set(key, current);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, values]) => ({
      period,
      month: interval === "monthly" ? period : undefined,
      ...values,
      balance: values.income - values.expenses,
    }));
};

export async function dashboardRoutes(app: FastifyInstance) {
  app.get(
    "/api/dashboard/summary",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Dashboard"],
        summary: "Get financial summary",
        security,
      },
    },
    async (request, reply) => {
      const range = parseRange(request.query);
      if ("error" in range) {
        return reply.status(400).send({ error: "Invalid query", details: range.error });
      }

      const user = await getOrCreateUser(request.user);
      await ensureDefaultAccounts(user.id);

      const [movements, accounts, goals] = await Promise.all([
        prisma.movement.findMany({
          where: {
            userId: user.id,
            ...dateWhere(range.startDate, range.endDate),
          },
          select: { type: true, amount: true },
        }),
        getAccountBalances(user.id, {
          asOf: range.endDate,
          includeInactive: true,
        }),
        prisma.savingsGoal.aggregate({
          where: {
            userId: user.id,
            status: { in: ["ACTIVE", "COMPLETED"] },
          },
          _sum: { currentAmount: true, targetAmount: true },
        }),
      ]);

      let income = 0;
      let expenses = 0;
      let transfers = 0;
      for (const movement of movements) {
        const amount = Number(movement.amount);
        if (movement.type === "INCOME") income += amount;
        else if (movement.type === "EXPENSE") expenses += amount;
        else transfers += amount;
      }

      const availableBalance = accounts
        .filter((account) => ["CASH", "BANK", "WALLET", "OTHER"].includes(account.type))
        .reduce((sum, account) => sum + account.balance, 0);
      const savings = accounts
        .filter((account) => account.type === "SAVINGS")
        .reduce((sum, account) => sum + account.balance, 0);
      const investments = accounts
        .filter((account) => account.type === "INVESTMENT")
        .reduce((sum, account) => sum + account.balance, 0);
      const totalBalance = availableBalance + savings + investments;

      const balancesByCurrency = Object.values(
        accounts.reduce<
          Record<
            string,
            {
              currency: string;
              availableBalance: number;
              savings: number;
              investments: number;
              totalBalance: number;
            }
          >>((result, account) => {
            const current = result[account.currency] ?? {
              currency: account.currency,
              availableBalance: 0,
              savings: 0,
              investments: 0,
              totalBalance: 0,
            };
            if (account.type === "SAVINGS") current.savings += account.balance;
            else if (account.type === "INVESTMENT") current.investments += account.balance;
            else current.availableBalance += account.balance;
            current.totalBalance += account.balance;
            result[account.currency] = current;
            return result;
          }, {}),
      );

      let dailyAverage = 0;
      if (range.startDate && range.endDate) {
        const days =
          Math.floor(
            (range.endDate.getTime() - range.startDate.getTime()) / (1000 * 60 * 60 * 24),
          ) + 1;
        if (days > 0) dailyAverage = expenses / days;
      }

      return reply.send({
        income,
        expenses,
        balance: income - expenses,
        transfers,
        dailyAverage,
        expensePercentage: income > 0 ? (expenses / income) * 100 : 0,
        availableBalance,
        savings,
        investments,
        totalBalance,
        netWorth: totalBalance,
        balancesByCurrency,
        savingsGoals: {
          current: Number(goals._sum.currentAmount ?? 0),
          target: Number(goals._sum.targetAmount ?? 0),
        },
        accounts,
      });
    },
  );

  app.get(
    "/api/dashboard/categories",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Dashboard"],
        summary: "Get expenses by category",
        security,
      },
    },
    async (request, reply) => {
      const range = parseRange(request.query);
      if ("error" in range) {
        return reply.status(400).send({ error: "Invalid query", details: range.error });
      }

      const user = await getOrCreateUser(request.user);
      const movements = await prisma.movement.findMany({
        where: {
          userId: user.id,
          type: "EXPENSE",
          ...dateWhere(range.startDate, range.endDate),
        },
        include: { category: true },
      });

      const categories = new Map<
        string,
        { categoryId: string | null; category: string; color: string | null; amount: number }
      >();
      for (const movement of movements) {
        const key = movement.categoryId ?? "OTHER";
        const current = categories.get(key) ?? {
          categoryId: movement.categoryId,
          category: movement.category?.name ?? "OTHER",
          color: movement.category?.color ?? null,
          amount: 0,
        };
        current.amount += Number(movement.amount);
        categories.set(key, current);
      }

      const total = [...categories.values()].reduce((sum, item) => sum + item.amount, 0);
      return reply.send(
        [...categories.values()]
          .map((item) => ({
            ...item,
            percentage: total > 0 ? (item.amount / total) * 100 : 0,
          }))
          .sort((a, b) => b.amount - a.amount),
      );
    },
  );

  app.get(
    "/api/dashboard/evolution",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Dashboard"],
        summary: "Get monthly financial evolution",
        security,
      },
    },
    async (request, reply) => {
      const range = parseRange(request.query);
      if ("error" in range) {
        return reply.status(400).send({ error: "Invalid query", details: range.error });
      }

      const user = await getOrCreateUser(request.user);
      const movements = await prisma.movement.findMany({
        where: {
          userId: user.id,
          ...dateWhere(range.startDate, range.endDate),
        },
        select: { type: true, amount: true, date: true },
        orderBy: { date: "asc" },
      });

      return reply.send(buildTrends(movements, "monthly"));
    },
  );

  app.get(
    "/api/dashboard/trends",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Dashboard"],
        summary: "Get weekly or monthly financial trends",
        security,
      },
    },
    async (request, reply) => {
      const queryResult = trendSchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.status(400).send({
          error: "Invalid query",
          details: queryResult.error.flatten(),
        });
      }
      const range = parseRange(queryResult.data);
      if ("error" in range) {
        return reply.status(400).send({ error: "Invalid query", details: range.error });
      }

      const user = await getOrCreateUser(request.user);
      const movements = await prisma.movement.findMany({
        where: {
          userId: user.id,
          ...dateWhere(range.startDate, range.endDate),
        },
        select: { type: true, amount: true, date: true },
        orderBy: { date: "asc" },
      });

      return reply.send(buildTrends(movements, queryResult.data.interval));
    },
  );
}
