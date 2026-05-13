import { gridAdapter } from "./gridAdapter";
import { liquipediaAdapter } from "./liquipediaAdapter";
import { manualImportAdapter } from "./manualImportAdapter";
import { mockAdapter } from "./mockAdapter";
import { pandascoreAdapter } from "./pandascoreAdapter";
import { parsedDemoAdapter } from "./parsedDemoAdapter";
import { valveRankingsAdapter } from "./valveRankingsAdapter";
import { csUpdatesAdapter } from "./csUpdatesAdapter";
import { faceitAdapter } from "./faceitAdapter";
import { telegramNewsAdapter } from "./telegramNewsAdapter";
import type { SourceName } from "./types";

export const sourceAdapters = [
  gridAdapter,
  pandascoreAdapter,
  liquipediaAdapter,
  valveRankingsAdapter,
  csUpdatesAdapter,
  manualImportAdapter,
  parsedDemoAdapter,
  telegramNewsAdapter,
  faceitAdapter,
  mockAdapter
];

export function getSourceAdapter(source: SourceName) {
  return sourceAdapters.find((adapter) => adapter.name === source) ?? null;
}
