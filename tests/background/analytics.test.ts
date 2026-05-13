import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  getStorage: vi.fn(),
  setStorage: vi.fn(),
  warnLog: vi.fn(),
}));

vi.mock("../../src/utils/chrome", () => ({
  getStorage: mocks.getStorage,
  setStorage: mocks.setStorage,
}));

vi.mock("@/utils/logger", () => ({
  warnLog: mocks.warnLog,
}));

describe("background analytics handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();

    mocks.fetch.mockReset();
    mocks.getStorage.mockReset();
    mocks.setStorage.mockReset();

    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("queues failed analytics requests for retry", async () => {
    mocks.getStorage.mockResolvedValue([]);
    mocks.setStorage.mockResolvedValue(undefined);
    mocks.fetch.mockRejectedValue(new Error("network down"));

    const { handleAnalyticsDispatch, ANALYTICS_QUEUE_STORAGE_KEY } = await import(
      "../../src/background/handlers/analytics"
    );
    const request = {
      payload: { client_id: "client-id", events: [{ name: "MP_extension_open", params: {} }] },
      url: "https://www.google-analytics.com/mp/collect?measurement_id=G-X&api_secret=secret",
    };

    const response = await handleAnalyticsDispatch(request);

    expect(response).toEqual({ success: true, queued: true });
    expect(mocks.setStorage).toHaveBeenCalledWith({
      [ANALYTICS_QUEUE_STORAGE_KEY]: [
        expect.objectContaining({
          attempts: 1,
          request,
        }),
      ],
    });
  });

  it("flushes queued analytics requests before sending the current request", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-05-10T12:00:00.000Z").getTime();
    vi.setSystemTime(now);

    const queuedRequest = {
      payload: { client_id: "old-client", events: [{ name: "page_view", params: {} }] },
      url: "https://www.google-analytics.com/mp/collect?measurement_id=G-X&api_secret=secret",
    };
    const currentRequest = {
      payload: { client_id: "new-client", events: [{ name: "link_click", params: {} }] },
      url: "https://www.google-analytics.com/mp/collect?measurement_id=G-X&api_secret=secret",
    };

    mocks.getStorage.mockResolvedValue([
      {
        attempts: 1,
        createdAt: now,
        id: "queued-1",
        request: queuedRequest,
      },
    ]);
    mocks.setStorage.mockResolvedValue(undefined);
    mocks.fetch.mockResolvedValue({ ok: true, status: 204, statusText: "No Content" });

    const { handleAnalyticsDispatch, ANALYTICS_QUEUE_STORAGE_KEY } = await import(
      "../../src/background/handlers/analytics"
    );

    const response = await handleAnalyticsDispatch(currentRequest);

    expect(response).toEqual({ success: true });
    expect(mocks.fetch).toHaveBeenNthCalledWith(
      1,
      queuedRequest.url,
      expect.objectContaining({ body: JSON.stringify(queuedRequest.payload) })
    );
    expect(mocks.fetch).toHaveBeenNthCalledWith(
      2,
      currentRequest.url,
      expect.objectContaining({ body: JSON.stringify(currentRequest.payload) })
    );
    expect(mocks.setStorage).toHaveBeenCalledWith({ [ANALYTICS_QUEUE_STORAGE_KEY]: [] });
  });

  it("drops queued analytics requests older than 30 minutes without retrying them", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-05-10T12:00:00.000Z").getTime();
    vi.setSystemTime(now);

    const expiredRequest = {
      payload: { client_id: "old-client", events: [{ name: "page_view", params: {} }] },
      url: "https://www.google-analytics.com/mp/collect?measurement_id=G-X&api_secret=secret",
    };
    const currentRequest = {
      payload: { client_id: "new-client", events: [{ name: "MP_extension_open", params: {} }] },
      url: "https://www.google-analytics.com/mp/collect?measurement_id=G-X&api_secret=secret",
    };

    mocks.getStorage.mockResolvedValue([
      {
        attempts: 1,
        createdAt: now - 30 * 60 * 1000 - 1,
        id: "expired-1",
        request: expiredRequest,
      },
    ]);
    mocks.setStorage.mockResolvedValue(undefined);
    mocks.fetch.mockResolvedValue({ ok: true, status: 204, statusText: "No Content" });

    const { handleAnalyticsDispatch, ANALYTICS_QUEUE_STORAGE_KEY } = await import(
      "../../src/background/handlers/analytics"
    );

    const response = await handleAnalyticsDispatch(currentRequest);

    expect(response).toEqual({ success: true });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledWith(
      currentRequest.url,
      expect.objectContaining({ body: JSON.stringify(currentRequest.payload) })
    );
    expect(mocks.setStorage).toHaveBeenCalledWith({ [ANALYTICS_QUEUE_STORAGE_KEY]: [] });
  });

  it("removes expired queue items before enqueueing a new failed request", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-05-10T12:00:00.000Z").getTime();
    vi.setSystemTime(now);

    mocks.getStorage.mockResolvedValue([
      {
        attempts: 2,
        createdAt: now - 31 * 60 * 1000,
        id: "expired-1",
        request: {
          payload: { client_id: "old-client", events: [{ name: "page_view", params: {} }] },
          url: "https://www.google-analytics.com/mp/collect?measurement_id=G-X&api_secret=secret",
        },
      },
    ]);
    mocks.setStorage.mockResolvedValue(undefined);
    mocks.fetch.mockRejectedValue(new Error("network down"));

    const { handleAnalyticsDispatch, ANALYTICS_QUEUE_STORAGE_KEY } = await import(
      "../../src/background/handlers/analytics"
    );
    const request = {
      payload: { client_id: "new-client", events: [{ name: "link_click", params: {} }] },
      url: "https://www.google-analytics.com/mp/collect?measurement_id=G-X&api_secret=secret",
    };

    const response = await handleAnalyticsDispatch(request);

    expect(response).toEqual({ success: true, queued: true });
    expect(mocks.setStorage).toHaveBeenLastCalledWith({
      [ANALYTICS_QUEUE_STORAGE_KEY]: [
        expect.objectContaining({
          attempts: 1,
          request,
        }),
      ],
    });
  });
});
