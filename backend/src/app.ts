import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

import "./types/fastify.js";

import { healthRoutes } from "./routes/health.routes.js";
import { authRoutes } from "./routes/auth.routes.js";
import { categoryRoutes } from "./routes/category.routes.js";
import { movementRoutes } from "./routes/movement.routes.js";
import { budgetRoutes } from "./routes/budget.routes.js";
import { accountRoutes } from "./routes/account.routes.js";
import { savingsGoalRoutes } from "./routes/savings-goal.routes.js";

import { dashboardRoutes } from "./routes/dashboard.routes.js";
const app = Fastify({
  logger: true,
});

const allowedOrigins = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === "production" && allowedOrigins.length === 0) {
  throw new Error("CORS_ORIGIN is required in production");
}

app.register(cors, {
  origin: allowedOrigins.length > 0 ? allowedOrigins : true,
});

app.register(swagger, {
  openapi: {
    info: {
      title: "Financial Tracker API",
      description: "API para la gestión de finanzas personales",
      version: "1.0.0",
    },

    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },

    tags: [
      {
        name: "Health",
        description: "API health checks",
      },
      {
        name: "Auth",
        description: "Authentication endpoints",
      },
      {
        name: "Categories",
        description: "Expense categories",
      },
      {
        name: "Movements",
        description: "Income and expense movements",
      },
      {
        name: "Accounts",
        description: "Cash, bank, wallet, savings, and investment accounts",
      },
      {
        name: "Budgets",
        description: "Financial budgets",
      },
      {
        name: "Dashboard",
        description: "Financial dashboard",
      },
      {
        name: "Savings goals",
        description: "Personal savings goals",
      },
    ],
  },
});

app.register(swaggerUi, {
  routePrefix: "/docs",
});

app.register(healthRoutes);
app.register(authRoutes);
app.register(categoryRoutes);
app.register(accountRoutes);
app.register(movementRoutes);
app.register(budgetRoutes);
app.register(savingsGoalRoutes);
app.register(dashboardRoutes);

const PORT = Number(process.env.PORT) || 3000;

app.listen({
  port: PORT,
  host: "0.0.0.0",
});
