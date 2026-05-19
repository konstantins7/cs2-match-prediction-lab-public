const base = process.env.STRESS_BASE_URL ?? "http://127.0.0.1:3000";
const count = Number(process.argv.find((arg) => arg.startsWith("--count="))?.split("=")[1] ?? 100);

async function main() {
  const times: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = performance.now();
    const response = await fetch(`${base}/api/matches?page=1&limit=10`);
    await response.arrayBuffer();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((sum, value) => sum + value, 0) / times.length;
  console.log(JSON.stringify({
    ok: true,
    count,
    averageMs: Number(avg.toFixed(1)),
    p95Ms: Number(times[Math.floor(times.length * 0.95)]?.toFixed(1) ?? 0),
    maxMs: Number(times.at(-1)?.toFixed(1) ?? 0)
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
