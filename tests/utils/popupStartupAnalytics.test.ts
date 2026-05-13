import { describe, expect, it, vi } from "vitest";
import { runPopupStartupAnalytics } from "../../src/utils/popupStartupAnalytics";

describe("runPopupStartupAnalytics", () => {
  it("sends page view after lifecycle analytics resolves", async () => {
    const calls: string[] = [];
    let resolveLifecycle: (() => void) | undefined;
    const sendExtensionOpen = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveLifecycle = () => {
            calls.push("MP_extension_open_resolved");
            resolve();
          };
        })
    );
    const sendPageView = vi.fn(async () => {
      calls.push("page_view");
    });

    const runPromise = runPopupStartupAnalytics({
      debugLog: vi.fn(),
      sendExtensionOpen,
      sendPageView,
    });

    await Promise.resolve();

    expect(sendExtensionOpen).toHaveBeenCalledWith("popup_home", "popup");
    expect(sendPageView).not.toHaveBeenCalled();

    resolveLifecycle?.();
    await runPromise;

    expect(calls).toEqual(["MP_extension_open_resolved", "page_view"]);
  });

  it("still sends page view if lifecycle analytics rejects", async () => {
    const sendExtensionOpen = vi.fn(async () => {
      throw new Error("lifecycle failed");
    });
    const sendPageView = vi.fn(async () => undefined);

    await expect(
      runPopupStartupAnalytics({
        debugLog: vi.fn(),
        sendExtensionOpen,
        sendPageView,
      })
    ).resolves.toBeUndefined();

    expect(sendPageView).toHaveBeenCalledWith("LinKU Extension - Popup");
  });
});
