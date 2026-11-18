# 회원 API (구글 시트 + 앱스 스크립트)

웹 `/account/`(계정 페이지)·`/login/`(플러그인 로그인)·플러그인 → 앱스 스크립트 웹 앱 → 구글 시트 '회원함'. 문의함(`tools/contact`)과 같은 방식이라 서버비가 없다.
설계는 gorani-plugin `docs/account_plan.md`(이용권·기능·권한, 인증 흐름, 처리방침과 맞춘 저장 항목).

## 처음 설정(한 번, 약 20분)

1. **구글 클라우드 OAuth 클라이언트** — 콘솔 > API 및 서비스 > 사용자 인증 정보 > OAuth 클라이언트 ID > 웹 애플리케이션.
   승인된 자바스크립트 출처 `https://gorani.site`(시험용 `http://localhost:8000`). 범위는 `openid email`만 쓴다 — 앱 심사 없음, 동의 화면 이름·로고는 브랜드 인증만.
2. 문의함과 같은 운영 계정으로 새 구글 시트 `회원함`. **확장 프로그램 > Apps Script** → `Code.gs`를 이 폴더 것으로 바꾸고, 프로젝트 설정에서 `appsscript.json` 보이기를 켜 이 폴더 것으로 바꾼다.
3. **프로젝트 설정 > 스크립트 속성**: `GOOGLE_CLIENT_ID` = 1의 클라이언트 ID.
4. 함수 목록에서 `setup` 실행 → 권한 승인(시트·외부 요청). 탭 `회원`·`이용권`·`연결`·`생성 기록`·`기록`이 생기고 이용권에 `free | Member | detail_advanced, history_sync`.
   예전 코드로 이미 `setup`했다면 다시 실행한다 — 없는 칸(`회원`의 `기록 저장`, `생성 기록`의 `주소`·`주소 영어`)과 탭만 더하고 있는 줄은 건드리지 않는다. 이용권 탭의 `free` 줄 `features`에는 `history_sync`를 손으로 더한다.
5. **배포 > 새 배포 > 웹 앱** — 실행 사용자 **나**, 액세스 **모든 사용자**. 나온 URL(`…/exec`)을
   - 웹: `assets/account.js` 맨 위 `ACCOUNT_API_URL`, 같은 곳 `GOOGLE_CLIENT_ID`(`/login/`·`/account/`·머리줄이 같이 쓴다 — 비어 있으면 머리줄 [로그인]이 숨고 페이지는 '준비 중')
   - 플러그인: `scripts/constants.py`의 `ACCOUNT_API_URL`(원격 설정 키 — 판 없이 `dev_deploy.py notices`로도 바꾼다)
6. 브라우저로 URL을 열어 `{"ok":true,"service":"gorani-account","configured":true}`를 확인한다.

코드를 고친 뒤에는 **배포 관리 > 수정 > 새 버전**(URL 유지). 고치기 전에는 `node tools/account/test.mjs`(가짜 시트·tokeninfo 위에서 전 동작 시험).

## API (`text/plain` POST, JSON 본문 `{action, …}`)

| action | 부르는 곳 | 보냄 | 받음 |
|---|---|---|---|
| `login` | 웹 `/login/` | `id_token`(GIS), 처음이면 `source{utm_source, utm_medium, utm_campaign, ref}`, `terms_v`·`privacy_v` | `session`, `user{email, created, new}`, `entitlement` — 처음이면 회원 줄을 만든다 |
| `grant` | 웹 `/login/` | `session`, `host`(rhino·sketchup·archicad) | `grant` — 일회용 교환권(5분, `claim` 한 번에 지움) |
| `claim` | 플러그인 받는 곳 | `grant`, `version` | `token`, `email`, `entitlement` |
| `me` | 플러그인(하루 1회)·웹 | `token` 또는 `session` | `email`, `entitlement`, `history`(기록 남기기 켜짐). 웹이면 `created`(가입일)·`connections[{id, host, version, created, seen}]`(웹 세션 빼고) |
| `logout` | 플러그인·웹 | `token`(그 연결) 또는 `session` + `token_id` | `ok` |
| `delete` | 웹 | `session` | `ok` — 회원 줄·연결·생성 기록 전부 지움(탈퇴) |
| `set_history_sync` | 웹 `/account/` | `session`, `on`, `clear`(끌 때 남은 기록도 지울지) | `on` |
| `history_add` | 플러그인(3D 생성 성공 뒤) | `token`, `entry`(아래) | `ok` — 꺼져 있으면 `{ok, off:true}`, 기능이 없으면 `no_feature` |
| `history_list` | 플러그인·웹 | `token` 또는 `session`, `host`(선택 — 그 프로그램 것만) | `on`, `available`(기능 있음), `items[]` 최근 것 먼저 |
| `history_update` | 플러그인·웹 | `token` 또는 `session`, `id`, `label`·`star` | `item` |
| `history_delete` | 플러그인·웹 | `token` 또는 `session`, `id` 또는 `all: true`(+ `host`면 그 프로그램 것만) | `deleted`(지운 수) |

