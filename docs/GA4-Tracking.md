# GA4 Tracking

LinKU는 Chrome Extension 환경에서 `gtag.js`나 Google Tag Manager를 사용하지 않고,
GA4 Measurement Protocol 요청을 직접 만든다. popup은 payload를 만들고,
background service worker가 실제 전송과 실패 큐를 담당한다.

## Overview

| 항목 | 현재 구현 |
| --- | --- |
| 전송 방식 | GA4 Measurement Protocol 직접 호출 |
| 전송 엔드포인트 | `https://www.google-analytics.com/mp/collect` |
| Measurement ID | `G-ECMY8N9FX4` |
| API Secret 소스 | `import.meta.env.VITE_GA_API_SECRET` |
| 환경 분기 | `VITE_ENVIRONMENT === "development"`이면 `debug_mode: 1` 파라미터 포함 |
| popup 역할 | client/session/cohort context와 event payload 구성 |
| background 역할 | `ANALYTICS_EVENT` 메시지 수신, GA fetch, 실패 요청 큐 저장/재시도 |
| 필수 권한 | `public/manifest.json`의 `https://www.google-analytics.com/*` host permission |

## Transport

1. 도메인 helper가 `src/utils/analytics.ts`에서 GA4 payload를 만든다.
2. `src/utils/analyticsTransport.ts`가 `chrome.runtime.sendMessage`로 background에
   `BackgroundMessageType.ANALYTICS_EVENT`를 보낸다.
3. `src/background/handlers/analytics.ts`가 request를 받아 GA4로 fetch한다.
4. background fetch가 실패하면 `chrome.storage.local["analyticsDispatchQueue"]`에
   최대 50개까지 보관한다.
5. background는 다음 analytics message, extension install/update, browser startup 때
   큐를 다시 flush한다.
6. background messaging 자체가 실패하면 popup에서 `keepalive: true` fetch로 fallback한다.

이 구조는 사용자가 popup을 빠르게 닫거나 외부 링크를 열 때 popup context가 종료되어
analytics fetch가 중단되는 문제를 줄이기 위한 것이다.

## Identity / Session

| 항목 | 값 / 동작 | 저장 위치 / 소스 |
| --- | --- | --- |
| `client_id` | 기기 기준 UUID v4. 동시 첫 호출은 같은 in-flight Promise를 공유 | `chrome.storage.local["clientId"]`, `src/utils/clientId.ts` |
| fallback `client_id` | storage 장애 시 popup/background runtime 세션 동안 재사용되는 `error-{uuid}` | module scope |
| `session_id` | 마지막 활동 기준 30분 이내면 유지, 초과 시 새 timestamp 문자열 생성 | `chrome.storage.local["sessionId"]`, `src/utils/analytics.ts` |
| `sessionTimestamp` | 최근 활동 시각 저장 | `chrome.storage.local["sessionTimestamp"]` |
| `engagement_time_msec` | 모든 이벤트에 고정값 `100` 추가 | `src/utils/analytics.ts` |

GA4의 `totalUsers`는 이 `client_id` 기준으로 집계된다. 같은 사람이 다른 브라우저
프로필이나 다른 기기에서 사용하면 별도 사용자로 잡힐 수 있다.

## Startup Lifecycle

`src/App.tsx`는 mount 시 `runPopupStartupAnalytics()`만 호출한다.

`runPopupStartupAnalytics()`는 아래 순서를 보장한다.

1. `sendExtensionOpen("popup_home", "popup")`
2. `sendPageView("LinKU Extension - Popup")`

이 순서는 fresh install 또는 새 세션에서 `page_view`가 먼저 session/client state를
만드는 race를 줄이기 위한 것이다.

## Lifecycle Events

`sendExtensionOpen(screenName, entryPoint)` 한 번 호출로 아래 이벤트를 같은 GA4 request에
묶어 보낸다.

| Event Name | 조건 | 의미 |
| --- | --- | --- |
| `MP_extension_firstOpen` | `firstOpenSent`가 없을 때 1회 | 해당 storage profile의 최초 실행 |
| `MP_extensionSession_start` | 기존 session이 없거나 30분 inactivity 초과 | LinKU 기준 새 세션 |
| `MP_extension_open` | popup mount마다 항상 | popup 실제 열림 |
| `MP_extensionDay_active` | analytics date별 1회 | 정확한 DAU/retention 분석 |
| `MP_extensionDay_summary` | 다음 날 첫 실행 시 전날 usage가 있으면 | 전일 open/session 요약 |

cohort/daily usage storage를 읽지 못해도 최소 `MP_extension_open`과 가능한 lifecycle 이벤트는
계속 전송한다. storage 갱신 실패는 analytics 전송 자체를 막지 않는다.

## Core Event Catalog

전체 taxonomy는 `docs/GA4-Data-Taxonomy.md`를 기준으로 한다.

| Event Name | Helper | Trigger / 조건 |
| --- | --- | --- |
| `page_view` | `sendPageView` | lifecycle 전송 후 legacy 연속성용으로 1회 |
| `link_click` | `sendLinkClick` | 링크 카드 또는 same-host 버튼 클릭 |
| `tab_change` | `sendTabChange` | popup 탭 전환 |
| `button_click` | `sendButtonClick` | 별도 의미 이벤트가 없는 범용 버튼 클릭 |
| `setting_change` | `sendSettingsCredentialsSaved/Deleted` 내부 | eCampus 인증정보 저장/삭제 legacy 연속성 |
| `error` | `sendError` | React error boundary 등 runtime 오류 |
| `MP_*` | 각 도메인 helper | extension lifecycle, auth, settings, alerts, todo, template, gallery, banner, labs |

## Reporting Notes

- `MP_extension_open`과 `MP_extensionSession_start`는 2026-05-13 이후 기준 이벤트다.
- 그 이전 popup open 연속성을 포함하려면 `page_view OR extension_open OR MP_extension_open`으로 보정한다.
- `MP_extensionSession_start`는 open이 아니라 30분 inactivity 기준 session이므로
  `MP_extension_open`보다 낮은 것이 정상이다.
- Chrome Web Store의 현재 설치 수와 GA4 active user는 다르다. GA4는 이벤트를 보낸
  `client_id`만 집계한다.

## Source Files

| 파일 | 역할 |
| --- | --- |
| `src/utils/analytics.ts` | GA4 payload 구성, lifecycle/session/cohort 처리 |
| `src/utils/analyticsTransport.ts` | background dispatch와 direct fetch fallback |
| `src/background/handlers/analytics.ts` | background GA fetch, 실패 큐 저장/flush |
| `src/background/types.ts` | background message type과 guard |
| `src/utils/clientId.ts` | 안정적인 `client_id` 생성/조회 |
| `src/utils/chrome.ts` | `chrome.storage.local` Promise 래퍼 |
| `src/utils/popupStartupAnalytics.ts` | popup startup analytics 순서 보장 |
| `src/App.tsx` | popup mount 시 startup analytics 호출 |
| `public/manifest.json` | GA endpoint host permission 선언 |
