import { AuthOptions, DefaultSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// Formally extend NextAuth's types to recognize our custom properties
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

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required.");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) {
          throw new Error("No account found with that email.");
        }

        const isValid = await bcrypt.compare(
          credentials.password,
          user.password
        );

        if (!isValid) {
          throw new Error("Incorrect password.");
        }

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
      // a database reset, or when a member of staff is deleted. Routes then
      // write that dangling id and Postgres rejects it on a foreign key, which
      // surfaces to the user as an unexplained save failure.
      //
      // Confirming the user still exists turns that into an ordinary
      // signed-out state: the stale token is refused and the login page asks
      // for credentials again.
      const current = await prisma.user.findUnique({
        where: { id: token.id },
        select: { id: true, role: true },
      });

      if (!current) {
        // Null, rather than a session with the user stripped out: every route
        // here guards with `if (!session)` and then reaches straight for
        // `session.user.role`, so a user-less session object would turn a
        // stale token into a crash instead of a redirect to the login page.
        return null as unknown as typeof session;
      }

      session.user.id = current.id;

      // Read the role from the row rather than the token, so a change of role
      // takes effect on the next request instead of at the next sign-in.
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