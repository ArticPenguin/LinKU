# GA4 Dashboard Reports

이 문서는 LinKU Chrome Extension이 `GA4 Measurement Protocol`로 전송하는
커스텀 이벤트를 기준으로, GA4 대시보드와 Explore에서 만들 수 있는 지표와
아직 해석에 주의가 필요한 지표를 정리한다.

LinKU는 웹사이트가 아니라 Chrome Extension이므로 GA4의 기본 웹 자동 측정값을
그대로 제품 지표로 해석하지 않는다. 제품 분석의 기준은 `src/utils/analytics.ts`
에서 직접 전송하는 커스텀 이벤트다.

## 현재 생성 가능한 보고서

### 일일 사용량

| 보고서 | GA4 구성 | 해석 |
| --- | --- | --- |
| 일일 팝업 오픈 수 | Dimension: `date`, Metric: `eventCount`, Filter: `eventName = extension_open` | 사용자가 확장 팝업을 연 횟수 |
| 일일 세션 시작 수 | Dimension: `date`, Metric: `eventCount`, Filter: `eventName = extension_session_start` | LinKU 기준 30분 inactivity 이후 새 세션 수 |
| 일일 신규 설치/첫 실행 수 | Dimension: `date`, Metric: `eventCount`, Filter: `eventName = extension_first_open` | 해당 기기에서 처음 LinKU를 실행한 수 |
| 정확한 일일 활성 기기 수 | Dimension: `customEvent:active_date`, Metric: `eventCount`, Filter: `eventName = extension_day_active` | LinKU 기준 하루 1회 활성 기기 수 |
| 1인당 하루 팝업 오픈 수 | `extension_day_summary.open_count` 합 / `extension_day_active` count | active device당 일일 방문 횟수 |
| 1인당 하루 세션 수 | `extension_day_summary.session_count` 합 / `extension_day_active` count | active device당 LinKU 세션 수 |

주의: GA4 기본 `newUsers`는 LinKU의 MP-only 확장 환경에서는 의미 있게 채워지지
않을 수 있다. 신규 사용자는 `extension_first_open`을 기준으로 본다.

### 핵심 링크 사용

| 보고서 | GA4 구성 | 해석 |
| --- | --- | --- |
| 많이 누른 링크 | Dimension: `customEvent:link_name`, Metric: `eventCount`, Filter: `eventName = link_click` | 사용 빈도가 높은 학교/서비스 링크 |
| 링크 URL별 클릭 | Dimension: `customEvent:link_url`, Metric: `eventCount`, Filter: `eventName = link_click` | 실제 목적지 URL별 클릭량 |
| 탭별 사용량 | Dimension: `customEvent:tab_name`, Metric: `eventCount`, Filter: `eventName = tab_change` | 사용자가 전환한 탭 분포 |

### 설정, 공지, Todo 사용

| 보고서 | GA4 구성 | 해석 |
| --- | --- | --- |
| 설정 진입 수 | Filter: `eventName = MP_settings_open` | 설정 다이얼로그 진입 |
| eCampus 계정 저장/삭제 | Filter: `eventName = MP_settingsCredentials_save` 또는 `MP_settingsCredentials_delete` | 계정 저장/삭제 행동 |
| 공지 탭 진입 | Dimension: `customEvent:view_mode`, `customEvent:category`, Filter: `eventName = MP_alerts_view` | 공지 탭 사용 모드와 카테고리 |
| Todo 탭 진입 | Metric: `eventCount`, `customEvent:todo_count`, Filter: `eventName = MP_todo_view` | Todo 기능 진입과 당시 todo 개수 |

### 템플릿 기능 퍼널

