import "server-only";
import { PrismaClient } from "@prisma/client";
import { contextualPrisma } from "./dal/context";
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
let legacy:PrismaClient|undefined;
export const prisma=contextualPrisma(()=>{
 legacy??=globalForPrisma.prisma??new PrismaClient();
 if(process.env.NODE_ENV!=="production")globalForPrisma.prisma=legacy;
 return legacy;
});
