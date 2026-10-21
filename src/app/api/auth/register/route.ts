import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { registerSchema } from "@/lib/validations/auth";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    const parsedData = registerSchema.parse(body);

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: parsedData.email },
          { institutionalId: parsedData.institutionalId }
        ]
      }
    });

    if (existingUser) {
      if (existingUser.email === parsedData.email) {
        return NextResponse.json({ success: false, error: { message: "Email sudah terdaftar" } }, { status: 409 });
      }
      return NextResponse.json({ success: false, error: { message: "NIM/NIP sudah terdaftar" } }, { status: 409 });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(parsedData.password, salt);
    const newUser = await prisma.user.create({
      data: {
        fullName: parsedData.fullName,
        email: parsedData.email,
        phoneNumber: parsedData.phoneNumber,
        institutionalId: parsedData.institutionalId,
        userType: parsedData.userType,
        passwordHash: passwordHash,
        role: "PARTICIPANT", 
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: newUser.id,
        fullName: newUser.fullName,
        email: newUser.email,
        role: newUser.role,
      }
    }, { status: 201 });

  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { message: "Data tidak valid atau terjadi kesalahan server" } }, 
      { status: 400 }
    );
  }
}