| 보고서 | GA4 구성 | 해석 |
| --- | --- | --- |
| 에디터 진입 | Filter: `eventName = MP_templateEditor_view` | 템플릿 에디터 사용 시작 |
| 아이템 추가 | Filter: `eventName = MP_templateItem_add` | 편집 핵심 행동 |
| 저장 성공/실패 | Filter: `eventName = MP_templateSave_success` 또는 `MP_templateSave_fail` | 로컬 저장 결과 |
| 동기화 성공/실패 | Filter: `eventName = MP_templateSync_success` 또는 `MP_templateSync_fail` | 서버 동기화 결과 |
| 게시 성공/실패 | Filter: `eventName = MP_templatePublish_success` 또는 `MP_templatePublish_fail` | 갤러리 게시 결과 |
| 템플릿 적용 | Filter: `eventName = MP_template_apply` | 실제 메인 화면 적용 |

템플릿 이벤트는 코드에는 연결되어 있지만 실제 데이터는 아직 적다. 배포 후
사용자 플로우를 직접 실행해 DebugView와 일반 보고서에서 각각 확인해야 한다.

## 현재 제한

| 지표 | 현재 상태 | 이유 |
| --- | --- | --- |
| 성별, 연령, 관심사 | 제품 지표로 사용하기 어려움 | GA4 demographics는 Google signals, 광고 개인화 동의, threshold에 의존한다. MP-only 확장 이벤트에서 직접 만들 수 없다. |
| Day 28 이후 장기 리텐션 | 데이터 누적 필요 | `extension_day_active`가 배포된 이후부터 cohort별 누적이 시작된다. |
| 마지막 활성일 요약 | 다음 방문 전까지 지연 | `extension_day_summary`는 다음 날 이후 첫 실행 시 전날 값을 보낸다. |

## 리텐션 구현 이벤트

리텐션과 재방문률은 아래 이벤트를 기준으로 생성한다.

### `extension_day_active`

확장 팝업이 열린 날마다 기기 기준 1회만 전송한다.

| Param | Type | 목적 |
| --- | --- | --- |
| `active_date` | string | 일 단위 활성 기준일 |
| `cohort_date` | string | 리텐션 cohort 기준일 |
| `cohort_week` | string | 주간 cohort 기준 |
| `cohort_source` | string | `first_open` 또는 `migration` |
| `days_since_cohort` | number | cohort 이후 경과일 |
| `is_returning` | boolean | cohort 당일 이후 재방문 여부 |
| `app_language` | string | 브라우저/확장 UI 언어 |
| `extension_version` | string | 확장 버전 |
| `daily_session_count` | number | 당일 현재까지 세션 수 |
| `daily_open_count` | number | 당일 현재까지 팝업 오픈 수 |

### `extension_day_summary`

다음 날 첫 실행 시 전날 사용량을 요약해 전송한다.

| Param | Type | 목적 |
| --- | --- | --- |
| `summary_date` | string | 요약 대상일 |
| `cohort_date` | string | cohort 기준일 |
| `days_since_cohort` | number | 대상일 기준 cohort 경과일 |
| `session_count` | number | 해당 일자의 LinKU 세션 수 |
| `open_count` | number | 해당 일자의 팝업 오픈 수 |
| `app_language` | string | 브라우저/확장 UI 언어 |
| `extension_version` | string | 확장 버전 |

## 리텐션 구현 후 만들 수 있는 보고서

| 보고서 | GA4 구성 | 계산 |
| --- | --- | --- |
| 정확한 일일 활성 사용자 | `eventName = extension_day_active`, Metric: `eventCount` | 하루 1회 이벤트라 event count가 active device 수 |
| 신규/기존 사용자 분리 | Dimension: `customEvent:is_returning`, Filter: `extension_day_active` | `false`는 cohort 당일, `true`는 재방문 |
| Day N retention | Dimension: `customEvent:cohort_date`, `customEvent:days_since_cohort`, Filter: `extension_day_active` | Day N active / Day 0 active |
| 1인당 하루 세션 수 | `extension_day_summary`의 `session_count` 합 / `extension_day_active` count | LinKU 기준 daily active당 세션 |
| 1인당 하루 팝업 오픈 수 | `extension_day_summary`의 `open_count` 합 / `extension_day_active` count | LinKU 기준 daily active당 방문 |
