// Document pages (shown in the app as articles and pre-rendered for crawlers). See src/seo.ts.
import type { PageMeta } from './seo'

export const REPO_URL = 'https://github.com/myunsyeya/janggi-review'

export const LICENSES_PAGE: PageMeta = {
  path: '/licenses',
  title: '소스 코드와 오픈소스 라이선스 | 초한 장기',
  description: '초한 장기의 소스 코드(GPL-3.0)와 사용한 오픈소스 엔진, 신경망, 효과음의 라이선스 안내.',
  changefreq: 'yearly',
  priority: 0.2,
  doc: true,
  body: `
<h1>소스 코드와 오픈소스 라이선스</h1>

<h2>초한 장기의 소스 코드</h2>
<p>이 사이트의 소스 코드는 <a href="https://www.gnu.org/licenses/gpl-3.0.html">GNU General Public License v3.0</a>
(또는 그 이후 버전)으로 공개되어 있어요. 누구나 받아서 쓰고, 고치고, 다시 배포할 수 있어요. 다시 배포할 때는 같은 라이선스로 소스를 함께 공개해야 해요.</p>
<p>소스 코드: <a href="${REPO_URL}">${REPO_URL}</a><br />
라이선스 전문: <a href="/licenses/GPL-3.0.txt">GPL-3.0.txt</a></p>

<h2>사용한 오픈소스</h2>
<ul>
  <li><b>Fairy-Stockfish</b> (WebAssembly 판 <code>fairy-stockfish-nnue.wasm</code> 1.1.12) — 장기 분석 엔진.
    GPL-3.0. 저작권 Fabian Fichter 외 Fairy-Stockfish·Stockfish 개발자들.
    소스: <a href="https://github.com/fairy-stockfish/Fairy-Stockfish">Fairy-Stockfish</a>,
    <a href="https://github.com/fairy-stockfish/fairy-stockfish.wasm">fairy-stockfish.wasm</a>.
    이 사이트는 수정하지 않은 공식 배포본을 그대로 씁니다.</li>
  <li><b>ffish</b> (<code>ffish-es6</code> 0.7.10) — 장기 규칙(합법수, 장군·외통 판정)을 계산하는 라이브러리.
    GPL-3.0. 저작권 Fabian Fichter, Johannes Czech.
    소스: <a href="https://github.com/fairy-stockfish/Fairy-Stockfish/tree/master/tests/js">Fairy-Stockfish/tests/js</a>. 수정 없이 사용.</li>
  <li><b>장기 NNUE 신경망</b> <code>janggi-9991472750de.nnue</code> — 엔진의 형세 평가. 작성자 belzedar_,
    배포처 <a href="https://fairy-stockfish.github.io/nnue/">Fairy-Stockfish NNUE networks</a>.</li>
  <li><b>React</b>, <b>React DOM</b> — MIT 라이선스, 저작권 Meta Platforms, Inc. 및 기여자.</li>
  <li><b>효과음</b> — Kenney "Casino Audio" (<a href="https://kenney.nl">kenney.nl</a>),
    <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>. 길이를 다듬고 음량을 맞춰서 사용.</li>
</ul>

<h2>그 밖의 것</h2>
<p>장기판, 기물, 아이콘은 이 사이트에서 직접 그렸어요. 화면 구성과 게임 리뷰 등급 이름은 chess.com을 참고했지만,
chess.com의 이미지·아이콘·소리는 쓰지 않았고 chess.com과 관련이 없는 개인 프로젝트예요.</p>
<nav><a href="/">온라인 대국</a> · <a href="/privacy">개인정보처리방침</a></nav>`,
}

