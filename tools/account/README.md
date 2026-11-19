# 회원 (Firebase Auth + Realtime Database)

웹 `/login/`·플러그인 → Firebase(구글). 우리 서버·시트는 없다 — 계정은 Firebase Auth, 생성 기록·연결된 PC·설정은 Realtime Database(RTDB)에 본인만 읽고 쓴다(보안 규칙 `database.rules.json`).
결제수단을 걸지 않은 무료(Spark) 프로젝트라 요금이 나올 수 없다(한도를 넘으면 멈춘다). 설계는 gorani-plugin `docs/account_plan.md`('구성'·'Firebase 호출'·'Firebase에 남는 것'·'로그인에 기대지 않기').

## 처음 설정(한 번, 약 30분)

1. **프로젝트** — 고라니 운영 계정(gorani.3d@gmail.com, 2단계 인증)으로 [Firebase 콘솔](https://console.firebase.google.com/)에서 새 프로젝트. GA용 `gorani-stats`와 따로 만든다(결제 계정이 붙은 GCP 프로젝트에 넣으면 종량제가 된다). 결제수단은 넣지 않고, Google 애널리틱스 연결은 끈다.
2. **소유자** — 프로젝트 설정 > 사용자 및 권한: 운영자 두 사람의 개인 구글 계정을 소유자로 더한다(한 계정이 막혀도 멈추지 않게). 회사 계정은 넣지 않는다.
3. **Authentication** > 로그인 방법: **Google**만 켠다(지원 메일 gorani.3d@gmail.com). 설정 > 승인된 도메인: `gorani.site`(기본 `localhost`는 시험용으로 둔다).
4. **Realtime Database** > 데이터베이스 만들기: 위치 `asia-southeast1`(싱가포르 — 가장 가깝다), 잠금 모드 → 규칙 탭에 `database.rules.json`을 붙여 게시.
5. **웹 앱 등록** — 프로젝트 설정 > 일반 > 앱 추가(웹). 나온 `apiKey`·`projectId`와 RTDB 주소(`https://<프로젝트>-default-rtdb.asia-southeast1.firebasedatabase.app`)를 적어 둔다. Firebase Hosting은 쓰지 않는다(사이트는 GitHub Pages).
6. **API 키 제한** — [GCP 콘솔 > 사용자 인증 정보](https://console.cloud.google.com/apis/credentials) > 그 API 키: API 제한 = Identity Toolkit API·Token Service API. **HTTP 리퍼러 제한은 걸지 않는다** — 플러그인이 리퍼러 없이 securetoken을 부른다.
7. **OAuth** — 같은 화면의 'Web client (auto created by Google Service)'에 승인된 자바스크립트 출처 `https://gorani.site`(시험용 `http://localhost:8000`). OAuth 동의 화면: 외부, 앱 이름 Gorani, 홈 `https://gorani.site/`, 처리방침 `https://gorani.site/privacy/`, 지원 메일 gorani.3d@gmail.com → 브랜드 인증 신청(Search Console 도메인 인증이 먼저).
8. **값 넣기**
   - 웹: `login/index.html` 맨 위 `FIREBASE.apiKey`, `GOOGLE_CLIENT_ID`(7의 웹 클라이언트 ID).
   - 플러그인: `scripts/constants.py`의 `ACCOUNT_FIREBASE = {"api_key", "project_id", "db_url"}`(원격 설정 키 — 판 없이 `dev_deploy.py notices`로도 바꾼다). 비어 있으면 회원 기능이 꺼진 채(고급 누구나) 돈다.

켜지 않는 것: Blaze(종량제)·Identity Platform 업그레이드·전화 인증·Cloud Functions·Firebase Hosting — 결제수단이 필요하거나 요금이 날 수 있다.

## 호출 (REST — Firebase JS SDK 없음)

| 무엇 | 누가 | 주소 |
|---|---|---|
| 로그인·가입 | 웹 | `identitytoolkit.googleapis.com/v1/accounts:signInWithIdp` — 구글 ID 토큰 → 열쇠(refresh token)·토큰. 처음이면 계정이 생긴다 |
| 토큰 새로 받기 | 웹·플러그인 | `securetoken.googleapis.com/v1/token` — 열쇠 → 1시간 토큰(`email`·`user_id`, 있으면 `plan`·`plan_until`) |
| 플러그인으로 넘기기 | 웹 → 127.0.0.1 | `/login/`이 `http://127.0.0.1:<port>/gorani-login`에 최상위 폼 POST — `state` + `refresh_token`, 웹 쪽 고장이면 `state` + `error=service`. 플러그인이 `/login/done/?ok=1`·`ok=0`·`fallback=1`(`&lang&h`)로 넘긴다 |

- 거절로 보는 오류는 넷(`USER_DISABLED`·`USER_NOT_FOUND`·`TOKEN_EXPIRED`·`INVALID_REFRESH_TOKEN`)뿐이다. 나머지(접속 안 됨·5xx·한도·설정 오류·구글 버튼을 못 받음·키가 비어 있음)는 고장으로 보고 플러그인이 이번 고급을 연다('로그인에 기대지 않기').
- 열쇠는 폼 본문으로만 오가 주소·방문 기록에 남지 않는다. 웹은 이 브라우저의 열쇠를 localStorage `gorani_session`에 두고 '…(으)로 계속'에 쓴다.

## 시험

`node tools/account/e2e.mjs` — `fake_firebase.py`(가짜 Firebase·사이트·플러그인 받는 곳)를 띄우고 헤드리스 크롬(따로 만든 /tmp 프로필)으로 로그인·넘기기·거절·고장을 돈다. `--shots`면 바뀐 화면을 `.github/pr/`에 쓴다. 페이지는 localhost·127.0.0.1에서만 localStorage `gorani_account_test`의 시험 주소를 읽는다.

## 운영

- **막기**: Authentication > 사용자 > 그 계정 '사용 중지' — 플러그인은 다음 확인 때 손님이 된다.
- **탈퇴 요청 메일**: 콘솔에서 RTDB `users/<uid>`와 Authentication 사용자를 지운다.
- **고장**: 플러그인은 회원이면 받은 권한 그대로, 손님은 로그인을 시도하면 고급이 열린다. 서버가 틀린 거절을 하면(규칙·키 설정 실수) 원격 설정 `ACCOUNT_ENABLED = false`(고급 누구나, 로그인 숨김).
- **개인정보**: 콘솔 권한은 운영자 둘만(2단계 인증). 지우면 바로 사라진다(시트 버전 기록 같은 사본이 없다).
- 무료 한도(Spark): 인증은 지금 규모보다 훨씬 크고, RTDB는 저장 1 GB·내려받기 월 10 GB·동시 연결 100. 넘으면 요금 대신 멈춘다.
