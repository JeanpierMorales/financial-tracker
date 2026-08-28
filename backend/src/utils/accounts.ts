import type { Account, AccountType, PaymentMethod } from "@prisma/client";

import { prisma } from "../config/prisma.js";

const legacyAccountSettings: Record<
  PaymentMethod,
  Pick<Account, "name" | "type" | "institution">
> = {
  CASH: {
    name: "Efectivo",
    type: "CASH",
    institution: null,
  },
  YAPE: {
    name: "Yape",
    type: "WALLET",
    institution: "Yape",
  },
  BANK_TRANSFER: {
    name: "Cuenta bancaria",
    type: "BANK",
    institution: null,
  },
};

export const accountTypeToPaymentMethod = (
  type: AccountType,
): PaymentMethod => {
  if (type === "CASH") return "CASH";
  if (type === "WALLET") return "YAPE";
  return "BANK_TRANSFER";
};

export async function getOrCreateLegacyAccount(
  userId: string,
  paymentMethod: PaymentMethod,
) {
  const settings = legacyAccountSettings[paymentMethod];

  return prisma.account.upsert({
    where: {
      userId_name: {
        userId,
        name: settings.name,
      },
    },
    update: {},
    create: {
      userId,
      ...settings,
    },
  });
}

export async function ensureDefaultAccounts(userId: string) {
  const count = await prisma.account.count({
    where: { userId },
  });

  if (count === 0) {
    await Promise.all(
      (["CASH", "YAPE", "BANK_TRANSFER"] as const).map((method) =>
        getOrCreateLegacyAccount(userId, method),
      ),
    );
  }
}

export async function findOwnedAccounts(
  userId: string,
  accountIds: Array<string | null | undefined>,
) {
  const ids = [...new Set(accountIds.filter((id): id is string => Boolean(id)))];

  if (ids.length === 0) return new Map<string, Account>();

  const accounts = await prisma.account.findMany({
    where: {
      userId,
      id: { in: ids },
    },
  });

  return new Map(accounts.map((account) => [account.id, account]));
}

export async function getAccountBalances(
  userId: string,
  options: {
    asOf?: Date;
    includeInactive?: boolean;
  } = {},
) {
  const dateFilter = options.asOf
    ? {
        date: {
          lte: options.asOf,
        },
      }
    : {};

  const [accounts, incoming, outgoing] = await Promise.all([
    prisma.account.findMany({
      where: {
        userId,
        ...(!options.includeInactive && { isActive: true }),
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    }),
    prisma.movement.groupBy({
      by: ["destinationAccountId"],
      where: {
        userId,
        destinationAccountId: { not: null },
        ...dateFilter,
      },
      _sum: { amount: true },
    }),
    prisma.movement.groupBy({
      by: ["sourceAccountId"],
      where: {
        userId,
        sourceAccountId: { not: null },
        ...dateFilter,
      },
      _sum: { amount: true },
    }),
  ]);

  const incomingByAccount = new Map(
    incoming
      .filter((row) => row.destinationAccountId)
      .map((row) => [
        row.destinationAccountId as string,
        Number(row._sum.amount ?? 0),
      ]),
  );
  const outgoingByAccount = new Map(
    outgoing
      .filter((row) => row.sourceAccountId)
      .map((row) => [
        row.sourceAccountId as string,
        Number(row._sum.amount ?? 0),
      ]),
  );

  return accounts.map((account) => {
    const incomingAmount = incomingByAccount.get(account.id) ?? 0;
    const outgoingAmount = outgoingByAccount.get(account.id) ?? 0;

    return {
      ...account,
      initialBalance: Number(account.initialBalance),
      incoming: incomingAmount,
      outgoing: outgoingAmount,
      balance:
        Number(account.initialBalance) + incomingAmount - outgoingAmount,
    };
  });
}
