import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "../config/prisma.js";
import { authenticate } from "../middleware/auth.js";
import {
  ensureDefaultAccounts,
  getAccountBalances,
} from "../utils/accounts.js";
import { getOrCreateUser } from "../utils/user.js";

const MAX_MONEY = 999_999_999_999.99;
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const accountSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: z.enum(["CASH", "BANK", "WALLET", "SAVINGS", "INVESTMENT", "OTHER"]),
  currency: z.enum(["PEN", "USD"]).default("PEN"),
  initialBalance: z.number().finite().min(-MAX_MONEY).max(MAX_MONEY).default(0),
  institution: z.string().trim().min(2).max(80).nullable().optional(),
  lastFour: z.string().regex(/^\d{4}$/).nullable().optional(),
  color: colorSchema.nullable().optional(),
});

const updateAccountSchema = accountSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const security = [{ bearerAuth: [] }];

const parseBoolean = (value: unknown) => value === true || value === "true";

export async function accountRoutes(app: FastifyInstance) {
  app.post(
    "/api/accounts",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Accounts"],
        summary: "Create a financial account",
        security,
      },
    },
    async (request, reply) => {
      const result = accountSchema.safeParse(request.body);

      if (!result.success) {
        return reply.status(400).send({
          error: "Invalid data",
          details: result.error.flatten(),
        });
      }

      const user = await getOrCreateUser(request.user);
      const duplicate = await prisma.account.findFirst({
        where: {
          userId: user.id,
          name: { equals: result.data.name, mode: "insensitive" },
        },
      });

      if (duplicate) {
        return reply.status(409).send({
          error: "An account with that name already exists",
        });
      }

      const account = await prisma.account.create({
        data: {
          userId: user.id,
          ...result.data,
        },
      });

      return reply.status(201).send({
        ...account,
        initialBalance: Number(account.initialBalance),
        incoming: 0,
        outgoing: 0,
        balance: Number(account.initialBalance),
      });
    },
  );

  app.get(
    "/api/accounts",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Accounts"],
        summary: "Get accounts with calculated balances",
        security,
      },
    },
    async (request, reply) => {
      const query = request.query as {
        includeInactive?: string | boolean;
        asOf?: string;
      };
      const asOf = query.asOf ? new Date(query.asOf) : undefined;

      if (asOf && Number.isNaN(asOf.getTime())) {
        return reply.status(400).send({ error: "Invalid asOf date" });
      }

      const user = await getOrCreateUser(request.user);
      await ensureDefaultAccounts(user.id);

      return reply.send(
        await getAccountBalances(user.id, {
          asOf,
          includeInactive: parseBoolean(query.includeInactive),
        }),
      );
    },
  );

  app.get(
    "/api/accounts/:id",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Accounts"],
        summary: "Get an account with its balance",
        security,
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = await getOrCreateUser(request.user);
      const account = (await getAccountBalances(user.id, { includeInactive: true })).find(
        (item) => item.id === id,
      );

      if (!account) {
        return reply.status(404).send({ error: "Account not found" });
      }

      return reply.send(account);
    },
  );

  app.patch(
    "/api/accounts/:id",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Accounts"],
        summary: "Update a financial account",
        security,
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = updateAccountSchema.safeParse(request.body);

      if (!result.success) {
        return reply.status(400).send({
          error: "Invalid data",
          details: result.error.flatten(),
        });
      }

      const user = await getOrCreateUser(request.user);
      const existing = await prisma.account.findFirst({
        where: { id, userId: user.id },
      });

      if (!existing) {
        return reply.status(404).send({ error: "Account not found" });
      }

      if (result.data.name && result.data.name !== existing.name) {
        const duplicate = await prisma.account.findFirst({
          where: {
            userId: user.id,
            id: { not: id },
            name: { equals: result.data.name, mode: "insensitive" },
          },
        });

        if (duplicate) {
          return reply.status(409).send({
            error: "An account with that name already exists",
          });
        }
      }

      if (result.data.currency && result.data.currency !== existing.currency) {
        const movements = await prisma.movement.count({
          where: {
            userId: user.id,
            OR: [{ sourceAccountId: id }, { destinationAccountId: id }],
          },
        });

        if (movements > 0) {
          return reply.status(409).send({
            error: "The currency cannot be changed after recording movements",
          });
        }
      }

      if (result.data.isActive === false) {
        const balance = (await getAccountBalances(user.id, { includeInactive: true })).find(
          (account) => account.id === id,
        )?.balance;

        if (balance !== undefined && Math.abs(balance) >= 0.005) {
          return reply.status(409).send({
            error: "Move or adjust the remaining balance before archiving this account",
          });
        }
      }

      const account = await prisma.account.update({
        where: { id },
        data: result.data,
      });

      const balance = (await getAccountBalances(user.id, { includeInactive: true })).find(
        (item) => item.id === account.id,
      );

      return reply.send(balance);
    },
  );

  app.delete(
    "/api/accounts/:id",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Accounts"],
        summary: "Archive a financial account",
        security,
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = await getOrCreateUser(request.user);
      const account = (await getAccountBalances(user.id, { includeInactive: true })).find(
        (item) => item.id === id,
      );

      if (!account) {
        return reply.status(404).send({ error: "Account not found" });
      }

      if (Math.abs(account.balance) >= 0.005) {
        return reply.status(409).send({
          error: "Move or adjust the remaining balance before archiving this account",
        });
      }

      await prisma.account.update({
        where: { id },
        data: { isActive: false },
      });

      return reply.send({ message: "Account archived successfully" });
    },
  );
}
