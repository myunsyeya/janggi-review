# 초한 장기 (Chohan Janggi)

> 브라우저에서 바로 두는 온라인 장기와 AI 기보 분석 — https://myunsyeya.com

A web app for **janggi (Korean chess)** that brings chess.com-style analysis and game review to janggi, plus online rated play.
The engine (Fairy-Stockfish with a janggi NNUE network) runs in the visitor's browser via WebAssembly.

## Features

- **Analysis board** — the engine re-analyses after every move: evaluation bar, top 3 lines (hover a move for a mini-board
  preview, click it to play the line), best-move arrow, variation tree (right-click a move to promote/delete),
  right-click arrows and circles (Shift/Ctrl/Alt for colours), hold `f` to look from the other side.
- **Game review** — every position analysed at a fixed depth; each move is classified as brilliant, great, best, excellent,
  good, inaccuracy, mistake, miss or blunder (chess.com's categories, by expected-points loss), with accuracy and an
  evaluation graph. Moves you try during the review are judged on the spot.
- **Online play** — nickname + password accounts with Battle.net-style numeric tags (`name#1234`), automatic matchmaking,
  random sides, both players choose their setup (한 first, then 초), 10 min + 5 s, premove queue (including recaptures),
  pass, draw offers, resignation, Glicko-2 ratings, profile pictures, online counter.
- **Openings** — the current 포진 is named above the move list (chess.com style), e.g. `귀마 대 귀마: 엇상 · 최국수포진`,
  judged on the position so transpositions get the same name; moves that build the formation are marked as theory
  (이론에 있는 수) in game review. An **explorer** tab shows the moves played from the current position in this site's games.
- **Studies** (`/study`, menu 학습) — research notes laid out like lichess studies: topic list with study cards, and study
  pages with chapters, the board showing each move's arrows and highlights, an annotated move tree with variations, and the
  candidate next moves. The notes are written by the site's maintainer from engine analysis; readers can only like them.
- **Ranking** — leaderboard with win/draw/loss and win rate, nickname search, per-player history that opens in game review.
- Captured pieces and material lead (한 gets a 1.5-point komi), move-list results such as `1-0 (초 승) · 기권`, sounds.

## Opening sources

The 포진 taxonomy follows 나무위키 (귀마 포진, 원앙마 포진, 장기/용어), 위키책 (장기/초반 포진법) and the classification of
귀마 대 귀마 후수 포진 posted on DC 장기 마이너 갤러리 (2023-05-30), whose nine diagrams are reproduced as legal positions
in `scripts/test-openings.ts`. Example move orders are this project's own.

## Writing a study

Create `content/studies/<id>/study.json` (`title`, `topics`, `description`, `author`, `created`, `updated`) and chapter
files `01-name.pgn`, `02-…`, each starting with `[Chapter "…"] [Cho "상마상마"] [Han "마상마상"]`, then movetext such as
`1. ab4! { why [%cal Ga1a3] } (1. ih4 { … }) 1... Hd8 …`. `npm run build` checks every move and publishes the pages.

## Rules and notation

- Rules: Fairy-Stockfish's `janggimodern` — no bikjang, material counting, repetition rules compatible with Kakao Janggi.
  The single `VARIANT` constant in `src/janggi.ts` drives the board, the engine and the server.
- Notation: chess-style SAN with K (general), A (advisor), E (elephant), H (horse), R (chariot), C (cannon) and no letter for
  soldiers; `x` for captures, `+` check, `#` checkmate, chess-style disambiguation (`Hce4`, `R1xa3`), `pass`.
  Files a–i and ranks 1–10 from 초's side.
- Setup names (마상상마 …) are read from that player's own left.

## Architecture

```
src/            React app (Vite, TypeScript)
  janggi.ts       rules via ffish, FEN, SAN, setups, material
  engine.ts       Fairy-Stockfish WASM wrapper (a new request cancels the running search)
  review.ts       move classification and accuracy
  tree.ts         variation tree
  Analysis.tsx    analysis board and game review
  Play.tsx        login, lobby, live games, premoves
  Ranking.tsx     leaderboard and player records
  openings.ts     포진 recognition (formation, 맞상/엇상, 정형/변형, 후수 pawn variations, 최국수/김경만, 16번 기본수)
  openingLines.ts example lines for the learning pages and tests
  Explorer.tsx    explorer tab (server keeps per-position move statistics of finished games)
  StudyList.tsx, StudyPage.tsx   study list and study viewer; studyFormat.ts parses chapter files
  seo.ts, docs.ts page metadata and document pages (licenses, privacy)
content/studies/<id>/  study.json + NN-name.pgn chapters (PGN movetext in this site's notation, {comments},
                [%cal …] arrows, [%csl …] circles, glyphs, (variations)); compiled by scripts/studies.ts
server/         game server (Node 24 runs the TypeScript directly)
  index.ts        HTTP API (/api), WebSocket (/ws, /ws/presence), matchmaking, clocks, ratings, SQLite (node:sqlite)
  glicko2.ts      Glicko-2
scripts/
  studies.ts      build: compiles content/studies into public/studies/*.json (fails on any illegal move)
  seo.ts          post-build: pre-rendered HTML per page and per study chapter, sitemap.xml, 404.html
  setup-engine.sh copies the engine files and downloads the janggi NNUE (checksum verified)
  og-image.mjs    renders public/og.png
  test-openings.ts opening recognition tests (`npm test`)
  check-lines.cjs  engine check of the example lines (flags moves losing > 0.10)
  janggictl       operations helper (status, deploy, restart, logs, backup)
deploy/         example Caddyfile and launchd agents
```

The engine needs `SharedArrayBuffer`, so pages must be served with
`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`, over HTTPS or on localhost.
For the same reason third-party resources must send CORS or `Cross-Origin-Resource-Policy` headers.

## Getting started

Requires Node.js 24.

```sh
npm install
./scripts/setup-engine.sh   # engine files into public/engine (+ janggi NNUE download)
npm run server              # game server on 127.0.0.1:8787 (data in server/data/, created on first run)
npx vite                    # http://localhost:5173 — the dev server sets the isolation headers
```

`npm run build` type-checks, builds the app into `dist/` and runs the SEO step.

## Deployment

The reference setup is a single machine running:

- **Caddy** serving `dist/` with the isolation headers, proxying `/api/*` and `/ws*` to the game server, mapping
  `/analysis` to `analysis.html`, redirecting `*.html` URLs, and returning real 404s — see `deploy/Caddyfile`.
- The **game server** under a process manager (`deploy/*.plist` are macOS launchd agents; systemd works the same way).

Live games are kept in memory, so restarting the server ends them (`scripts/janggictl restart` refuses while games
are running). Finished games, ratings and accounts are in SQLite. Keep `server/data/secret`: it keys the account tags.

## SEO

Page metadata lives in `src/seo.ts` (title, description ≤ 80 characters, sitemap priority, crawlable body).
`scripts/seo.ts` writes one HTML file per page with canonical URL, Open Graph, Twitter card and JSON-LD
(WebSite, WebApplication, WebPage, BreadcrumbList), plus `sitemap.xml`. Static: `robots.txt`, `llms.txt`,
`manifest.webmanifest`, `og.png`. To add an article (e.g. an opening guide), add a `PageMeta` with `doc: true`.

## License

**GPL-3.0-or-later** (see `LICENSE`) — the browser bundle includes the GPL-3.0 library ffish.

Credits: [Fairy-Stockfish](https://github.com/fairy-stockfish/Fairy-Stockfish) and ffish (GPL-3.0, Fabian Fichter and
contributors), janggi NNUE network by belzedar_ ([Fairy-Stockfish NNUE](https://fairy-stockfish.github.io/nnue/)),
React (MIT), sound effects by [Kenney](https://kenney.nl) (CC0). Full list on the site's `/licenses` page.

The interface follows chess.com's analysis and game review, but no chess.com assets are used and this project is not
affiliated with chess.com.
