/**
 * App.tsx - Root Layout Component
 * Standard React Router v6 pattern: App contains Outlet for child routes
 */

import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import { Toaster } from "./components/ui/sonner";
import { PostedTemplatesProvider } from "./contexts/PostedTemplatesContext";
import { sendError } from "./utils/analytics";
import { runPopupStartupAnalytics } from "./utils/popupStartupAnalytics";
import "./App.css";

function App() {
  // GA4: popup mount 시 MP lifecycle 이벤트와 page_view를 순서대로 전송
  useEffect(() => {
    void runPopupStartupAnalytics();
  }, []);

  return (
    <ErrorBoundary
      onError={(error: unknown) => {
        const msg = error instanceof Error ? error.message : String(error);
        sendError("react_error_boundary", msg, "popup_home");
      }}
      fallback={
        <div className="w-[500px] h-[600px] flex items-center justify-center p-8">
          <div className="text-center space-y-4">
            <h2 className="text-xl font-semibold text-destructive">
              오류가 발생했습니다
            </h2>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              새로고침
            </button>
          </div>
        </div>
      }
    >
      <PostedTemplatesProvider>
        {/* Outlet: React Router가 여기에 자식 라우트를 렌더링 */}
        <Outlet />

        {/* Global Toast Notifications */}
        <Toaster duration={2000} />
      </PostedTemplatesProvider>
    </ErrorBoundary>
  );
}

export default App;
