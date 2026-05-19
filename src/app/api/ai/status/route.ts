import { NextResponse } from "next/server";
import { isLocalAIEnabled, listLocalAIModels, localAIConfig } from "@/lib/ai/localAIClient";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = localAIConfig();
  const models = await listLocalAIModels();
  return NextResponse.json({
    ok: true,
    enabled: isLocalAIEnabled(),
    model: config.model,
    fineTunedModel: config.fineTunedModel,
    fineTunedAvailable: models.fineTunedAvailable,
    autoApplyEnabled: process.env.AI_AUTO_APPLY_ENABLED === "true",
    autoApplyMinConfidence: Number(process.env.AI_AUTO_APPLY_MIN_CONFIDENCE || 85),
    autoApplyDelayMs: Number(process.env.AI_AUTO_APPLY_DELAY_MS || 5000),
    models: models.models
  });
}
