import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  debugLog: vi.fn(),
  errorLog: vi.fn(),
  fetch: vi.fn(),
  getOrCreateClientId: vi.fn(),
  getStorage: vi.fn(),
  setStorage: vi.fn(),
  warnLog: vi.fn(),
}));

vi.mock("../../src/utils/clientId", () => ({
  getOrCreateClientId: mocks.getOrCreateClientId,
}));

vi.mock("../../src/utils/chrome", () => ({
  getStorage: mocks.getStorage,
  setStorage: mocks.setStorage,
}));

vi.mock("@/utils/logger", () => ({
  debugLog: mocks.debugLog,
  errorLog: mocks.errorLog,
  warnLog: mocks.warnLog,
}));

async function loadAnalyticsModule() {
  vi.resetModules();
  return import("../../src/utils/analytics");
}

describe("analytics transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();

    mocks.fetch.mockReset();
    mocks.getOrCreateClientId.mockReset();
    mocks.getStorage.mockReset();
    mocks.setStorage.mockReset();

    vi.stubEnv("VITE_GA_API_SECRET", "test-secret");
    vi.stubGlobal("fetch", mocks.fetch);
    vi.stubGlobal("chrome", {
      i18n: {
        getUILanguage: () => "ko-KR",
      },
      runtime: {
        getManifest: () => ({ version: "1.5.50" }),
      },
    });

    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 204,
      statusText: "No Content",
    });
    mocks.getOrCreateClientId.mockResolvedValue("client-id");
    mocks.setStorage.mockResolvedValue(undefined);
  });

  it("still sends MP_extension_open when daily usage storage fails", async () => {
    mocks.getStorage.mockImplementation(async (key: string) => {
      if (key === "sessionId" || key === "sessionTimestamp") {
        return undefined;
      }

      if (key === "firstOpenSent") {
        return true;
      }

      if (key === "analyticsCohortContext") {
        return {
          cohortDate: "2026-05-10",
          cohortSource: "first_open",
          cohortWeek: "2026-W19",
          installVersion: "1.5.50",
        };
      }

      if (key === "analyticsDailyUsage") {
        throw new Error("daily usage unavailable");
      }

      return undefined;
    });

    const { sendExtensionOpen } = await loadAnalyticsModule();

    await sendExtensionOpen("popup_home", "popup");

    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    const [, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body));
    const eventNames = payload.events.map((event: { name: string }) => event.name);

    expect(init.keepalive).toBe(true);
    expect(eventNames).toContain("MP_extensionSession_start");
    expect(eventNames).toContain("MP_extension_open");
  });

  it("sends generic events with keepalive", async () => {
    mocks.getStorage.mockImplementation(async (key: string) => {
      if (key === "sessionId") {
        return "session-id";
      }

      if (key === "sessionTimestamp") {
        return Date.now();
      }

      if (key === "analyticsCohortContext") {
        return undefined;
      }

      return undefined;
    });

    const { sendLinkClick } = await loadAnalyticsModule();

    await sendLinkClick("eCampus", "https://ecampus.konkuk.ac.kr/");

    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    const [, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body));

    expect(init.keepalive).toBe(true);
    expect(payload.events[0].name).toBe("link_click");
  });

  it("sends all lifecycle events with MP prefix names", async () => {
    mocks.getStorage.mockImplementation(async (key: string) => {
      if (key === "sessionId" || key === "sessionTimestamp") {
        return undefined;
      }

      if (key === "firstOpenSent") {
        return undefined;
      }

      if (key === "analyticsCohortContext") {
        return undefined;
      }

      if (key === "analyticsDailyUsage") {
        return undefined;
      }

      return undefined;
    });

    const { sendExtensionOpen } = await loadAnalyticsModule();

    await sendExtensionOpen("popup_home", "popup");

    const [, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body));
    const eventNames = payload.events.map((event: { name: string }) => event.name);

    expect(eventNames).toEqual([
      "MP_extension_firstOpen",
      "MP_extensionSession_start",
      "MP_extension_open",
      "MP_extensionDay_active",
    ]);
  });

  it("sends search submit length without the raw search term", async () => {
    mocks.getStorage.mockImplementation(async (key: string) => {
      if (key === "sessionId") return "session-id";
      if (key === "sessionTimestamp") return Date.now();
      return undefined;
    });

    const { sendSearchSubmit } = await loadAnalyticsModule();

    await sendSearchSubmit("  konkuk portal  ", "header");

    const [, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body));

    expect(payload.events[0]).toEqual(
      expect.objectContaining({
        name: "MP_search_submit",
        params: expect.objectContaining({
          query_length: 13,
          search_location: "header",
        }),
      })
    );
    expect(payload.events[0].params).not.toHaveProperty("search_term");
  });

  it("batches legacy and MP credential save events into one request", async () => {
    mocks.getStorage.mockImplementation(async (key: string) => {
      if (key === "sessionId") return "session-id";
      if (key === "sessionTimestamp") return Date.now();
      return undefined;
    });

    const { sendSettingsCredentialsSaved } = await loadAnalyticsModule();

    await sendSettingsCredentialsSaved();

    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    const [, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body));

    expect(payload.events.map((event: { name: string }) => event.name)).toEqual([
      "setting_change",
      "MP_settingsCredentials_save",
    ]);
  });

  it("uses shared taxonomy params for labs open and alerts subscription updates", async () => {
    mocks.getStorage.mockImplementation(async (key: string) => {
      if (key === "sessionId") return "session-id";
      if (key === "sessionTimestamp") return Date.now();
      return undefined;
    });

    const { sendLabsOpen, sendAlertsSubscriptionChange } = await loadAnalyticsModule();

    await sendLabsOpen();
    await sendAlertsSubscriptionChange("컴퓨터공학부", "subscribe");

    const labsPayload = JSON.parse(String((mocks.fetch.mock.calls[0] as [string, RequestInit])[1].body));
    const subscriptionPayload = JSON.parse(
      String((mocks.fetch.mock.calls[1] as [string, RequestInit])[1].body)
    );

    expect(labsPayload.events[0]).toEqual(
      expect.objectContaining({
        name: "MP_labs_open",
        params: expect.objectContaining({ entry_point: "header" }),
      })
    );
    expect(subscriptionPayload.events[0]).toEqual(
      expect.objectContaining({
        name: "MP_alertsSubscription_update",
        params: expect.objectContaining({
          category: "컴퓨터공학부",
          result: "subscribe",
        }),
      })
    );
    expect(subscriptionPayload.events[0].params).not.toHaveProperty("subscription_result");
  });
});
