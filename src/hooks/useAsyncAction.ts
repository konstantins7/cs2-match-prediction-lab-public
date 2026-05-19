"use client";

import { useCallback, useRef, useState } from "react";

export function useAsyncAction<T>(
  handler: () => Promise<T>,
  options: { actionName?: string; onSuccess?: (data: T) => void; onError?: (error: Error) => void } = {}
) {
  const [isLoading, setIsLoading] = useState(false);
  const runningRef = useRef(false);

  const execute = useCallback(async () => {
    if (runningRef.current) return undefined;
    runningRef.current = true;
    setIsLoading(true);
    const start = performance.now();
    try {
      if (process.env.NODE_ENV === "development") console.log(`[action] ${options.actionName ?? "async_action"} started`);
      const result = await handler();
      const duration = performance.now() - start;
      if (process.env.NODE_ENV === "development") console.log(`[action] ${options.actionName ?? "async_action"} completed in ${duration.toFixed(0)}ms`);
      options.onSuccess?.(result);
      return result;
    } catch (error) {
      if (process.env.NODE_ENV === "development") console.error(`[action] ${options.actionName ?? "async_action"} failed`, error);
      const normalized = error instanceof Error ? error : new Error("Action failed.");
      options.onError?.(normalized);
      throw normalized;
    } finally {
      runningRef.current = false;
      setIsLoading(false);
    }
  }, [handler, options]);

  return { execute, isLoading };
}
