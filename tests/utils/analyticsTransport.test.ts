import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackgroundMessageType } from "../../src/background/types";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  sendMessage: vi.fn(),
}));

describe("analytics transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();

    mocks.fetch.mockReset();
    mocks.sendMessage.mockReset();

    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("dispatches GA requests through the background worker when available", async () => {
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: mocks.sendMessage,
      },
    });
    mocks.sendMessage.mockResolvedValue({ success: true });

    const { sendGARequest } = await import("../../src/utils/analyticsTransport");
    const payload = { client_id: "client-id", events: [{ name: "page_view", params: {} }] };

    const result = await sendGARequest({
      payload,
      url: "https://www.google-analytics.com/mp/collect?measurement_id=G-X&api_secret=secret",
    });

    expect(result.success).toBe(true);
    expect(mocks.sendMessage).toHaveBeenCalledWith({
      type: BackgroundMessageType.ANALYTICS_EVENT,
      data: {
        payload,
        url: "https://www.google-analytics.com/mp/collect?measurement_id=G-X&api_secret=secret",
      },
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("falls back to direct fetch when background messaging is unavailable", async () => {
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: mocks.sendMessage,
      },
    });
    mocks.sendMessage.mockRejectedValue(new Error("background unavailable"));
    mocks.fetch.mockResolvedValue({ ok: true, status: 204, statusText: "No Content" });

    const { sendGARequest } = await import("../../src/utils/analyticsTransport");
    const payload = { client_id: "client-id", events: [{ name: "link_click", params: {} }] };

    const result = await sendGARequest({
      payload,
      url: "https://www.google-analytics.com/mp/collect?measurement_id=G-X&api_secret=secret",
    });

    expect(result.success).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://www.google-analytics.com/mp/collect?measurement_id=G-X&api_secret=secret",
      expect.objectContaining({
        body: JSON.stringify(payload),
        keepalive: true,
        method: "POST",
      })
    );
  });
});
