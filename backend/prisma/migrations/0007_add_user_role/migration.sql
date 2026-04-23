-- Add user roles for role-based guards.
CREATE TYPE "UserRole" AS ENUM ('user', 'admin');

ALTER TABLE "User"
ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'user';
