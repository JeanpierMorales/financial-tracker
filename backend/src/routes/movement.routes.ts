import type { Account, PaymentMethod } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "../config/prisma.js";
import { authenticate } from "../middleware/auth.js";
import {
  accountTypeToPaymentMethod,
  findOwnedAccounts,
  getOrCreateLegacyAccount,
} from "../utils/accounts.js";
import { getOrCreateUser } from "../utils/user.js";

const MAX_MONEY = 999_999_999_999.99;
const paymentMethodSchema = z.enum(["CASH", "YAPE", "BANK_TRANSFER"]);

const movementSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
  amount: z.number().finite().positive().max(MAX_MONEY),
  categoryId: z.string().uuid().nullable().optional(),
  sourceAccountId: z.string().uuid().nullable().optional(),
  destinationAccountId: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(255).nullable().optional(),
  date: z.coerce.date(),
  paymentMethod: paymentMethodSchema.optional(),
  destinationPaymentMethod: paymentMethodSchema.nullable().optional(),
});

const updateMovementSchema = movementSchema.partial();
const movementQuerySchema = z.object({
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]).optional(),
  categoryId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  paymentMethod: paymentMethodSchema.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

const security = [{ bearerAuth: [] }];

const endOfDay = (value: string) => {
  const date = new Date(value);
  if (!value.includes("T")) date.setUTCHours(23, 59, 59, 999);
  return date;
};

const categoryIsAvailable = async (userId: string, categoryId: string) =>
  prisma.category.findFirst({
    where: {
      id: categoryId,
      isActive: true,
      OR: [{ userId: null }, { userId }],
    },
  });

const legacyAccount = async (
  userId: string,
  paymentMethod: PaymentMethod | undefined | null,
) => (paymentMethod ? getOrCreateLegacyAccount(userId, paymentMethod) : null);

const validateAccountSelection = (
  type: "INCOME" | "EXPENSE" | "TRANSFER",
  sourceAccount: Account | null,
  destinationAccount: Account | null,
) => {
  if (type === "INCOME" && !destinationAccount) {
    return "An income requires a destination account";
  }
  if (type === "EXPENSE" && !sourceAccount) {
    return "An expense requires a source account";
  }
  if (type === "TRANSFER" && (!sourceAccount || !destinationAccount)) {
    return "A transfer requires source and destination accounts";
  }
  if (
    type === "TRANSFER" &&
    sourceAccount &&
    destinationAccount &&
    sourceAccount.id === destinationAccount.id
  ) {
    return "A transfer requires different source and destination accounts";
  }
  if (
    type === "TRANSFER" &&
    sourceAccount &&
    destinationAccount &&
    sourceAccount.currency !== destinationAccount.currency
  ) {
    return "Transfers between different currencies are not supported yet";
  }
  return null;
};

