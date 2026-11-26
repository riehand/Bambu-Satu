import "server-only";
import { contextualPrisma, DalError } from "./dal/context";
// The only installed database adapter is currently the isolated restricted DAL.
// Auth/profile in standard development use the user's Supabase session and RLS.
// Do not silently use DATABASE_URL (which may be a migration owner) for features
// awaiting an approved hosted request identity adapter and SQL gateways.
export const prisma=contextualPrisma(()=>{
 throw new DalError("RESTRICTED_RUNTIME_REQUIRED");
});
