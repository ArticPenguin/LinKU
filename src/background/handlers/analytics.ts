import { getStorage, setStorage } from "@/utils/chrome";
import { fetchGARequest, type AnalyticsDispatchRequest } from "@/utils/analyticsTransport";
import { warnLog } from "@/utils/logger";
import type { AnalyticsDispatchResponse } from "../types";

export const ANALYTICS_QUEUE_STORAGE_KEY = "analyticsDispatchQueue";

const ANALYTICS_QUEUE_TTL_MS = 30 * 60 * 1000;
const MAX_ANALYTICS_QUEUE_SIZE = 50;

interface QueuedAnalyticsRequest {
  attempts: number;
  createdAt: number;
  id: string;
  request: AnalyticsDispatchRequest;
}

export async function handleAnalyticsDispatch(
  request: AnalyticsDispatchRequest
): Promise<AnalyticsDispatchResponse> {
  await flushAnalyticsQueue();

  const result = await fetchGARequest(request);

  if (result.success) {
    return { success: true };
  }

  await enqueueAnalyticsRequest(request);
  warnLog("[Background] Analytics request queued after dispatch failure", {
    error: result.error,
    status: result.status,
  });

  return { success: true, queued: true };
}

export async function flushAnalyticsQueue(): Promise<void> {
  const storedQueue = await readAnalyticsQueue();
  const queue = filterFreshQueueItems(storedQueue);

  if (queue.length === 0) {
    if (storedQueue.length > 0) {
      await setStorage({ [ANALYTICS_QUEUE_STORAGE_KEY]: [] });
    }

    return;
  }

  const remainingQueue: QueuedAnalyticsRequest[] = [];

  for (const item of queue) {
    const result = await fetchGARequest(item.request);

    if (!result.success) {
      remainingQueue.push({
        ...item,
        attempts: item.attempts + 1,
      });
    }
  }

  await setStorage({ [ANALYTICS_QUEUE_STORAGE_KEY]: remainingQueue });
}

async function enqueueAnalyticsRequest(
  request: AnalyticsDispatchRequest
): Promise<void> {
  const queue = filterFreshQueueItems(await readAnalyticsQueue());
  const nextQueue = [
    ...queue,
    {
      attempts: 1,
      createdAt: Date.now(),
      id: crypto.randomUUID(),
      request,
    },
  ].slice(-MAX_ANALYTICS_QUEUE_SIZE);

  await setStorage({ [ANALYTICS_QUEUE_STORAGE_KEY]: nextQueue });
}

function filterFreshQueueItems(
  queue: QueuedAnalyticsRequest[]
): QueuedAnalyticsRequest[] {
  const oldestAllowedCreatedAt = Date.now() - ANALYTICS_QUEUE_TTL_MS;

  return queue.filter((item) => item.createdAt >= oldestAllowedCreatedAt);
}

async function readAnalyticsQueue(): Promise<QueuedAnalyticsRequest[]> {
  try {
    const queue = await getStorage<QueuedAnalyticsRequest[]>(
      ANALYTICS_QUEUE_STORAGE_KEY
    );

    return Array.isArray(queue) ? queue : [];
  } catch (error) {
    warnLog("[Background] Failed to read analytics queue", error);
    return [];
  }
}
