import { AuthOptions, DefaultSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { clientIp, rateLimit, resetRateLimit } from "@/lib/rate-limit";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession["user"];
  }
  interface User {
    id: string;
    role: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
  }
}

/**
 * A single message for every failure mode. Saying "no account found" versus
 * "incorrect password" tells an attacker which staff email addresses are real,
 * which is worth more to them than it is to a user who mistyped.
 */
const INVALID_CREDENTIALS = "Incorrect email or password.";

/** Login attempt ceilings. Deliberately generous for staff, hostile to scripts. */
const PER_IP = { limit: 20, windowMs: 15 * 60 * 1000 };
const PER_ACCOUNT = { limit: 8, windowMs: 15 * 60 * 1000 };

if (!process.env.NEXTAUTH_SECRET) {
  // Failing loudly at boot beats NextAuth silently falling back in production.
  throw new Error(
    "NEXTAUTH_SECRET is not set. Generate one with: openssl rand -base64 32"
  );
}

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required.");
        }

        const email = credentials.email.trim().toLowerCase();
        const ip = clientIp(
          new Headers((req?.headers as Record<string, string>) ?? {})
        );

        const ipCheck = rateLimit(`login:ip:${ip}`, PER_IP.limit, PER_IP.windowMs);
        const accountCheck = rateLimit(
          `login:email:${email}`,
          PER_ACCOUNT.limit,
          PER_ACCOUNT.windowMs
        );

        if (!ipCheck.allowed || !accountCheck.allowed) {
          const wait = Math.max(
            ipCheck.retryAfterSeconds,
            accountCheck.retryAfterSeconds
          );
          throw new Error(
            `Too many sign-in attempts. Try again in ${Math.ceil(wait / 60)} minute(s).`
          );
        }

        const user = await prisma.user.findUnique({ where: { email } });

        // Compare against a dummy hash when the user is absent so the response
        // time does not reveal whether the address exists.
        const hash =
          user?.password ??
          "$2a$12$0000000000000000000000000000000000000000000000000000";

        const passwordMatches = await bcrypt.compare(credentials.password, hash);

        if (!user || !user.password || !passwordMatches) {
          throw new Error(INVALID_CREDENTIALS);
        }

        if (!user.isActive) {
          throw new Error("This account has been deactivated. Contact an admin.");
        }

        resetRateLimit(`login:email:${email}`);
        resetRateLimit(`login:ip:${ip}`);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 12 * 60 * 60, // A shop shift, not 30 days.
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (!session.user) return session;

      // A JWT carries the user id it was signed with and is never re-checked
      // against the database, so a token outlives the row it points at — after
      // a database reset, or when a member of staff is removed. Routes then
      // write that dangling id and Postgres rejects it on a foreign key, which
      // reaches the user as an unexplained save failure.
      //
      // Confirming the user still exists turns that into an ordinary
      // signed-out state. Reading the role from the row rather than the token
      // also means a role change or a deactivation takes effect on the next
      // request instead of at the next sign-in.
      const current = await prisma.user.findUnique({
        where: { id: token.id },
        select: { id: true, role: true, isActive: true },
      });

      if (!current || !current.isActive) {
        // Null rather than a session with the user stripped out: callers guard
        // with `if (!session)` and then reach straight for `session.user.role`,
        // so a user-less session object would turn a stale token into a crash
        // instead of a redirect to the login page.
        return null as unknown as typeof session;
      }

      session.user.id = current.id;
      session.user.role = current.role;

      return session;
    },
  },
  pages: {
    signIn: "/",
    error: "/",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
