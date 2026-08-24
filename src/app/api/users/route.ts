import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { badRequest, conflict, notFound, ok, parseBody, route } from "@/lib/api";
import { requireAdmin } from "@/lib/authz";
import { userCreateSchema, userUpdateSchema } from "@/lib/validation";

const BCRYPT_ROUNDS = 12;

const publicFields = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

/** GET /api/users — list staff accounts. */
export const GET = route("GET /api/users", async () => {
  await requireAdmin();

  const users = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    select: publicFields,
  });

  return ok(users);
});

/** POST /api/users — create a staff account. */
export const POST = route("POST /api/users", async (req) => {
  await requireAdmin();
  const body = await parseBody(req, userCreateSchema);

  const existing = await prisma.user.findUnique({
    where: { email: body.email },
    select: { id: true },
  });

  if (existing) throw conflict("That email address is already in use.");

  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      password: await bcrypt.hash(body.password, BCRYPT_ROUNDS),
      role: body.role as Role,
    },
    select: publicFields,
  });

  return ok(user, 201);
});

/**
 * PATCH /api/users — change a staff member's role, password, or active state.
 *
 * Two safeguards stop an admin locking everyone out of the system:
 *  * you cannot demote or deactivate your own account
 *  * the last remaining active admin cannot be demoted or deactivated
 */
export const PATCH = route("PATCH /api/users", async (req) => {
  const actor = await requireAdmin();
  const body = await parseBody(req, userUpdateSchema);

  const target = await prisma.user.findUnique({
    where: { id: body.id },
    select: { id: true, role: true, isActive: true, name: true },
  });

  if (!target) throw notFound("User not found.");

  const losingAdmin =
    target.role === Role.ADMIN &&
    ((body.role !== undefined && body.role !== Role.ADMIN) || body.isActive === false);

  if (body.id === actor.id && losingAdmin) {
    throw badRequest(
      "You cannot remove your own admin access. Ask another admin to do it."
    );
  }

  if (losingAdmin) {
    const otherAdmins = await prisma.user.count({
      where: { role: Role.ADMIN, isActive: true, id: { not: target.id } },
    });

    if (otherAdmins === 0) {
      throw conflict(
        "This is the only active admin account. Promote another admin first."
      );
    }
  }

  const user = await prisma.user.update({
    where: { id: body.id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.role !== undefined ? { role: body.role as Role } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.password
        ? { password: await bcrypt.hash(body.password, BCRYPT_ROUNDS) }
        : {}),
    },
    select: publicFields,
  });

  return ok(user);
});
