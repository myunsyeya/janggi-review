# 장기 분석 · 대국 (myunsyeya.com)

chess.com의 분석 페이지와 게임 리뷰를 장기로 옮긴 웹앱. 온라인 대국(매칭, Glicko-2 레이팅), 순위·전적 조회까지 있다.
운영 주소: https://myunsyeya.com

## 기능

- **분석판** (`#analysis`): 수를 둘 때마다 Fairy-Stockfish(NNUE)가 다시 분석. 평가 막대, 후보 3수, 최선수 화살표,
  변화도(수 우클릭 → 변화도 올리기/삭제), `f`를 누르고 있는 동안 반대편에서 보기, 우클릭 화살표·원(Shift 초록, Ctrl 빨강, Alt 파랑), 수순 클릭 시 그 지점까지 진행.
- **게임 리뷰**: 모든 국면을 깊이 16, MultiPV 2로 분석해 chess.com 등급(탁월한 수 … 블런더), 정확도, 평가 그래프를 매긴다.
  리뷰 중 새로 둔 수(변화도 포함)도 바로 평가한다. 기준은 `src/review.ts` 상단 참고.
- **대국** (`#play`): 닉네임+비밀번호 = 계정(배틀태그식 `닉#태그`, 처음 쓰는 조합이면 자동 생성). 대기 2명이면 매칭,
  초/한 무작위, 한→초 순서로 차림 선택(30초), 10분+5초, 프리무브, 한수쉼, 무승부 제안, 기권, 프로필 사진.
- **순위** (`#ranking`): 레이팅 순위, 승/무/패·승률, 닉네임 검색, 플레이어별 최근 대국(누르면 리뷰).

## 규칙과 표기

- 규칙: Fairy-Stockfish `janggimodern` — 빅장 없음, 점수 계산 있음, 카카오 장기와 맞춘 반복 수 규칙.
  `src/janggi.ts`의 `VARIANT` 하나가 화면·엔진·서버 모두를 정한다.
- 표기: 체스식 SAN. 궁 K, 사 A, 상 E, 마 H, 차 R, 포 C, 졸/병은 글자 없음. 잡으면 `x`, 장군 `+`, 외통 `#`,
  같은 기물 두 개가 같은 칸에 갈 수 있으면 체스처럼 구분(`Hce4`, `R1xa3`). 한수쉼은 `pass`. 좌표는 초 쪽에서 a–i, 1–10.
- 차림 이름(마상상마 등)은 그 사람 자신의 왼쪽부터 읽는다.

## 구조

```
src/            React 앱 (Vite)
  janggi.ts       규칙(ffish), FEN, SAN 표기, 차림
  engine.ts       Fairy-Stockfish WASM 래퍼 (요청이 새로 오면 이전 탐색을 끊음)
  review.ts       수 등급·정확도
  tree.ts         변화도 트리
  Analysis.tsx    분석판 + 게임 리뷰 탭
  Play.tsx        로그인, 로비, 대국
  Ranking.tsx     순위·전적
  sound.ts        효과음 (착수/잡기는 녹음 샘플, 나머지는 합성)
server/         게임 서버 (Node 24, TypeScript 그대로 실행)
  index.ts        HTTP API(/api), WebSocket(/ws), 매칭, 시계, 레이팅, SQLite
  glicko2.ts      Glicko-2
  data/           (git 제외) janggi.db, secret, avatars/
scripts/
  janggictl       운영 명령 (별칭 `janggi`)
  setup-engine.sh 엔진 파일을 public/engine 에 준비
```

엔진은 방문자의 브라우저에서 돈다(WASM, 멀티스레드). 그래서 페이지에 `Cross-Origin-Opener-Policy: same-origin`,
`Cross-Origin-Embedder-Policy: require-corp` 헤더가 꼭 있어야 하고, `localhost`나 HTTPS에서만 동작한다.
같은 이유로 다른 사이트의 이미지·소리·iframe은 그대로 불러올 수 없다.

## 운영 (이 Mac)

- Node: `~/.local/node/bin` (Homebrew·Xcode 도구 없이 설치). Caddy: `~/.local/bin/caddy`.
- 서비스는 launchd 사용자 에이전트로 돈다. 죽으면 다시 뜨고, 로그인하면 자동 시작.
  - `com.myunsyeya.caddy` — `~/.config/caddy/Caddyfile`. 443 포트로 `dist/`를 내보내고 `/api`, `/ws`는 게임 서버로.
    인증서는 Let's Encrypt, 443만 열려 있어 TLS-ALPN으로 받는다.
  - `com.myunsyeya.janggi-server` — `node server/index.ts`, 127.0.0.1:8787.
- 로그: `~/Library/Logs/janggi-server.log`, `~/Library/Logs/caddy/`.

```sh
janggi status          # 서비스 상태, 진행 중인 대국, 사이트 응답
janggi deploy          # 웹앱 빌드 (dist/ 교체, 재시작 필요 없음)
janggi restart         # 게임 서버 재시작. 진행 중인 대국이 있으면 거부 (-f로 강제)
janggi logs [caddy]    # 로그 보기
janggi caddy           # Caddyfile 수정 후 반영
janggi backup          # DB·secret·프로필 사진을 ~/janggi-backups/<시각>/ 에 복사
janggi stop | start
```

- 진행 중인 대국은 서버 메모리에만 있다. 서버를 재시작하면 사라진다(끝난 대국과 레이팅은 DB에 남음).
- `server/data/secret`을 잃으면 같은 닉네임·비밀번호로 새 계정을 만들 때 태그가 달라진다. 기존 계정 로그인은 문제없다.

### 처음부터 다시 설치할 때

```sh
npm install
./scripts/setup-engine.sh   # stockfish.*, ffish.wasm 복사 + 장기 NNUE 다운로드(SHA-256 확인)
npm run build
npm run server              # 또는 launchd 에이전트 등록
```

개발 중에는 `npx vite` (http://localhost:5173, 헤더는 `vite.config.ts`에 있음)와 `npm run server`를 같이 켜면 된다.

## 라이선스 메모

- Fairy-Stockfish WASM(`fairy-stockfish-nnue.wasm`), ffish(`ffish-es6`): GPL-3.0. 수정 없이 배포 중이며
  소스는 https://github.com/fairy-stockfish 에 있다.
- 장기 NNUE `janggi-9991472750de.nnue`: https://fairy-stockfish.github.io/nnue/ (belzedar_).
- 효과음 `public/sounds/*.wav`: Kenney "Casino Audio", CC0 (`public/sounds/LICENSE.txt`).
- 화면 구성은 chess.com을 따라 했지만, 아이콘·소리·이미지 같은 chess.com 자산은 쓰지 않았다.

`deploy/`에는 운영 설정의 사본이 있다(실제 위치: `~/.config/caddy/Caddyfile`, `~/Library/LaunchAgents/*.plist`).
설정을 바꾸면 사본도 같이 갱신해 둘 것.
