import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — liveness/readiness probe for Docker and any uptime monitor.
 *
 * Deliberately unauthenticated and deliberately uninformative: it confirms the
 * process is up and can reach the database, and reveals nothing else. Version
 * numbers, migration names and error details are not exposed here.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "degraded" }, { status: 503 });
  }
}
