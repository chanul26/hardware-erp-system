import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import MoneyClient from "./MoneyClient";

export const dynamic = "force-dynamic";

export default async function MoneyPage() {
  const session = await getServerSession(authOptions);

  // These are the owner's own books, not shop-floor data.
  if (!session || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Money Management
        </h2>
        <p className="text-muted-foreground mt-1">
          Where the day&apos;s takings went — banked, spent, given away, or
          still in hand.
        </p>
      </div>

      <MoneyClient />
    </div>
  );
}
