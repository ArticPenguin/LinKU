# Codex에서 GA4 MCP 연결 중 ADC 문제를 트러블슈팅한 기록

작성일: 2026-05-06

이 글은 Codex에서 Google Analytics 4 데이터를 읽기 위해
`googleanalytics/google-analytics-mcp` 기반 로컬 MCP 서버를 붙이는 과정에서
겪은 ADC(Application Default Credentials) 문제를 정리한 기록이다.

핵심 결론은 단순하다.

- GA4 MCP 연결 자체와 Google API 인증 문제는 분리해서 봐야 한다.
- Google Analytics Data API를 읽으려면 ADC에 `analytics.readonly` scope가 있어야 한다.
- 기본 `gcloud auth application-default login --scopes=...` 흐름은 Google에서
  `차단된 앱`으로 막을 수 있다.
- 이 경우 OAuth Desktop client JSON을 만들어 `--client-id-file`로 ADC를 다시
  발급해야 한다.
- 로컬 ADC를 자주 바꾸는 개발 환경에서는 GA4 전용 ADC 파일을 별도로 복사해
  Codex MCP가 그 파일만 보게 하는 것이 안전하다.

전체 흐름은 다음과 같다.

1. LinKU Chrome Extension에 PA를 위해 GA4 Measurement Protocol 기반 이벤트를 붙였다.
2. 이벤트가 실제 GA4 속성에 원하는 형태로 수집되는지 Codex 안에서 확인하고 싶었다.
3. 처음에는 Smithery `google_analytics` MCP를 붙였지만 OAuth 흐름이 Composio로 이어져 원하는 구조가 아니었다.
4. Google 공식 `googleanalytics/google-analytics-mcp`를 로컬 stdio MCP 서버로 Codex에 등록했다.
5. MCP 도구 목록은 보였지만 실제 `get_account_summaries` 호출은 timeout 또는 403 scope 부족으로 실패했다.
6. 원인은 Codex가 읽는 ADC에 `analytics.readonly` scope가 없고, 기본 gcloud OAuth client로는 민감 scope 요청이 차단된 것이었다.
7. OAuth Desktop client JSON을 만든 뒤 `--client-id-file`과 GA4 scope를 함께 사용해 ADC를 다시 발급했다.
8. 최종적으로 Measurement ID가 속한 실제 `LinKU` property를 찾아 Data API report 호출까지 성공했고, 이후에는 GA4 전용 ADC 파일을 분리해 쓰는 방식이 안전하다는 결론을 얻었다.

## 배경

LinKU는 건국대학교 학생들이 자주 쓰는 학교 서비스 링크, 공지, todo, template,
도서관 좌석 현황 같은 기능을 한 곳에서 쓰기 위한 Chrome Extension이다. 사용자는
웹사이트가 아니라 확장 프로그램 popup UI 안에서 대부분의 행동을 한다.

최근 LinKU에 PA(Product Analytics)를 붙이기 위해 GA4 이벤트를 추가했다. 일반 웹
앱처럼 `gtag.js`나 Google Tag Manager를 심는 방식이 아니라, Chrome Extension
환경에 맞춰 GA4 Measurement Protocol로 이벤트를 직접 전송하는 방식이다. 예를
들면 popup이 열릴 때의 `page_view`, 헤더 검색의 `search`, 학교 서비스 링크 클릭의
`link_click`, 설정 변경이나 탭 전환 같은 제품 행동을 이벤트로 보낸다.

GA4 이벤트를 붙인 뒤 바로 다음 문제가 생겼다. 코드상으로 이벤트 전송 로직을
구현했다고 해서, 실제 GA4 속성에 원하는 형태로 데이터가 들어오고 있다고 확신할
수는 없었다. 확인하고 싶었던 것은 단순히 "이벤트가 있나?"가 아니었다.

- Chrome Extension 환경에서 Measurement Protocol payload가 실제로 수집되는가
- 이벤트 이름과 파라미터가 의도한 taxonomy대로 들어오는가
- development/debug 설정과 production 전송이 섞이지 않는가
- 최근 기간에 어떤 이벤트가 얼마나 들어왔는가
- 이후 이벤트 taxonomy를 수정하거나 PA 분석을 할 때 Codex가 GA4 데이터를 직접
  읽고 함께 점검할 수 있는가

