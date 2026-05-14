import {
  rebuildSnapshots,
  runAllSync,
  runPredictionsForUpcomingMatches,
  runSourceSync,
  syncGameMetaUpdates,
  syncPandaScoreFreeFixtures,
  syncValveRankings
} from "../lib/sources/sourceScheduler";
import { prisma } from "../lib/prisma";
import type { SourceJobType, SourceName } from "../lib/sources/types";
import { redactSecrets } from "../lib/security/redaction";

function print(value: unknown) {
  console.log(JSON.stringify(redactSecrets(value), null, 2));
}

async function main() {
  const command = process.argv[2] ?? "all";
  if (command === "all") {
    print(await runAllSync());
    return;
  }
  if (command === "snapshots") {
    print(await rebuildSnapshots());
    return;
  }
  if (command === "predictions") {
    print({ predictions: await runPredictionsForUpcomingMatches() });
    return;
  }
  if (command === "valve-rankings") {
    print(await syncValveRankings());
    return;
  }
  if (command === "cs-updates") {
    print(await syncGameMetaUpdates());
    return;
  }
  if (command === "pandascore-free") {
    print(await syncPandaScoreFreeFixtures());
    return;
  }
  const source = command as SourceName;
  const jobType = (process.argv[3] ?? "upcoming_matches") as SourceJobType;
  print(await runSourceSync(source, jobType));
}

main()
  .catch((error) => {
    console.error(redactSecrets(error instanceof Error ? error.message : error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
