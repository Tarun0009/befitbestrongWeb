import { NextResponse } from "next/server";
import { publicEnv } from "@/config/publicEnv";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "befitbestrong-web",
    environment: publicEnv.appEnvironment,
    release: publicEnv.release,
    capabilities: {
      firebase: publicEnv.firebaseConfigured,
    },
    timestamp: new Date().toISOString(),
  });
}