이런 이유로 Codex에서 GA4 데이터를 바로 읽을 수 있게 MCP를 연결해보려 했다.
Codex가 GA4 Admin API와 Data API를 읽을 수 있으면, 코드 수정과 데이터 검증을 같은
작업 흐름 안에서 이어갈 수 있다. 예를 들어 `analytics.ts`의 이벤트 이름을 고친 뒤
GA4에서 최근 이벤트 목록을 확인하거나, 특정 속성의 custom dimension 설정을 보며
문서를 정리하는 식이다.

LinKU라는 이름의 GA4 property는 계정 안에 둘 이상 있었다. 처음에는
`properties/479579504`도 이름이 `LinKU`라서 이 속성을 조회했지만, 코드에 들어간
Measurement ID `G-ECMY8N9FX4`는 실제로 `properties/486440728`의 `chrome extension`
data stream에 속해 있었다. 이 차이 때문에 "API는 성공하는데 이벤트가 0개"처럼
보이는 두 번째 혼란이 생겼다. 이벤트 전송 쪽 배경은 `docs/GA4-Tracking.md`,
taxonomy 설계는 `docs/GA4-Data-Taxonomy.md`에 따로 정리해 두었다.

처음에는 Smithery의 `google_analytics` MCP를 Codex에 연결했다. Codex 설정에는
`https://server.smithery.ai/google_analytics/mcp` 형태의 원격 MCP URL이 등록됐고,
OAuth 화면에서는 Composio가 나타났다. 확인해보니 이 경로는 Smithery gateway를
통해 Composio 기반 Google Analytics connector를 쓰는 형태에 가까웠다.

원하는 방향은 이게 아니었다. 목표는 다음과 같았다.

- Composio 같은 cloud connector에 의존하지 않는다.
- Google에서 공식으로 제공하는 MCP 서버를 로컬에서 실행한다.
- Codex가 필요할 때 MCP 서버를 백그라운드 프로세스로 자동 실행한다.
- 인증은 로컬 Google ADC를 사용한다.

그래서 공식 저장소인 `googleanalytics/google-analytics-mcp`를 사용했다. 이 서버는
Python 패키지 `analytics-mcp`로 배포되고, stdio 기반 로컬 MCP 서버로 동작한다.

Codex에는 최종적으로 아래와 같은 형태로 등록했다.

```toml
[mcp_servers.google_analytics]
command = 'C:\Users\fast1\.local\bin\analytics-mcp.exe'

[mcp_servers.google_analytics.env]
GOOGLE_APPLICATION_CREDENTIALS = "C:\Users\fast1\AppData\Roaming\gcloud\application_default_credentials.json"
GOOGLE_PROJECT_ID = "wordpress-project-492003"
```

여기서 중요한 점은 `GOOGLE_APPLICATION_CREDENTIALS`가 OAuth client JSON을
가리키는 값이 아니라는 점이다. MCP 서버가 읽는 것은 Google client library가
사용할 ADC 파일이다.

## 문제 상황

설치와 MCP 등록 자체는 어렵지 않았다.

```powershell
python -m pip install --user pipx

& "C:\Users\fast1\AppData\Roaming\Python\Python311\Scripts\pipx.exe" install analytics-mcp

codex -c model_reasoning_effort=high mcp add `
  --env GOOGLE_APPLICATION_CREDENTIALS=C:\Users\fast1\AppData\Roaming\gcloud\application_default_credentials.json `
  --env GOOGLE_PROJECT_ID=wordpress-project-492003 `
  google_analytics `
  C:\Users\fast1\.local\bin\analytics-mcp.exe
```

Codex 재시작 후 `tool_search`로 확인하면 `mcp__google_analytics__` namespace가
노출됐다. 아래 도구들도 보였다.

- `get_account_summaries`
- `get_property_details`
- `get_custom_dimensions_and_metrics`
- `run_report`
- `run_realtime_report`
- `run_funnel_report`

처음에는 여기까지 보고 "연결됐다"고 판단하기 쉬웠다. 하지만 실제 도구 호출은
다른 문제였다.

Codex에서 `get_account_summaries`를 호출하면 120초 뒤 timeout이 났다.

