import { NextResponse } from "next/server";
import { providerStatus } from "@/lib/config";

import { withErrors } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reports which services are configured (never the keys themselves).
async function handleGET() {
  return NextResponse.json(providerStatus());
}

export const GET = withErrors(handleGET);
