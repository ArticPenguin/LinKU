# GA4 MP 이벤트 수집 불일치 조사

작성일: 2026-05-13

이 문서는 LinKU의 GA4 이벤트가 "모든 이벤트가 Measurement Protocol로 전송되는데도
왜 GA4 콘솔에는 `MP_`가 붙지 않은 이벤트가 많고, `MP_` 이벤트 수는 적게 보이는가"를
main 배포 기준으로 조사한 기록이다.

## 결론 요약

- 모든 이벤트는 `gtag.js`가 아니라 GA4 Measurement Protocol로 전송된다. 따라서
  이벤트 이름에 `MP_`가 없다고 해서 MP로 전송되지 않은 것은 아니다.
- `MP_`는 전송 방식이 아니라 택소노미 정립 이후 신규 이벤트를 구분하기 위한 이름
  컨벤션이다.
- 배포 기준으로 봐야 할 브랜치는 `upstream/main`이며, 2026-05-13 현재
  `upstream/main`은 `ee23ab4`(`v1.5.52`)다.
- `upstream/main`에는 PR #71의 GA4 작업이 들어갔지만, 현재 작업 브랜치
  `feat/ga4-MP`의 후속 4개 커밋은 들어가지 않았다.
- 특히 `26f28c0 fix: tighten GA4 tracking instrumentation`이 main에 없어서,
  헤더 설정 버튼은 아직 `MP_settings_open`을 보내지 않고 `button_click`만 보낸다.
- `extension_open`, `extension_session_start`, `extension_first_open`은 신규 lifecycle
  이벤트지만 `MP_` prefix를 쓰지 않는다. 이 부분은 "신규 이벤트는 MP_ prefix"라는
  기획 문장과 코드가 어긋난 지점이다.
- GA4에 보이는 `navigation_tab_select`, `alerts_view_open`, `todo_view_open`,
  `auth_login_start` 같은 이벤트는 이전 배포/이전 커밋에서 이미 수집된 과거 데이터다.
  GA4의 이벤트 이력은 이름을 바꿨다고 사라지지 않는다.
- `MP_` 이벤트 수가 적은 가장 큰 이유는 실제 수집 시작이 2026-04-29 이후이고,
  템플릿/설정/갤러리 등 많은 신규 이벤트가 main 배포 코드에서 아직 호출되지 않거나
  해당 사용자 행동이 거의 발생하지 않았기 때문이다.

## 조사 기준

| 항목 | 기준 |
| --- | --- |
| 로컬 작업 브랜치 | `feat/ga4-MP` at `04e5689` |
| 로컬/개인 fork main | `origin/main` at `13e7199` (`v1.5.49`) |
| 배포 main으로 본 브랜치 | `upstream/main` at `ee23ab4` (`v1.5.52`) |
| GA4 property | `properties/486440728` |
| Measurement ID | `G-ECMY8N9FX4` |
| GA4 조회 시점 | 2026-05-13, Asia/Seoul |

`origin/main`과 로컬 `main`은 `upstream/main`보다 뒤처져 있다. 따라서 "main에 배포된
코드"를 볼 때 `origin/main`을 기준으로 잡으면 더 오래된 상태를 보게 된다.

## 브랜치와 배포 상태

현재 브랜치 관계는 다음과 같다.

| 비교 | 결과 |
| --- | --- |
| `HEAD` vs `upstream/main` merge-base | `4c8cc50 fix: address GA4 taxonomy review` |
| `HEAD` vs `origin/main` merge-base | `13e7199 chore: bump version to 1.5.49 [skip ci]` |
| `origin/main` | `HEAD`의 ancestor. 개인 fork main은 오래된 기준점이다. |
| `upstream/main` | `HEAD`와 서로 ancestor가 아니다. PR merge 이후 각자 갈라졌다. |

`upstream/main`에는 아래 GA4 PR이 들어가 있다.

| 커밋 | 의미 |
| --- | --- |
| `26aee06` | PR #71 `feat/ga4-MP` merge |
| `4c8cc50` | PR #71에 포함된 마지막 GA4 taxonomy review fix |
| `ee23ab4` | 이후 manifest version bump to `v1.5.52` |

하지만 현재 작업 브랜치에는 `upstream/main`에 없는 후속 커밋이 있다.

| 커밋 | main 포함 여부 | 의미 |
| --- | --- | --- |
| `26f28c0` | 미포함 | `sendSettingsOpen("header")` 재연결, gallery search 최초 mount 스킵, `sendGAEvent`의 `response.ok` 검사 추가 |
| `987b6af` | 미포함 | dashboard 보고서 문서 추가 |
| `3d36a6c` | 미포함 | `extension_day_active`, `extension_day_summary`, cohort/daily usage context 추가 |
| `04e5689` | 미포함 | retention dashboard 문서 보강 |

