import { prepareFineTuningDataset } from "@/lib/ai/finetune";

// Writes sharegpt_local_ai_dataset.jsonl with ShareGPT messages and redacted input via redactString in the shared helper.
async function main() {
  console.log(JSON.stringify(await prepareFineTuningDataset(), null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
