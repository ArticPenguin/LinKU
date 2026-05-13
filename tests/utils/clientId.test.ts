import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  errorLog: vi.fn(),
  getStorage: vi.fn(),
  randomUUID: vi.fn(),
  setStorage: vi.fn(),
}));

vi.mock("../../src/utils/chrome", () => ({
  getStorage: mocks.getStorage,
  setStorage: mocks.setStorage,
}));

vi.mock("@/utils/logger", () => ({
  errorLog: mocks.errorLog,
}));

async function loadClientIdModule() {
  vi.resetModules();
  return import("../../src/utils/clientId");
}

describe("getOrCreateClientId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();

    mocks.getStorage.mockReset();
    mocks.randomUUID.mockReset();
    mocks.setStorage.mockReset();

    vi.stubGlobal("self", {
      crypto: {
        randomUUID: mocks.randomUUID,
      },
    });
  });

  it("shares one generated client id across concurrent first calls", async () => {
    mocks.getStorage.mockResolvedValue(undefined);
    mocks.setStorage.mockResolvedValue(undefined);
    mocks.randomUUID.mockReturnValueOnce("client-id-1").mockReturnValueOnce("client-id-2");

    const { getOrCreateClientId } = await loadClientIdModule();

    const [firstClientId, secondClientId] = await Promise.all([
      getOrCreateClientId(),
      getOrCreateClientId(),
    ]);

    expect(firstClientId).toBe("client-id-1");
    expect(secondClientId).toBe("client-id-1");
    expect(mocks.randomUUID).toHaveBeenCalledTimes(1);
    expect(mocks.setStorage).toHaveBeenCalledTimes(1);
    expect(mocks.setStorage).toHaveBeenCalledWith({ clientId: "client-id-1" });
  });

  it("reuses one session fallback id when storage is unavailable", async () => {
    mocks.getStorage.mockRejectedValue(new Error("storage unavailable"));
    mocks.randomUUID.mockReturnValueOnce("fallback-id-1").mockReturnValueOnce("fallback-id-2");

    const { getOrCreateClientId } = await loadClientIdModule();

    const firstClientId = await getOrCreateClientId();
    const secondClientId = await getOrCreateClientId();

    expect(firstClientId).toBe("error-fallback-id-1");
    expect(secondClientId).toBe("error-fallback-id-1");
    expect(mocks.randomUUID).toHaveBeenCalledTimes(1);
    expect(mocks.setStorage).not.toHaveBeenCalled();
  });
});