또한 현재 working tree에는 background analytics queue, popup startup wrapper,
clientId fallback 등 미커밋 변경이 더 있다. 이 변경은 main은 물론 현재 브랜치의
커밋에도 포함되지 않은 로컬 상태다.

## GA4 데이터 증거

최근 90일 `eventName`별 `eventCount` 상위 결과는 다음과 같았다.

| 이벤트 | eventCount |
| --- | ---: |
| `page_view` | 9012 |
| `link_click` | 6321 |
| `tab_change` | 1305 |
| `extension_open` | 1105 |
| `extension_session_start` | 774 |
| `button_click` | 157 |
| `extension_first_open` | 97 |
| `MP_todo_view` | 48 |
| `navigation_tab_select` | 25 |
| `search` | 11 |
| `MP_alerts_view` | 10 |
| `alerts_view_open` | 9 |
| `setting_change` | 8 |
| `todo_view_open` | 5 |
| `link_open` | 3 |
| `MP_banner_open` | 2 |
| `auth_login_fail` | 2 |
| `auth_login_start` | 2 |
| `MP_alertsItem_open` | 1 |
| `MP_search_submit` | 1 |
| `alerts_item_open` | 1 |
| `settings_credentials_saved` | 1 |

날짜별로 보면 흐름이 더 명확하다.

| 기간 | 관찰 |
| --- | --- |
| 2026-04-20 ~ 2026-04-26 | `page_view`, `link_click`, `tab_change`, `button_click`, `setting_change` 중심 |
| 2026-04-27 ~ 2026-04-28 | `extension_open`, `extension_session_start`, `extension_first_open`과 pre-MP taxonomy 이름 일부 등장 |
| 2026-04-29 이후 | `MP_todo_view`, `MP_alerts_view`, `MP_banner_open` 등 `MP_` 이벤트가 등장 |
| 2026-05-08 | `MP_search_submit` 1회 |
| 2026-05-13 | `MP_alertsItem_open` 1회 |

다음 이벤트는 최근 90일 조회에서 row가 0개였다.

| 기대 이벤트 | 해석 |
| --- | --- |
| `MP_settings_open` | 배포 main의 헤더 설정 버튼 call site에서 호출하지 않는다. |
| `MP_labs_open` | helper와 dialog open hook은 있으나 조회 기간에 수집된 row가 없다. |
| `MP_templateGallery_view` | 배포/사용자 행동/전송 성공 여부를 별도로 검증해야 한다. |
| `MP_templateGallery_search` | `4c8cc50` main은 최초 mount에서도 검색 이벤트를 보낼 수 있지만 실제 row는 없다. |
| `MP_templateEditor_view` | 템플릿 에디터 진입 데이터가 아직 수집되지 않았다. |
| `MP_template_createStart` | 템플릿 생성 행동 데이터가 아직 수집되지 않았다. |
| `MP_template_apply` | 템플릿 적용 행동 데이터가 아직 수집되지 않았다. |
| `MP_settingsCredentials_save/delete` | main 코드상 전송은 가능하지만 최근 row가 없다. |
| `extension_day_active` | `3d36a6c`에만 있고 main에 없다. |
| `extension_day_summary` | `3d36a6c`에만 있고 main에 없다. |

`button_click`을 custom dimension으로 나눠보면 설정 관련 현상은 코드와 일치한다.

| `button_name` | `button_location` | eventCount |
| --- | --- | ---: |
| `settings_icon` | `header` | 24 |
| `labs_icon` | `header` | 10 |
| `open_template_list` | `settings_dialog` | 4 |
| `google_login` | `settings_dialog` | 3 |
| `github_icon` | `header` | 2 |
| `google_logout` | `settings_dialog` | 2 |
| `logo_github` | `header` | 1 |
| `open_template_editor` | `settings_dialog` | 1 |

특히 `settings_icon/header`는 2026-05-12에도 1회 수집됐다. 이는 배포 main에서
설정 버튼이 여전히 `button_click`만 보내고 있다는 증거다.

## 코드 증거

### 모든 이벤트는 MP로 전송된다

`upstream/main:src/utils/analytics.ts`의 전송 흐름은 모든 helper가 내부
`sendGAEvent` 또는 lifecycle 전송 함수로 들어가고, 최종적으로
`https://www.google-analytics.com/mp/collect`에 `fetch`하는 구조다.