- 실패는 `{ok:false, error}` — `invalid`(열쇠·교환권·ID 토큰, 남의·없는 기록), `invalid_host`, `invalid_entry`(`entry_id` 모양), `no_feature`, `too_fast`(같은 사람 1분 10번, 생성 기록은 60번), `not_configured`(`GOOGLE_CLIENT_ID` 없음), `unknown_action`, `server`.
- `entitlement` = `{plan, plan_name, features[], valid_until}`. 권한 = 이용권 탭의 기능 + 회원 줄 `extra_features` − `removed_features`. `plan_until`이 지나면 `free`, `status = blocked`면 손님(`Guest`, 기능 없음).
- ID 토큰은 tokeninfo로 확인한다(`aud` = 클라이언트 ID, `iss`, `email_verified`, `exp`).
- 열쇠(`token`·`session`)는 256비트 무작위, 시트에는 SHA-256만 적는다.

### 생성 기록 `entry`(플러그인 → `history_add`)

| 칸 | 모양 | 비고 |
|---|---|---|
| `entry_id` | `[A-Za-z0-9_-]{8,40}` | 생성 때 `context.json`에 적는 무작위 값. 같은 값을 다시 보내면 합친다(즐겨찾기·웹에서 바꾼 이름은 지킨다) |
| `built_at` | ISO 시각 | 없거나 틀리면 받은 시각 |
| `version`, `label` | 글 40·80자 | 판이 없으면 연결 줄의 판 |
| `address` | `{ko, en}` 각 120자 | 대상지 주소 — 국내는 필지 DB 주소와 영어 주소, 해외는 Nominatim을 `ko`·`en`으로 한 번씩. 계정 페이지는 좌표 대신 페이지 언어 것을 보이고, 없으면 다른 언어 것. 글 하나만 보내면 `ko` 칸(`주소`)에 들어간다 |
| `mode` | `lots`·`area`·`point` | |
| `center` | `[경도, 위도]` | 소수 6자리로 자른다 |
| `pnus` | 글 목록(50개까지) | 필지 방식 |
| `ring` | `[[경도, 위도], …]`(3~400점) | 구역 링 — 다른 PC에서 같은 대상지로 되살릴 때 쓴다(계정 페이지는 꼭짓점 수만 보인다) |
| `shape`, `radius` | `rect`·`circle`, m | 사각형은 반 변 |
| `detail` | `basic`·`advanced` | |
| `options` | 한 단계 `{키: 참거짓·숫자·40자 글}` | 3D 설정. `/`·`\`가 든 글(경로)·모르는 모양은 버린다 |
| `buildings` | 0 이상 정수 | |
| `made_2d` | `options`와 같은 꼴 | 계정 페이지는 `basemap`(용지 이름)·`sheets`(다이어그램 장수)·`tables`(조서)를 보인다 |

- 프로그램(`host`)은 보낸 값이 아니라 그 열쇠의 연결 줄에서 정한다 — 계정 페이지의 프로그램별 탭이 이것으로 나뉜다.
- 계정당 300개 — 넘치면 오래된 것부터 지우고 즐겨찾기는 마지막까지 남긴다.
- `history_list`의 줄에는 `token_id`(어느 PC인지)를 넣지 않는다.

## 시트

| 탭 | 칸 | 누가 |
|---|---|---|
| 회원 | `user_id`·`google_sub`·`email`·`plan`·`status`·`plan_until`·`extra_features`·`removed_features`·가입일·`terms_v`·`privacy_v`·가입 경로·마지막 확인·기록 저장(빈칸·`Y` = 켜짐, `N` = 꺼짐)·메모 | 자동 + 운영자(plan·status·plan_until·features·메모) |
| 이용권 | `plan`·이름·`features`(쉼표)·메모 | 운영자 — 줄을 더하면 판 없이 새 이용권 |
| 연결 | `token_hash`·`token_id`·`user_id`·`host`·판·만든 날·마지막 확인 | 자동 |
| 생성 기록 | `user_id`·`entry_id`·만든 시각·`token_id`·`host`·판·이름·주소·주소 영어·방식·중심(경도,위도)·대상(JSON)·범위(`rect:250`)·수준·3D 설정(JSON)·건물 수·2D 요약(JSON)·★·고친 시각 | 자동(플러그인·웹 계정 페이지) |
| 기록 | 날짜·사건(가입·연결·탈퇴)·host | 자동 — 메일 없이 숫자 세기 |

## 운영

- **막기**: 회원 줄 `status` = `blocked` → 다음 확인부터 손님 권한. **기능 하나만 열기·닫기**: `extra_features`·`removed_features`.
- **탈퇴 요청 메일**: 웹 계정 페이지(`gorani.site/account/`)의 [탈퇴]를 안내한다. 못 하면 회원 줄과 그 `user_id`의 연결·생성 기록 줄을 지운다.
- **장애**: 플러그인은 마지막 확인 뒤 30일까지 받은 권한을 쓴다. 길어지면 원격 설정 `ACCOUNT_ENABLED = false`(고급 누구나, 로그인 숨김).
- **개인정보**: 시트 공유는 운영자 둘만, 운영 계정은 2단계 인증. 지운 줄은 시트 버전 기록에 남으니 분기마다 정리한다(처리방침 6번).
- 무료 계정 한도: UrlFetch 하루 2만 회, 동시 실행 30 — 지금 규모(하루 생성 수십 번)에는 넉넉하다(확인 필요: 사용자가 크게 늘면 다시 본다).