```text
tool call failed for `google_analytics/get_account_summaries`

Caused by:
    timed out awaiting tools/call after 120s
```

그래서 MCP 연결 문제인지, Google API 인증 문제인지 분리해서 확인했다. MCP 서버의
Python 함수를 로컬에서 직접 호출해보면 더 구체적인 에러가 나왔다.

```text
403 Request had insufficient authentication scopes.
ACCESS_TOKEN_SCOPE_INSUFFICIENT
service: analyticsadmin.googleapis.com
method: google.analytics.admin.v1beta.AnalyticsAdminService.ListAccountSummaries
```

즉 MCP 서버 등록은 됐지만, MCP 서버가 사용하는 ADC에 GA4를 읽을 수 있는 scope가
없었다.

scope를 다시 발급하기 위해 아래 명령을 실행했다.

```powershell
gcloud auth application-default login `
  --scopes="https://www.googleapis.com/auth/analytics.readonly,https://www.googleapis.com/auth/cloud-platform"
```

하지만 브라우저 OAuth 화면에서 다음 메시지가 나왔다.

```text
차단된 앱
앱이 Google 계정의 민감한 정보에 액세스를 시도했습니다.
계정을 안전하게 보호하기 위해 Google에서 액세스를 차단했습니다.
```

이 시점에서 문제는 세 단계로 나뉘었다.

1. MCP 서버는 Codex에 등록돼 있다.
2. MCP 서버는 로컬 ADC를 읽는다.
3. 현재 ADC는 `analytics.readonly` scope가 없고, 기본 gcloud OAuth client로는
   해당 scope 재발급이 차단된다.

## 원인

원인은 ADC와 OAuth client의 역할을 구분하지 못하면 헷갈리기 쉽다.

ADC는 Google client library가 "어떤 credential을 쓸지" 찾는 전략이다. 로컬
개발 환경에서는 보통 다음 파일이 사용된다.

```text
C:\Users\<USER>\AppData\Roaming\gcloud\application_default_credentials.json
```

이 파일은 `gcloud auth application-default login` 명령으로 만들어진다. 중요한
점은 이 파일이 `gcloud` CLI 로그인 정보와 별개라는 점이다. `gcloud auth login`
이 되어 있어도, client library가 쓰는 ADC가 원하는 scope를 갖고 있다는 뜻은
아니다.

Google 공식 문서 기준으로 ADC 탐색 순서는 대략 다음과 같다.

1. `GOOGLE_APPLICATION_CREDENTIALS` 환경변수
2. `gcloud auth application-default login`이 만든 well-known ADC 파일
3. Google Cloud 런타임의 attached service account

이번 문제에서는 Codex MCP 설정이 `GOOGLE_APPLICATION_CREDENTIALS`로 위 ADC 파일을
명시하고 있었다. 따라서 MCP 서버는 전역 ADC 파일을 직접 사용했다.

문제는 그 ADC가 갖고 있던 scope였다. 기존 ADC token을 확인하면
`cloud-platform`은 있었지만 `analytics.readonly`가 없었다.

```text
email
https://www.googleapis.com/auth/cloud-platform
https://www.googleapis.com/auth/sqlservice.login
https://www.googleapis.com/auth/userinfo.email
openid
```

Google Analytics MCP README는 credential에 아래 scope가 반드시 필요하다고
안내한다.

```text
https://www.googleapis.com/auth/analytics.readonly
```

Google Analytics Data API quickstart도 사용자 계정 방식에서 다음 scope 조합을
사용한다.

```text
https://www.googleapis.com/auth/cloud-platform
https://www.googleapis.com/auth/analytics.readonly
```

그런데 `gcloud auth application-default login --scopes=...`를 기본 gcloud OAuth
client로 실행하면, Google 정책상 `This app is blocked` 또는 `Access blocked:
Authorization Error`가 날 수 있다. Google ADC troubleshooting 문서는 이 경우
`--client-id-file`로 직접 만든 OAuth client ID를 넘기거나, 서비스 계정
impersonation을 사용하라고 설명한다.

여기서 또 하나 주의할 점이 있다.

`client_secret_....json` 같은 OAuth Desktop client JSON은 ADC 파일이 아니다.
이 파일은 "OAuth 동의 화면에서 어떤 앱이 권한을 요청하는가"를 나타내는 client
식별자다. MCP 서버가 이 파일을 직접 읽으면 안 된다.

정리하면 역할은 다음과 같다.

| 항목 | 역할 | MCP에 직접 넣는가 |
| --- | --- | --- |
| OAuth Desktop client JSON | ADC를 새로 발급할 때 `gcloud`가 사용할 OAuth client 정보 | 아니오 |
| `application_default_credentials.json` | OAuth 완료 후 생성되는 실제 ADC 파일 | 예 |
| `GOOGLE_APPLICATION_CREDENTIALS` | Google client library가 읽을 credential 파일 경로 | 예 |

## 해결방법

### 1. OAuth Desktop client JSON을 만든다

Google Cloud Console에서 OAuth client를 만든다.

- Application type: `Desktop app`
- OAuth consent screen이 필요한 경우 테스트 사용자에 내 계정을 추가한다.
- 생성 후 client JSON을 다운로드한다.

예시 경로:

```text
C:\Users\fast1\dev\LinKU\LinKU_GA4_client_secrets.json
```

이 파일은 secret이므로 저장소에 commit하면 안 된다. 블로그나 문서에도 내용은
붙이지 말고 경로만 다룬다.

### 2. 기존 ADC를 GA4 scope 포함으로 다시 발급한다

PowerShell에서는 scope 전체를 따옴표로 감싸야 한다. 쉼표가 포함되어 있어 quoting이
깨지면 `cloud-platform scope is required but not requested` 같은 이상한 에러가
날 수 있다.

```powershell
gcloud auth application-default login `
  --client-id-file="C:\Users\fast1\dev\LinKU\LinKU_GA4_client_secrets.json" `
  --scopes="https://www.googleapis.com/auth/analytics.readonly,https://www.googleapis.com/auth/cloud-platform"