따라서 이벤트 이름이 `page_view`, `link_click`, `extension_open`이어도 전송 방식은
Measurement Protocol이다. `MP_` prefix는 GA4 전송 방식의 증거가 아니라 이름 정책이다.

### 레거시 이벤트 유지가 의도적으로 들어갔다

`f10a01a refactor(analytics): apply taxonomy convention, restore legacy events, remove duplicates and noise`
커밋은 아래 결정을 명시한다.

| 결정 | 결과 |
| --- | --- |
| `page_view` 재도입 | popup mount에서 `sendExtensionOpen`과 병렬 호출 |
| `link_open -> link_click` | 핵심 링크 이벤트는 legacy 이름으로 회귀 |
| `navigation_tab_select -> tab_change` | 탭 전환은 legacy 이름으로 회귀 |
| `system_error -> error` | 오류 이벤트는 legacy 이름으로 회귀 |
| `setting_change` 재도입 | credentials 저장/삭제에서 legacy와 신규 이벤트 병렬 전송 |
| 신규 이벤트 `MP_` prefix | auth/template/gallery/alerts/todo/labs 등 신규 helper에 적용 |

즉 "초기 5~6개 이벤트는 예외로 두고 나머지는 `MP_`"라는 방향 자체는 이 커밋에서
어느 정도 정리됐다.

### 설정 진입 이벤트는 추가됐다가 제거됐다

`3917fda feat(analytics): connect banner, settings_open, template create/delete events`
커밋은 `MainLayout` 설정 아이콘 클릭 시 `sendSettingsOpen("header")`를 연결했다.

그런데 `f10a01a`에서 이 연결이 제거됐다.

| 커밋 | 설정 버튼 동작 |
| --- | --- |
| `3917fda` | `sendButtonClick("settings_icon", "header")` + `sendSettingsOpen("header")` |
| `f10a01a` 이후 main | `sendButtonClick("settings_icon", "header")`만 유지 |
| `26f28c0` 현재 브랜치 | `sendSettingsOpen("header")` 재연결 |

따라서 GA4 콘솔에 `button_click/settings_icon`은 보이고 `MP_settings_open`은 없는 현상은
배포 main 코드와 맞다. 이건 GA4 수집 문제가 아니라 call site가 main에 없는 문제다.

### lifecycle 이벤트는 신규인데도 MP_가 아니다

`upstream/main`의 lifecycle 이벤트는 다음 이름으로 전송된다.

| 이벤트 | 배포 main 여부 | prefix |
| --- | --- | --- |
| `extension_first_open` | 있음 | `MP_` 없음 |
| `extension_session_start` | 있음 | `MP_` 없음 |
| `extension_open` | 있음 | `MP_` 없음 |
| `extension_day_active` | main 없음, `3d36a6c`에만 있음 | `MP_` 없음 |
| `extension_day_summary` | main 없음, `3d36a6c`에만 있음 | `MP_` 없음 |

문제는 `src/utils/analytics.ts` 상단 주석에서 "신규 이벤트(택소노미 정립 후 -
`MP_` prefix)" 아래에 lifecycle을 넣어두었다는 점이다. 실제 event name은
`extension_*`라서 문서/주석의 규칙과 코드가 완전히 일치하지 않는다.

이 부분이 "기획 의도대로 개발이 안 됐는가?"에 대한 가장 정확한 답이다.

- "MP로 전송"이라는 의미라면 개발은 되어 있다.
- "신규 이벤트 이름은 모두 `MP_`로 시작"이라는 의미라면 lifecycle 이벤트는 어긋났다.
- "legacy 5~6개만 예외"라는 의미라면 `extension_*`도 예외로 문서에 명시해야 한다.

### gallery search는 main에서 과잉 전송 가능성이 있었다

`4c8cc50 fix: address GA4 taxonomy review`는 `GalleryPage`의 검색/정렬 이벤트를
검색어가 없어도 보내도록 바꿨다. 이 상태에서는 gallery 최초 mount 직후에도
`MP_templateGallery_search`가 `query_length=0`으로 전송될 수 있다.

`26f28c0`은 최초 mount의 search 이벤트를 스킵하도록 고쳤지만, 이 커밋은 main에 없다.
다만 GA4에서는 아직 `MP_templateGallery_search` row가 없어 실제 과잉 수집 데이터는
관찰되지 않았다.

### 전송 실패 감지는 일부만 되어 있었다

`upstream/main`의 lifecycle 전송은 `response.ok`를 검사한다. 하지만 일반
`sendGAEvent`는 debug log만 남기고 `response.ok` 실패를 명시적으로 처리하지 않았다.

