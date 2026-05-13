import { BackgroundMessageType } from "../background/types";
import { warnLog } from "@/utils/logger";
import type { AnalyticsDispatchResponse } from "../background/types";

export interface AnalyticsDispatchRequest {
  url: string;
  payload: unknown;
}

export interface AnalyticsSendResult {
  success: boolean;
  queued?: boolean;
  status?: number;
  statusText?: string;
  responseText?: string;
  error?: string;
}

export function buildGARequestInit(payload: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  };
}

export async function fetchGARequest(
  request: AnalyticsDispatchRequest
): Promise<AnalyticsSendResult> {
  try {
    const response = await fetch(request.url, buildGARequestInit(request.payload));

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        statusText: response.statusText,
        responseText: await response.text().catch(() => ""),
      };
    }

    return {
      success: true,
      status: response.status,
      statusText: response.statusText,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function sendGARequest(
  request: AnalyticsDispatchRequest
): Promise<AnalyticsSendResult> {
  if (canUseBackgroundAnalytics()) {
    try {
      const response = (await chrome.runtime.sendMessage({
        type: BackgroundMessageType.ANALYTICS_EVENT,
        data: request,
      })) as AnalyticsDispatchResponse | undefined;

      if (response?.success) {
        return {
          success: true,
          queued: response.queued,
        };
      }

      warnLog("[GA] Background analytics dispatch failed:", response?.error);
    } catch (error) {
      warnLog("[GA] Background analytics dispatch unavailable:", error);
    }
  }

  return fetchGARequest(request);
}

function canUseBackgroundAnalytics(): boolean {
  return (
    typeof chrome !== "undefined" &&
    typeof chrome.runtime?.sendMessage === "function"
  );
}