export const PRIVACY_PAGE: PageMeta = {
  path: '/privacy',
  title: '개인정보처리방침 | 초한 장기',
  description: '초한 장기가 어떤 개인정보를 왜 처리하고 얼마나 보관하는지, 삭제는 어떻게 요청하는지 안내합니다.',
  changefreq: 'yearly',
  priority: 0.2,
  doc: true,
  body: `
<h1>개인정보처리방침</h1>
<p>초한 장기(이하 "사이트", myunsyeya.com)는 개인이 운영하는 무료 장기 사이트예요. 이용자의 개인정보를
「개인정보 보호법」에 따라 아래와 같이 처리합니다.</p>

<h2>1. 처리하는 개인정보와 목적</h2>
<table>
  <thead><tr><th>항목</th><th>목적</th><th>보관 기간</th></tr></thead>
  <tbody>
    <tr><td>닉네임, 계정 태그(#숫자)</td><td>대국 상대·순위에 표시, 계정 구분</td><td rowspan="4">계정 삭제를 요청할 때까지</td></tr>
    <tr><td>비밀번호</td><td>로그인. 원래 비밀번호는 저장하지 않고 되돌릴 수 없는 해시(scrypt)로만 보관</td></tr>
    <tr><td>레이팅, 대국 기록(수순·결과·일시)</td><td>대국 진행, 레이팅·순위·전적·게임 리뷰 제공</td></tr>
    <tr><td>프로필 사진(선택)</td><td>대국·순위 화면에 표시</td></tr>
    <tr><td>로그인 정보(세션 토큰)</td><td>로그인 유지. 이용자의 브라우저와 서버에 보관</td><td>로그아웃하거나 계정을 삭제할 때까지</td></tr>
    <tr><td>접속 기록(IP 주소, 접속 시각, 요청 주소, 브라우저 정보)</td><td>서비스 운영, 장애·부정 이용 대응</td><td>90일 (기록 파일을 나눠 보관하고 90일이 지난 파일은 자동 삭제)</td></tr>
  </tbody>
</table>
<p>이름, 연락처, 이메일 같은 정보는 받지 않아요. 가입은 닉네임과 비밀번호만으로 이루어집니다.</p>

<h2>2. 브라우저에 저장하는 정보</h2>
<p>로그인 유지를 위한 세션 토큰과 동시 접속자 수를 세기 위한 무작위 브라우저 ID를 이용자 브라우저의 저장소(localStorage)에
보관해요. 브라우저 데이터를 지우면 삭제됩니다.</p>
<p>사이트에는 Google 태그 관리자(Google Tag Manager)가 설치되어 있어요. 방문 통계 같은 도구를 연결하면 Google이 쿠키로
방문 정보를 수집할 수 있고, 그 경우 이 방침에 해당 내용과 국외 이전 사항을 추가로 안내합니다.</p>

<h2>3. 제3자 제공과 처리 위탁</h2>
<p>개인정보를 제3자에게 제공하거나 다른 업체에 처리를 맡기지 않아요. 닉네임, 태그, 프로필 사진, 레이팅, 대국 기록은
사이트의 성격상 다른 이용자에게 공개됩니다.</p>

<h2>4. 파기</h2>
<p>보관 기간이 끝나거나 삭제 요청을 받으면 지체 없이 서버에서 지워요. 접속 기록 파일은 90일이 지나면 자동으로 지워집니다.
삭제된 계정과 대국한 상대의 기록에는 대국 결과가 남을 수 있지만, 삭제된 계정을 알아볼 수 있는 정보는 지웁니다.</p>

<h2>5. 이용자의 권리</h2>
<p>자신의 개인정보를 열람·정정·삭제하거나 처리 정지를 요청할 수 있어요. 아래 연락처로 닉네임과 태그를 알려주시면
본인 확인(해당 계정 비밀번호로 로그인한 상태 확인 등)을 거쳐 처리합니다. 프로필 사진은 로비에서 직접 지울 수 있어요.</p>

<h2>6. 안전성 확보 조치</h2>
<ul>
  <li>모든 통신은 HTTPS로 암호화</li>
  <li>비밀번호는 원문 없이 해시로만 저장하고, 계정 태그도 비밀번호를 짐작할 수 없도록 서버 비밀키로 만듦</li>
  <li>데이터베이스와 서버 비밀키는 외부에서 접근할 수 없는 곳에 보관</li>
</ul>

<h2>7. 개인정보 보호책임자와 문의</h2>
<p>운영자: myunsyeya<br />
문의: <a href="${REPO_URL}/issues">GitHub 이슈</a> 또는 <a href="https://github.com/myunsyeya">github.com/myunsyeya</a></p>
<p>개인정보 침해에 대한 신고나 상담은 개인정보침해 신고센터(privacy.kisa.or.kr, 국번 없이 118),
개인정보 분쟁조정위원회(kopico.go.kr, 1833-6972)에도 할 수 있어요.</p>

<h2>8. 시행일</h2>
<p>이 방침은 2026년 10월 3일부터 적용됩니다. 내용이 바뀌면 이 페이지에서 알려드립니다.</p>
<nav><a href="/">온라인 대국</a> · <a href="/licenses">소스 코드와 라이선스</a></nav>`,
}