`26f28c0`은 일반 이벤트에도 `response.ok` 검사를 추가했지만 main에 없다. 따라서
main 기준으로는 일부 MP helper가 GA4에서 reject되어도 production에서는 실패를 놓칠 수
있다.

## 8개 이슈 정리와 처리 방향

| # | 이슈 | 원인 | 후속 처리 |
| ---: | --- | --- | --- |
| 1 | lifecycle 이벤트가 신규 taxonomy인데도 `MP_` prefix가 없었다. | `extension_*` 이름을 lifecycle 예외처럼 사용했지만 문서에는 신규 이벤트를 `MP_`로 설명했다. | `MP_extension_firstOpen`, `MP_extensionSession_start`, `MP_extension_open`, `MP_extensionDay_active`, `MP_extensionDay_summary`로 rename했다. |
| 2 | 설정 아이콘 클릭에서 `MP_settings_open`이 빠졌다. | `f10a01a`에서 중복 제거 중 `sendSettingsOpen("header")` call site가 제거됐다. | `MainLayout.tsx`에서 설정 열기 의미 이벤트만 남기고 `button_click(settings_icon)` 중복은 제거한다. |
| 3 | gallery search가 최초 mount에서 noise를 만들 수 있었다. | 검색어/정렬 기본값 상태에서도 effect가 실행될 수 있었다. | 최초 기본 상태 1회는 스킵하고, 실제 검색어 또는 정렬 변경부터 `MP_templateGallery_search`를 보낸다. |
| 4 | 일반 이벤트 전송 실패를 production에서 놓칠 수 있었다. | `sendGAEvent`가 `/mp/collect` 응답의 `ok` 상태를 검사하지 않았다. | `response.ok` 검사와 background dispatch queue를 통해 실패 요청을 짧게 재시도할 수 있게 한다. |
| 5 | 검색 이벤트에 원문 검색어가 들어갔다. | `MP_search_submit`가 `search_term`을 보냈고, taxonomy는 개인정보/저장 최소화를 위해 길이만 요구했다. | 원문을 제거하고 trim 후 `query_length`, `search_location`만 보낸다. |
| 6 | credentials 저장/삭제에서 같은 시점 이벤트가 둘로 갈라졌다. | legacy `setting_change`와 신규 `MP_settingsCredentials_*`를 별도 요청으로 보냈다. | 동일 MP 요청의 events 배열로 묶어 순서와 세션 컨텍스트를 맞춘다. |
| 7 | Labs 열기 이벤트에 진입점이 없었다. | `MP_labs_open` helper가 parameter 없이 전송됐다. | 기본 `entry_point="header"`를 붙이고 필요 시 call site에서 override할 수 있게 한다. |
| 8 | 알림 구독 변경 parameter명이 taxonomy와 달랐다. | 코드가 `subscription_result`를 사용했고 문서는 공통 `result`를 요구했다. | `category`, `result` 구조로 통일한다. |

## 왜 MP_ 이벤트 수가 적은가

원인은 하나가 아니라 여러 층이 겹쳐 있다.

1. `MP_` 이벤트는 2026-04-29 이후부터 관찰된다. `page_view`, `link_click`,
   `tab_change`는 그 전부터 계속 쌓였기 때문에 누적량 차이가 크다.
2. `link_click`, `page_view`, `tab_change`는 팝업을 열고 쓰는 거의 모든 사용자에게서
   발생한다. 반면 `MP_template*`, `MP_settings*`, `MP_labs*`는 특정 기능을 들어가야만
   발생한다.
3. main에는 `26f28c0`이 없어서 대표적인 `MP_settings_open` call site가 빠져 있다.
4. `extension_day_active`와 `extension_day_summary`는 문서와 현재 브랜치에는 있지만
   main에는 없다.
5. GA4 콘솔의 날짜 범위가 길면 이전 taxonomy 이벤트와 최신 taxonomy 이벤트가 한 화면에
   같이 보인다.
6. 일반 `sendGAEvent`의 `response.ok` 검사가 main에 없어서, 일부 이벤트 실패를
   production 로그/GA4만으로 추적하기 어렵다.

## 기획 의도와 실제 구현의 차이

