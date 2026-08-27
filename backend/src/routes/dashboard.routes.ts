import type { FastifyInstance } from "fastify";

import { prisma } from "../config/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { getOrCreateUser } from "../utils/user.js";

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

export async function dashboardRoutes(app: FastifyInstance) {
  /*
   * RESUMEN
   *
   * Ingresos
   * Gastos
   * Balance
   * Promedio diario
   * Porcentaje gastado
   */
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
      const query = request.query as {
        startDate?: string;
        endDate?: string;
      };

      const user = await getOrCreateUser(request.user);

      const movements = await prisma.movement.findMany({
        where: {
          userId: user.id,

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
      });

      let income = 0;
      let expenses = 0;

      for (const movement of movements) {
        const amount = Number(movement.amount);

        if (movement.type === "INCOME") {
          income += amount;
        } else if (movement.type === "EXPENSE") {
          expenses += amount;
        }
      }

      const balance = income - expenses;

      let dailyAverage = 0;

      if (query.startDate && query.endDate) {
        const start = new Date(query.startDate);
        const end = new Date(query.endDate);

        const difference =
          end.getTime() - start.getTime();

        const days =
          Math.floor(
            difference / (1000 * 60 * 60 * 24),
          ) + 1;

        if (days > 0) {
          dailyAverage = expenses / days;
        }
      }

      const expensePercentage =
        income > 0
          ? (expenses / income) * 100
          : 0;

      return reply.send({
        income,
        expenses,
        balance,
        dailyAverage,
        expensePercentage,
      });
    },
  );

  /*
   * GASTOS POR CATEGORÍA
   */
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
      const query = request.query as {
        startDate?: string;
        endDate?: string;
      };

      const user = await getOrCreateUser(request.user);

      const movements = await prisma.movement.findMany({
        where: {
          userId: user.id,
          type: "EXPENSE",

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
      });

      const categories = new Map<
        string,
        number
      >();

      for (const movement of movements) {
        const category =
          movement.category?.name ?? "OTHER";

        const current =
          categories.get(category) ?? 0;

        categories.set(
          category,
          current + Number(movement.amount),
        );
      }

      const total = movements.reduce(
        (sum, movement) =>
          sum + Number(movement.amount),
        0,
      );

      const result = Array.from(
        categories.entries(),
      ).map(([category, amount]) => ({
        category,
        amount,
        percentage:
          total > 0
            ? (amount / total) * 100
            : 0,
      }));

      result.sort(
        (a, b) => b.amount - a.amount,
      );

      return reply.send(result);
    },
  );

  /*
   * EVOLUCIÓN MENSUAL
   */
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
      const user = await getOrCreateUser(request.user);

      const movements = await prisma.movement.findMany({
        where: {
          userId: user.id,
        },

        orderBy: {
          date: "asc",
        },
      });

      const months = new Map<
        string,
        {
          income: number;
          expenses: number;
        }
      >();

      for (const movement of movements) {
        const date = new Date(movement.date);

        const month =
          `${date.getFullYear()}-${String(
            date.getMonth() + 1,
          ).padStart(2, "0")}`;

        if (!months.has(month)) {
          months.set(month, {
            income: 0,
            expenses: 0,
          });
        }

        const current = months.get(month)!;
        const amount = Number(movement.amount);

        if (movement.type === "INCOME") {
          current.income += amount;
        } else if (movement.type === "EXPENSE") {
          current.expenses += amount;
        }
      }

      const result = Array.from(
        months.entries(),
      ).map(([month, values]) => ({
        month,
        income: values.income,
        expenses: values.expenses,
        balance:
          values.income - values.expenses,
      }));

      return reply.send(result);
    },
  );
}
