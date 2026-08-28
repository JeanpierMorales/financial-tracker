import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { prisma } from "../config/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { getOrCreateUser } from "../utils/user.js";

const categorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  icon: z.string().trim().min(1).max(40).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
});
const updateCategorySchema = categorySchema.partial().extend({
  isActive: z.boolean().optional(),
});
const security = [{ bearerAuth: [] }];

export async function categoryRoutes(app: FastifyInstance) {
  app.get(
    "/api/categories",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Categories"],
        summary: "Get system and custom categories",
        security,
      },
    },
    async (request, reply) => {
      const user = await getOrCreateUser(request.user);
      const categories = await prisma.category.findMany({
        where: {
          isActive: true,
          OR: [{ userId: null }, { userId: user.id }],
        },
        orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      });

      return reply.send(categories);
    },
  );

  app.post(
    "/api/categories",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Categories"],
        summary: "Create a custom category",
        security,
      },
    },
    async (request, reply) => {
      const result = categorySchema.safeParse(request.body);

      if (!result.success) {
        return reply.status(400).send({
          error: "Invalid data",
          details: result.error.flatten(),
        });
      }

      const user = await getOrCreateUser(request.user);
      const duplicate = await prisma.category.findFirst({
        where: {
          name: { equals: result.data.name, mode: "insensitive" },
          OR: [{ userId: null }, { userId: user.id }],
        },
      });

      if (duplicate) {
        return reply.status(409).send({ error: "Category already exists" });
      }

      const category = await prisma.category.create({
        data: {
          userId: user.id,
          isSystem: false,
          ...result.data,
        },
      });

      return reply.status(201).send(category);
    },
  );

  app.patch(
    "/api/categories/:id",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Categories"],
        summary: "Update a custom category",
        security,
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = updateCategorySchema.safeParse(request.body);

      if (!result.success) {
        return reply.status(400).send({
          error: "Invalid data",
          details: result.error.flatten(),
        });
      }

      const user = await getOrCreateUser(request.user);
      const existing = await prisma.category.findFirst({
        where: { id, userId: user.id, isSystem: false },
      });

      if (!existing) {
        return reply.status(404).send({ error: "Custom category not found" });
      }

      if (result.data.name && result.data.name !== existing.name) {
        const duplicate = await prisma.category.findFirst({
          where: {
            id: { not: id },
            name: { equals: result.data.name, mode: "insensitive" },
            OR: [{ userId: null }, { userId: user.id }],
          },
        });

        if (duplicate) {
          return reply.status(409).send({ error: "Category already exists" });
        }
      }

      return reply.send(
        await prisma.category.update({
          where: { id },
          data: result.data,
        }),
      );
    },
  );

  app.delete(
    "/api/categories/:id",
    {
      preHandler: authenticate,
      schema: {
        tags: ["Categories"],
        summary: "Archive a custom category",
        security,
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = await getOrCreateUser(request.user);
      const existing = await prisma.category.findFirst({
        where: { id, userId: user.id, isSystem: false },
        select: { id: true },
      });

      if (!existing) {
        return reply.status(404).send({ error: "Custom category not found" });
      }

      await prisma.category.update({
        where: { id },
        data: { isActive: false },
      });

      return reply.send({ message: "Category archived successfully" });
    },
  );
}