const movementInclude = {
  category: true,
  sourceAccount: true,
  destinationAccount: true,
} as const;

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
      const user = await getOrCreateUser(request.user);

      if (data.type === "EXPENSE" && !data.categoryId) {
        return reply.status(400).send({ error: "Category is required for expenses" });
      }

      if (data.categoryId && !(await categoryIsAvailable(user.id, data.categoryId))) {
        return reply.status(400).send({ error: "Category is not available" });
      }

      let sourceAccountId = data.sourceAccountId ?? null;
      let destinationAccountId = data.destinationAccountId ?? null;

      if (!sourceAccountId && data.type !== "INCOME") {
        sourceAccountId = (await legacyAccount(user.id, data.paymentMethod))?.id ?? null;
      }
      if (!destinationAccountId && data.type === "INCOME") {
        destinationAccountId = (await legacyAccount(user.id, data.paymentMethod))?.id ?? null;
      }
      if (!destinationAccountId && data.type === "TRANSFER") {
        destinationAccountId =
          (await legacyAccount(user.id, data.destinationPaymentMethod))?.id ?? null;
      }

      if (data.type === "INCOME") sourceAccountId = null;
      if (data.type === "EXPENSE") destinationAccountId = null;

      const accounts = await findOwnedAccounts(user.id, [
        sourceAccountId,
        destinationAccountId,
      ]);
      const sourceAccount = sourceAccountId ? accounts.get(sourceAccountId) ?? null : null;
      const destinationAccount = destinationAccountId
        ? accounts.get(destinationAccountId) ?? null
        : null;

      if (
        (sourceAccountId && !sourceAccount) ||
        (destinationAccountId && !destinationAccount)
      ) {
        return reply.status(404).send({ error: "Account not found" });
      }

      if (sourceAccount?.isActive === false || destinationAccount?.isActive === false) {
        return reply.status(409).send({ error: "Archived accounts cannot receive new movements" });
      }

      const accountError = validateAccountSelection(
        data.type,
        sourceAccount,
        destinationAccount,
      );
      if (accountError) return reply.status(400).send({ error: accountError });

      const paymentMethod = accountTypeToPaymentMethod(
        (sourceAccount ?? destinationAccount)!.type,
      );
      const destinationPaymentMethod =
        data.type === "TRANSFER" && destinationAccount
          ? accountTypeToPaymentMethod(destinationAccount.type)
          : null;

      const movement = await prisma.movement.create({
        data: {
          userId: user.id,
          type: data.type,
          amount: data.amount,
          categoryId: data.type === "EXPENSE" ? data.categoryId : null,
          sourceAccountId,
          destinationAccountId,
          description: data.description,
          date: data.date,
          paymentMethod,
          destinationPaymentMethod,
        },
        include: movementInclude,
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
      const result = movementQuerySchema.safeParse(request.query);

      if (!result.success) {
        return reply.status(400).send({
          error: "Invalid query",
          details: result.error.flatten(),
        });
      }

      const query = result.data;
      const startDate = query.startDate ? new Date(query.startDate) : undefined;
      const endDate = query.endDate ? endOfDay(query.endDate) : undefined;

      if (
        (startDate && Number.isNaN(startDate.getTime())) ||
        (endDate && Number.isNaN(endDate.getTime()))
      ) {
        return reply.status(400).send({ error: "Invalid date range" });
      }

      const user = await getOrCreateUser(request.user);
      const movements = await prisma.movement.findMany({
        where: {
          userId: user.id,
          ...(query.type && { type: query.type }),
          ...(query.categoryId && { categoryId: query.categoryId }),
          ...(query.accountId && {
            OR: [
              { sourceAccountId: query.accountId },
              { destinationAccountId: query.accountId },
            ],
          }),
          ...(!query.accountId &&
            query.paymentMethod && {
              OR: [
                { paymentMethod: query.paymentMethod },
                { destinationPaymentMethod: query.paymentMethod },
              ],
            }),
          ...(startDate || endDate
            ? {
                date: {
                  ...(startDate && { gte: startDate }),
                  ...(endDate && { lte: endDate }),
                },
              }
            : {}),
        },
        include: movementInclude,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: query.limit,
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
      const { id } = request.params as { id: string };
      const user = await getOrCreateUser(request.user);
      const movement = await prisma.movement.findFirst({
        where: { id, userId: user.id },
        include: movementInclude,
      });

      if (!movement) return reply.status(404).send({ error: "Movement not found" });
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
      const { id } = request.params as { id: string };
      const result = updateMovementSchema.safeParse(request.body);

      if (!result.success) {
        return reply.status(400).send({
          error: "Invalid data",
          details: result.error.flatten(),
        });
      }

      const user = await getOrCreateUser(request.user);
      const existing = await prisma.movement.findFirst({
        where: { id, userId: user.id },
      });
      if (!existing) return reply.status(404).send({ error: "Movement not found" });

      const data = result.data;
      const type = data.type ?? existing.type;
      const categoryId =
        type === "EXPENSE"
          ? data.categoryId === undefined
            ? existing.categoryId
            : data.categoryId
          : null;

      if (type === "EXPENSE" && !categoryId) {
        return reply.status(400).send({ error: "Category is required for expenses" });
      }
      if (categoryId && !(await categoryIsAvailable(user.id, categoryId))) {
        return reply.status(400).send({ error: "Category is not available" });
      }

      let sourceAccountId =
        data.sourceAccountId === undefined ? existing.sourceAccountId : data.sourceAccountId;
      let destinationAccountId =
        data.destinationAccountId === undefined
          ? existing.destinationAccountId
          : data.destinationAccountId;

      const paymentMethod = data.paymentMethod ?? existing.paymentMethod;
      const destinationPaymentMethod =
        data.destinationPaymentMethod === undefined
          ? existing.destinationPaymentMethod
          : data.destinationPaymentMethod;

      if (
        data.paymentMethod ||
        (type === "INCOME" && !destinationAccountId) ||
        (type !== "INCOME" && !sourceAccountId)
      ) {
        const account = await legacyAccount(user.id, paymentMethod);
        if (type === "INCOME") destinationAccountId = account?.id ?? null;
        else sourceAccountId = account?.id ?? null;
      }
      if (type === "TRANSFER" && (!destinationAccountId || data.destinationPaymentMethod)) {
        destinationAccountId =
          (await legacyAccount(user.id, destinationPaymentMethod))?.id ?? null;
      }

      if (type === "INCOME") sourceAccountId = null;
      if (type === "EXPENSE") destinationAccountId = null;

      const accounts = await findOwnedAccounts(user.id, [
        sourceAccountId,
        destinationAccountId,
      ]);
      const sourceAccount = sourceAccountId ? accounts.get(sourceAccountId) ?? null : null;
      const destinationAccount = destinationAccountId
        ? accounts.get(destinationAccountId) ?? null
        : null;

      if (
        (sourceAccountId && !sourceAccount) ||
        (destinationAccountId && !destinationAccount)
      ) {
        return reply.status(404).send({ error: "Account not found" });
      }

      const accountError = validateAccountSelection(type, sourceAccount, destinationAccount);
      if (accountError) return reply.status(400).send({ error: accountError });

      const updatedPaymentMethod = accountTypeToPaymentMethod(
        (sourceAccount ?? destinationAccount)!.type,
      );
      const updatedDestinationPaymentMethod =
        type === "TRANSFER" && destinationAccount
          ? accountTypeToPaymentMethod(destinationAccount.type)
          : null;

      const movement = await prisma.movement.update({
        where: { id },
        data: {
          type,
          amount: data.amount ?? existing.amount,
          categoryId,
          sourceAccountId,
          destinationAccountId,
          description:
            data.description === undefined ? existing.description : data.description,
          date: data.date ?? existing.date,
          paymentMethod: updatedPaymentMethod,
          destinationPaymentMethod: updatedDestinationPaymentMethod,
        },
        include: movementInclude,
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
      const { id } = request.params as { id: string };
      const user = await getOrCreateUser(request.user);
      const existing = await prisma.movement.findFirst({
        where: { id, userId: user.id },
        select: { id: true },
      });

      if (!existing) return reply.status(404).send({ error: "Movement not found" });

      await prisma.movement.delete({ where: { id } });
      return reply.send({ message: "Movement deleted successfully" });
    },
  );
}