```

OAuth 브라우저 플로우를 완료하면 ADC 파일이 갱신된다.

```text
C:\Users\fast1\AppData\Roaming\gcloud\application_default_credentials.json
```

### 3. scope가 제대로 들어갔는지 확인한다

토큰 자체는 출력하거나 기록하지 않는다. tokeninfo 응답의 scope만 확인한다.

```powershell
$token = gcloud auth application-default print-access-token

Invoke-RestMethod "https://oauth2.googleapis.com/tokeninfo?access_token=$token" |
  Select-Object -ExpandProperty scope
```

정상이라면 아래 두 scope가 보여야 한다.

```text
https://www.googleapis.com/auth/analytics.readonly
https://www.googleapis.com/auth/cloud-platform
```

### 4. GA4 MCP가 실제로 계정과 속성을 읽는지 확인한다

단순히 MCP 도구 목록이 보이는 것만으로는 부족하다. 실제 Google API 호출까지
확인해야 한다.

예를 들어 로컬 MCP 패키지를 직접 호출해 `LinKU` 속성을 확인했다. 이때는 단순히
속성 이름만 믿지 않고, 코드의 Measurement ID가 속한 property id를 사용해야 한다.
현재 LinKU Chrome Extension 코드의 Measurement ID `G-ECMY8N9FX4`는
`properties/486440728`에 속한다.

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\Users\fast1\.codex\credentials\ga4_application_default_credentials.json"
$env:GOOGLE_PROJECT_ID = "wordpress-project-492003"

@'
import asyncio, json
from analytics_mcp.tools.admin.info import get_property_details
from analytics_mcp.tools.reporting.core import run_report

PROPERTY_ID = "486440728"

async def main():
    details = await get_property_details(PROPERTY_ID)
    events = await run_report(
        property_id=PROPERTY_ID,
        date_ranges=[{"start_date": "7daysAgo", "end_date": "today", "name": "last7IncludingToday"}],
        dimensions=["eventName"],
        metrics=["eventCount"],
        order_bys=[{"metric": {"metric_name": "eventCount"}, "desc": True}],
        limit=10,
    )
    print(json.dumps({
        "property": details.get("name"),
        "display_name": details.get("display_name"),
        "time_zone": details.get("time_zone"),
        "row_count": events.get("row_count"),
        "rows": events.get("rows", [])[:10],
    }, ensure_ascii=False, indent=2))

asyncio.run(main())
'@ | & "C:\Users\fast1\pipx\venvs\analytics-mcp\Scripts\python.exe" -
```

