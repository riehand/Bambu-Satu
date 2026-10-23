import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        institutionalId: { label: "NIM/NIP", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.institutionalId || !credentials?.password) {
          throw new Error("NIM/NIP dan Password wajib diisi");
        }

        const user = await prisma.user.findUnique({
          where: { institutionalId: credentials.institutionalId }
        });

        if (!user || !user.isActive) {
          throw new Error("Akun tidak ditemukan atau tidak aktif");
        }

        const isPasswordValid = await bcrypt.compare(credentials.password, user.passwordHash);

        if (!isPasswordValid) {
          throw new Error("Kredensial tidak valid");
        }

        return {
          id: user.id,
          name: user.fullName,
          email: user.email,
          role: user.role,
          institutionalId: user.institutionalId,
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.institutionalId = user.institutionalId;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub as string;
        session.user.role = token.role as string;
        session.user.institutionalId = token.institutionalId as string;
      }
      return session;
    }
  },
  pages: {
    signIn: "/auth/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 1 hari
  },
  secret: process.env.NEXTAUTH_SECRET,
};