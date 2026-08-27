import type { User as SupabaseUser } from "@supabase/supabase-js";
import { prisma } from "../config/prisma.js";

export async function getOrCreateUser(
  supabaseUser: SupabaseUser,
) {
  return prisma.user.upsert({
    where: {
      authUserId: supabaseUser.id,
    },
    update: {},
    create: {
      authUserId: supabaseUser.id,
    },
  });
}