실제 확인 결과는 다음과 같았다.

```json
{
  "property": "properties/486440728",
  "display_name": "LinKU",
  "time_zone": "Asia/Seoul",
  "row_count": 10,
  "rows": [
    { "eventName": "extension_open", "eventCount": "526" },
    { "eventName": "page_view", "eventCount": "524" },
    { "eventName": "extension_session_start", "eventCount": "375" },
    { "eventName": "link_click", "eventCount": "371" }
  ]
}
```

추가로 최근 30일 총량 조회도 유효값을 반환했다.

```text
eventCount: 5784
activeUsers: 132
sessions: 1793
```

Realtime API도 `extension_open`, `page_view`, `link_click`,
`extension_session_start` 같은 이벤트를 반환했다. 즉 ADC와 MCP 연결은 정상이고,
LinKU Chrome Extension의 MP 이벤트도 Data API로 조회 가능했다.

처음에 `properties/479579504`를 조회했을 때 `row_count: 0`이 나온 것은 연결 실패가
아니라 다른 LinKU property를 보고 있었기 때문이다. 이 속성의 Web data stream은
`G-1ZDZXCBLQP`였고, 현재 코드의 Measurement ID `G-ECMY8N9FX4`와 달랐다.

### 5. 로컬 ADC를 자주 바꾸는 환경에서는 GA4 전용 ADC를 분리한다

개발자는 다른 프로젝트 때문에 `gcloud auth application-default login`을 자주
실행할 수 있다. 그러면 well-known ADC 파일이 계속 덮어써지고, GA4 MCP가 다시
scope 부족 상태가 될 수 있다.

이를 막으려면 정상 발급된 ADC를 Codex 전용 위치에 복사한다.

```powershell
New-Item -ItemType Directory -Force "C:\Users\fast1\.codex\credentials"

Copy-Item `
  "C:\Users\fast1\AppData\Roaming\gcloud\application_default_credentials.json" `
  "C:\Users\fast1\.codex\credentials\ga4_application_default_credentials.json" `
  -Force
```

그 다음 Codex MCP 설정을 전역 ADC가 아니라 복사본을 보게 바꾼다.

```toml
[mcp_servers.google_analytics]
command = 'C:\Users\fast1\.local\bin\analytics-mcp.exe'

[mcp_servers.google_analytics.env]
GOOGLE_APPLICATION_CREDENTIALS = "C:\Users\fast1\.codex\credentials\ga4_application_default_credentials.json"
GOOGLE_PROJECT_ID = "wordpress-project-492003"
```

이후 개인 기본 ADC는 원하는 프로젝트용으로 다시 바꿔도 된다.

```powershell
gcloud auth application-default login
```

GA4 MCP는 복사된 전용 ADC 파일을 계속 사용한다. 단, refresh token이 무효화되거나
Google 계정에서 앱 권한을 철회하면 GA4 전용 ADC도 다시 만들어야 한다.

2026-05-10에 이 방식으로 다시 정리했다. OAuth Desktop client로 GA4 scope 포함 ADC를
재발급한 뒤, 아래 전용 파일로 복사했다.

```text
C:\Users\fast1\.codex\credentials\ga4_application_default_credentials.json
```

그 다음 Codex MCP 설정도 이 전용 ADC를 보도록 재등록했다. 전용 ADC만 사용해서
`properties/486440728`의 `LinKU` 속성 메타데이터와 최근 이벤트 report가 정상 조회되는
것까지 확인했다.

## 조언

### MCP 연결과 API 권한을 분리해서 검증한다

MCP 도구 목록이 보인다는 것은 "서버가 등록됐고 tool schema를 반환했다"는 뜻이다.
Google API까지 읽을 수 있다는 뜻은 아니다.

권장 검증 순서는 다음과 같다.

1. `codex mcp get google_analytics`로 MCP 설정 확인
2. `tool_search` 또는 Codex 재시작 후 MCP tool namespace 노출 확인
3. `get_account_summaries` 같은 실제 API 호출 확인
4. 실패하면 로컬 Python에서 MCP 패키지 함수를 직접 호출해 Google API 에러를 확인
5. scope, API enablement, GA4 property 권한을 순서대로 확인

### `client_secret.json`과 ADC 파일을 혼동하지 않는다

OAuth Desktop client JSON은 로그인할 때만 사용한다. MCP 서버가 매번 읽는 파일은
OAuth 결과물인 ADC 파일이다.

잘못된 설정:

```toml
GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\client_secret_....json"
```

올바른 설정:

```toml
GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\application_default_credentials.json"
```

### scope는 반드시 tokeninfo로 확인한다

`gcloud auth application-default login`이 성공했다고 해서 필요한 scope가 들어갔다고
가정하지 않는다.

```powershell
$token = gcloud auth application-default print-access-token
Invoke-RestMethod "https://oauth2.googleapis.com/tokeninfo?access_token=$token" |
  Select-Object -ExpandProperty scope
