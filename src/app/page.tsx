import Link from "next/link";
import { Hammer } from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary mb-6">
        <Hammer className="h-8 w-8 text-primary-foreground" />
      </div>
      <h1 className="text-4xl font-bold text-foreground tracking-tight">
        Hardware ERP
      </h1>
      <p className="mt-3 text-lg text-muted-foreground max-w-md">
        Enterprise Resource Planning for hardware shop management.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/login"
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Sign In
        </Link>
        <Link
          href="/dashboard"
          className="rounded-md border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Dashboard →
        </Link>
      </div>
    </div>
  );
}
