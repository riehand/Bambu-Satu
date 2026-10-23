-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PARTICIPANT', 'PSYCHOLOGIST', 'SUPERADMIN');

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('STUDENT', 'LECTURER');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "user_type" "UserType",
    "institutional_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_institutional_id_key" ON "users"("institutional_id");
