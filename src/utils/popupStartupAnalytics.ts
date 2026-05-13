import { sendExtensionOpen, sendPageView } from "./analytics";
import { debugLog } from "@/utils/logger";

interface PopupStartupAnalyticsDependencies {
  debugLog?: typeof debugLog;
  sendExtensionOpen?: typeof sendExtensionOpen;
  sendPageView?: typeof sendPageView;
}

export async function runPopupStartupAnalytics({
  debugLog: log = debugLog,
  sendExtensionOpen: sendLifecycleOpen = sendExtensionOpen,
  sendPageView: sendLegacyPageView = sendPageView,
}: PopupStartupAnalyticsDependencies = {}): Promise<void> {
  log(
    "%c여길 열어보시다니...\n이 참에 직접 코드 기여도 해주시는 건 어떤가요?",
    "font-family: Nanum Gothic; color: darkgreen; padding: 6px; border-radius: 4px; font-size:14px",
  );
  log("https://github.com/Turtle-Hwan/LinKU");

  try {
    await sendLifecycleOpen("popup_home", "popup");
  } catch {
    // Keep legacy page_view continuity even if a future lifecycle sender throws.
  }

  await sendLegacyPageView("LinKU Extension - Popup");
}