| 기획/의도 | main 실제 상태 | 판정 |
| --- | --- | --- |
| Chrome Extension이라 GA4는 MP-only로 보낸다 | 모든 helper가 `/mp/collect`로 전송 | 충족 |
| 기존 5~6개 이벤트는 연속성 때문에 유지한다 | `page_view`, `link_click`, `tab_change`, `button_click`, `setting_change`, `error` 유지 | 충족 |
| 그 외 신규 taxonomy 이벤트는 `MP_` prefix를 쓴다 | 대부분 신규 도메인 이벤트는 `MP_`, lifecycle은 `extension_*` | 부분 불일치 |
| 설정 진입은 `MP_settings_open`으로 본다 | main call site에서 빠짐 | 불일치 |
| gallery search 최초 mount noise를 막는다 | main에는 스킵 로직 없음 | 불일치 |
| 일반 GA4 event 전송 실패를 감지한다 | main에는 일반 `sendGAEvent` `response.ok` 검사 없음 | 불일치 |
| 일일 활성/리텐션 전용 이벤트로 DAU/retention을 본다 | `extension_day_active/summary`는 main 미포함 | 미배포 |

## 정확한 원인

이번 혼란의 직접 원인은 "MP 전송 방식"과 "`MP_` 이벤트명 컨벤션"이 같은 단어로
섞인 것이다. 코드상 전송 방식은 전부 MP가 맞지만, 이벤트명은 legacy 연속성과 신규
택소노미를 구분하기 위해 일부만 `MP_`를 붙였다.

두 번째 원인은 커밋 흐름 중 `f10a01a`에서 중복 제거 명목으로 일부 call site를 제거한
것이다. 이 결정 자체는 의도적이었지만, 이후 보고서 요구사항에서는 `MP_settings_open`
같은 제품 의미 이벤트가 필요해졌다. `26f28c0`이 그 판단을 되돌렸지만 아직 main에
들어가지 않아 배포 데이터에는 반영되지 않았다.

세 번째 원인은 문서/브랜치 상태와 배포 main 상태가 달라진 것이다. 현재 로컬 문서와
작업 브랜치는 `extension_day_active`, background transport queue 같은 후속 설계를
포함하지만, 배포 main의 GA4 구현은 PR #71에 포함된 `4c8cc50` 상태가 마지막이다.
그래서 문서를 기준으로 GA4 콘솔을 보면 "있어야 할 이벤트가 없다"처럼 보인다.

## 앞으로의 방향

1. `26f28c0`의 코드 변경은 main에 반영해야 한다.
   - `sendSettingsOpen("header")` 연결
   - gallery search 최초 mount 스킵
   - 일반 `sendGAEvent`의 `response.ok` 검사

2. 2026-05-13 후속 작업에서는 lifecycle도 `MP_` prefix로 통일하기로 결정했다.
   - 신규 이름은 `MP_extension_firstOpen`, `MP_extensionSession_start`,
     `MP_extension_open`, `MP_extensionDay_active`, `MP_extensionDay_summary`다.
   - 기존 GA4에 이미 들어간 `extension_*` 이벤트명은 직접 수정하거나 rename할 수 없다.
   - 보고서에서는 cutover 전 기간을 볼 때 `extension_* OR MP_extension*`로 보정하고,
     cutover 이후 카드부터는 `MP_` 이름만 기준으로 삼는다.

3. `MP_extensionDay_active`와 `MP_extensionDay_summary`를 main에 배포해야 한다.
   - 배포하면 DAU, Day N retention, 1인당 하루 open/session 수를 커스텀 이벤트로 볼 수 있다.
   - 배포 전에는 GA4 웹 보고서에서 해당 카드가 0 또는 미수집으로 보일 수 있다.

4. GA4 검증은 날짜 범위를 나눠서 봐야 한다.
   - 2026-04-26 이전: legacy 기본 이벤트 중심
   - 2026-04-27 ~ 2026-04-28: transition 구간
   - 2026-04-29 이후: `MP_` 신규 이벤트 관찰 구간

5. 문서에는 "전송 방식 MP"와 "`MP_` prefix"를 반드시 분리해서 써야 한다.
   - "MP로 보낸 이벤트" = 현재 모든 GA4 이벤트
   - "`MP_` 이벤트" = taxonomy 정립 후 신규 도메인 이벤트 일부

## 후속 체크리스트

- [x] lifecycle 이벤트명을 `MP_` prefix 기준으로 rename하기로 결정한다.
- [x] 결정한 naming 정책을 `docs/GA4-Data-Taxonomy.md`와 `src/utils/analytics.ts` 상단
      주석에 반영한다.
- [ ] `upstream/main`에 없는 GA4 instrumentation fix를 병합한다.
- [ ] `docs/GA4-Dashboard-Reports.md`에서 배포 전/후 기준 이벤트를 명확히 표시한다.
- [ ] 배포 후 GA4에서 `MP_settings_open`, `MP_templateGallery_view`,
      `MP_extensionDay_active` 수집 여부를 날짜별로 확인한다.
- [ ] GA4 콘솔/Explore에서는 기존 이벤트와 신규 이벤트를 같은 카드에 섞지 않는다.
