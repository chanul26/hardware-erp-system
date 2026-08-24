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
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
    error: "/",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
