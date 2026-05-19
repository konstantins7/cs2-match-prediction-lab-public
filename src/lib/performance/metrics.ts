type TimingMetric = {
  route: string;
  method: string;
  durationMs: number;
  at: string;
  status?: number;
};

const maxMetrics = 120;
const metrics: TimingMetric[] = [];

export function recordTiming(metric: TimingMetric) {
  metrics.push(metric);
  if (metrics.length > maxMetrics) metrics.splice(0, metrics.length - maxMetrics);
  if (process.env.NODE_ENV === "development" && process.env.ENABLE_DEBUG_API === "true") {
    console.log(`[perf] ${metric.method} ${metric.route} ${metric.durationMs.toFixed(1)}ms${metric.status ? ` status=${metric.status}` : ""}`);
  }
}

export async function timeAsync<T>(route: string, method: string, fn: () => Promise<T>, status?: (value: T) => number): Promise<T> {
  const start = performance.now();
  try {
    const value = await fn();
    recordTiming({ route, method, durationMs: performance.now() - start, at: new Date().toISOString(), status: status?.(value) });
    return value;
  } catch (error) {
    recordTiming({ route, method, durationMs: performance.now() - start, at: new Date().toISOString(), status: 500 });
    throw error;
  }
}

export function getPerformanceMetrics() {
  return [...metrics].reverse();
}
