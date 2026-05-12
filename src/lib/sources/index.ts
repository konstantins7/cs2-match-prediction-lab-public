import { gridAdapter } from "./gridAdapter";
import { liquipediaAdapter } from "./liquipediaAdapter";
import { manualImportAdapter } from "./manualImportAdapter";
import { mockAdapter } from "./mockAdapter";
import { pandascoreAdapter } from "./pandascoreAdapter";

export const sourceAdapters = [mockAdapter, pandascoreAdapter, gridAdapter, liquipediaAdapter, manualImportAdapter];
