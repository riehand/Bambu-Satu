import "server-only";
import { gatewayMode, hasDatabaseRequest, withVerifiedDatabaseRequest, DalError } from "@/lib/dal/context";
import { redirect, unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { dashboardPaths, isAppRole, type AppRole } from "./roles";

export class AuthError extends Error {
  constructor(public readonly reason: "unauthenticated" | "inactive" | "profile" | "forbidden") {
    super(reason);
  }
}

// Never accept a user ID or role from a caller. Prisma may bypass RLS, so
// ownership comes exclusively from a fresh Auth server verification.
export async function getCurrentProfile() {
  return withApplicationDatabase(readCurrentProfile);
}

async function readCurrentProfile() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || !data.user.email_confirmed_at) throw new AuthError("unauthenticated");
  const profile = await prisma.user.findUnique({
    where: { id: data.user.id },
    select: {
      id: true, fullName: true, email: true, phoneNumber: true,
      institutionalId: true, userType: true, role: true, isActive: true,
    },
  });
  if (!profile || !isAppRole(profile.role)) throw new AuthError("profile");
  if (!profile.isActive) throw new AuthError("inactive");
  return profile;
}

// Use inside every protected backend operation, not only page layouts.
export async function requireApiRole(role: AppRole) {
  const profile = await getCurrentProfile();
  if (profile.role !== role) throw new AuthError("forbidden");
  return profile;
}

export async function requirePageRole(role: AppRole) {
  // Auth and the DAL freshness clock belong to a real request, not prerender.
  await connection();
  let profile;
  try {
    profile = await getCurrentProfile();
  } catch (error) {
    // Preserve Next.js request-time rendering signals with Cache Components.
    unstable_rethrow(error);
    const reason = error instanceof AuthError ? error.reason : "unavailable";
    redirect(`/auth/login?reason=${reason}`);
  }
  if (profile.role !== role) redirect(dashboardPaths[profile.role]);
  return profile;
}

// Request boundary for locally installed least-privilege DAL; never an env-enabled signer.
export async function withApplicationDatabase<T>(work:()=>Promise<T>) {
  if (!gatewayMode() || hasDatabaseRequest()) return work();
  const client=await createClient();
  try { return await withVerifiedDatabaseRequest(client.auth,work); }
  catch(error) {
    if(error instanceof DalError && error.code==="AUTH_REQUIRED") throw new AuthError("unauthenticated");
    if(error instanceof DalError && error.code==="FORBIDDEN") throw new AuthError("forbidden");
    if(error instanceof DalError && error.code==="ACTIVE_PROFILE_REQUIRED") throw new AuthError("inactive");
    throw error;
  }
}