export const NOTATION_PAGE: PageMeta = {
  path: '/notation',
  title: '기보 표기법 — Hd3, ef4+ 읽는 법 | 초한 장기',
  description: '초한 장기의 기보 표기법. 줄 a~i와 선 1~10의 좌표, 기물 글자(K·A·E·H·C·R), 잡기·장군·한수쉼, 수 번호와 평가 읽는 법.',
  changefreq: 'yearly',
  priority: 0.5,
  doc: true,
  body: `
<h1>기보 표기법</h1>
<p>초한 장기의 분석판, 게임 리뷰, 연구는 모두 같은 방식으로 수를 적어요. 체스의 국제 표기법(SAN)을 장기에 맞게 옮긴 것이라,
한국에서 흔히 쓰는 숫자 좌표식 기보와는 생김새가 달라요. 이 페이지 하나만 보면 <code>1. ab4 ih7 2. Hg3 Hd8 3. Ce3</code> 같은 수순을 읽을 수 있어요.</p>

<h2>판의 좌표</h2>
<ul>
  <li><b>줄</b>(세로)은 <b>a~i</b>예요. 초 쪽에서 판을 볼 때 왼쪽 끝이 a, 오른쪽 끝이 i예요.</li>
  <li><b>선</b>(가로)은 <b>1~10</b>이에요. 초의 궁이 있는 쪽 끝이 1, 한 쪽 끝이 10이에요.</li>
  <li>칸은 줄과 선을 붙여 불러요. 초의 궁은 <b>e2</b>, 한의 궁은 <b>e9</b>에서 시작해요.</li>
</ul>

<h2>기물 글자</h2>
<table>
  <tr><th>글자</th><th>기물</th><th>영어 이름</th></tr>
  <tr><td>K</td><td>궁(楚·漢)</td><td>King (General)</td></tr>
  <tr><td>A</td><td>사(士)</td><td>Advisor (Guard)</td></tr>
  <tr><td>E</td><td>상(象)</td><td>Elephant</td></tr>
  <tr><td>H</td><td>마(馬)</td><td>Horse</td></tr>
  <tr><td>C</td><td>포(包)</td><td>Cannon</td></tr>
  <tr><td>R</td><td>차(車)</td><td>Chariot (Rook)</td></tr>
  <tr><td>없음</td><td>졸·병(卒·兵)</td><td>Soldier (Pawn)</td></tr>
</table>
<p>체스의 N(나이트), B(비숍)와 헷갈리지 않도록 마는 H, 상은 E로 적어요.</p>

<h2>수 적는 법</h2>
<ul>
  <li><b>기물 글자 + 도착 칸</b>: <code>Hd3</code>은 마가 d3로 가는 수, <code>Ce3</code>은 포가 e3로 가는 수예요.</li>
  <li><b>졸·병은 글자 없이 도착 칸만</b>: <code>e5</code>는 졸이 e5로 가는 수예요.
    잡을 때, 그리고 다른 졸도 같은 칸으로 갈 수 있을 때는 출발한 줄을 앞에 붙여요.
    <code>ab4</code>는 a줄 졸이 b4로(c4 졸도 b4로 갈 수 있으니까), <code>ef4</code>는 e줄 졸이 f4로 옆걸음하는 수예요.</li>
  <li><b>잡기는 x</b>: <code>Rxa10</code>은 차가 a10의 기물을 잡는 수예요.</li>
  <li><b>같은 기물 둘이 같은 칸으로 갈 수 있으면</b> 출발한 줄을 넣어요: <code>Che3</code>은 h줄의 포가 e3로.
    줄까지 같으면 출발한 선을, 그것도 같으면 출발 칸을 통째로 넣어요.</li>
  <li><b>장군은 +, 외통은 #</b>: <code>ef4+</code>는 졸이 비키면서 장군이 되는 수예요.</li>
  <li><b>한수쉼은 pass</b>예요.</li>
</ul>

<h2>수 번호</h2>
<p>초가 먼저 둬요. <code>1. ab4</code>는 초의 첫 수, <code>1... ih7</code>은 한의 첫 수예요(번호 뒤 점 세 개는 한의 차례라는 뜻).
그래서 <code>1. ab4 ih7 2. Hg3 Hd8 3. Ce3</code>은 이렇게 읽어요:
초 a4 졸이 b4로, 한 i7 병이 h7로, 초 마가 g3로, 한 마가 d8로, 초 포가 e3(면)으로.</p>

<h2>차림</h2>
<p><b>마상상마</b>, <b>상마상마</b>처럼 적는 차림은 각자 자기 쪽에서 볼 때 왼쪽 마·상 자리(초는 b·c줄, 한은 h·g줄)부터
오른쪽으로 읽어요. 초 상마상마는 b1 상, c1 마, g1 상, h1 마예요.</p>

<h2>평가 숫자와 기호</h2>
<ul>
  <li><b>+0.43</b>처럼 앞에 +가 붙으면 초에게, −가 붙으면 한에게 유리하다는 엔진(Fairy-Stockfish NNUE)의 평가예요.
    숫자가 클수록 차이가 커요. 엔진이 읽는 깊이에 따라 조금씩 달라져요.</li>
  <li><b>!</b> 좋은 수, <b>!!</b> 아주 좋은 수, <b>?</b> 실수, <b>??</b> 큰 실수, <b>!?</b> 흥미로운 수, <b>?!</b> 의심스러운 수.</li>
</ul>

<nav><a href="/study">장기 연구</a> · <a href="/analysis">장기 분석판</a></nav>`,
}