```

`analytics.readonly`가 없으면 GA4 Admin API와 Data API 호출은 실패한다.

### Codex MCP 프로세스가 stale 상태가 될 수 있다

인증을 바꾸기 전에 이미 떠 있던 `analytics-mcp.exe` 프로세스가 있으면, Codex 세션이
이전 credential 상태를 물고 있거나 transport가 닫힌 상태가 될 수 있다.

이런 경우에는 Codex를 재시작하는 것이 가장 단순하다. 무작정 프로세스를 강제 종료하면
현재 Codex 세션의 MCP transport가 `Transport closed` 상태가 될 수 있다.

### 데이터가 0개인 것과 연결 실패를 구분한다

`run_report`가 성공했지만 `row_count`가 0일 수 있다. 이 경우는 연결 실패가 아니라
해당 기간에 조회 가능한 데이터가 없다는 뜻이다.

연결 확인용으로는 다음 순서가 더 안정적이다.

1. `get_account_summaries`: 계정 목록 접근 확인
2. `get_property_details`: 특정 속성 접근 확인
3. `run_report`: 실제 Data API 보고서 확인

다만 GA4 계정 안에 같은 이름의 property가 여러 개 있을 수 있다. 이 경우 property
display name이 아니라 코드에 들어간 Measurement ID가 어느 data stream에 속하는지
먼저 확인해야 한다.

이번 사례에서는 다음 두 속성이 모두 `LinKU`라는 이름을 갖고 있었다.

| Property | Data stream | Measurement ID | 결과 |
| --- | --- | --- | --- |
| `properties/479579504` | `LinKU` | `G-1ZDZXCBLQP` | report는 성공하지만 이벤트 0건 |
| `properties/486440728` | `chrome extension` | `G-ECMY8N9FX4` | 코드가 전송하는 실제 stream, 이벤트 조회됨 |

콘솔에서 이벤트가 보이는데 API가 0건을 반환한다면 먼저 다음을 확인한다.

1. 코드에 들어간 Measurement ID
2. GA4 Admin API의 data stream Measurement ID
3. Data API를 호출하는 property id
4. `today` 포함 여부와 Realtime API 결과

이 네 가지를 맞춰봐야 "데이터가 없다"와 "다른 property를 보고 있다"를 구분할 수
있다.

### 민감 파일은 저장소 밖 또는 ignore된 위치에 둔다

다음 파일은 commit하면 안 된다.

- OAuth Desktop client JSON
- `application_default_credentials.json`
- GA4 전용 ADC 복사본

권장 위치 예시:

```text
C:\Users\fast1\.codex\credentials\ga4_application_default_credentials.json
```

프로젝트 루트에 잠깐 둬야 한다면 반드시 `.gitignore`로 막는다.

## 참고자료

- Google Analytics MCP 공식 저장소:
  <https://github.com/googleanalytics/google-analytics-mcp>
- Google Analytics Data API quickstart:
  <https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart?hl=ko&account_type=user>
- Google Cloud ADC 동작 방식:
  <https://cloud.google.com/docs/authentication/application-default-credentials>
- Google Cloud ADC troubleshooting:
  <https://cloud.google.com/docs/authentication/troubleshoot-adc#access_blocked_when_using_scopes>
- OAuth client 관리:
  <https://support.google.com/cloud/answer/15549257>
