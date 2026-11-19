/* ---------------- 교회 게임나이트 · 폰모드 공용 모듈 ---------------- */
/* 방 코드 생성, MQTT 연결(공용 브로커, 로그인 없음), 게임 카탈로그, 유틸 */

const TOPIC_PREFIX = 'syr-gamenight';
const BROKER_URLS = [
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://broker.emqx.io:8084/mqtt',
];

function uid(len) {
  len = len || 8;
  let s = '';
  while (s.length < len) s += Math.random().toString(36).slice(2);
  return s.slice(0, len);
}

function genRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0/O, 1/I 제외(혼동 방지)
  const len = 4 + Math.floor(Math.random() * 3); // 4~6자
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function cleanText(s, maxLen) {
  if (typeof s !== 'string') return '';
  // 제어문자 제거 + 길이 제한 (표시 시 escapeHtml 별도 적용)
  const t = s.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return t.slice(0, maxLen || 40);
}

function clampNum(v, lo, hi, dflt) {
  const n = Number(v);
  if (!isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}

function topicState(room) { return `${TOPIC_PREFIX}/${room}/state`; }
function topicJoin(room) { return `${TOPIC_PREFIX}/${room}/join`; }
function topicScore(room) { return `${TOPIC_PREFIX}/${room}/score`; }

/**
 * 공용 MQTT 브로커 연결 (계정 없음). 1차 실패 시 2차로 자동 전환.
 * handlers: {onConnect(client,url), onMessage(topic,obj), onStatus(text), onFail()}
 * 반환값: {getClient, publish, subscribe}
 */
function connectBroker(handlers) {
  handlers = handlers || {};
  let idx = 0;
  let client = null;
  let settled = false;
  const pendingSubs = [];

  function status(t) { if (handlers.onStatus) handlers.onStatus(t); }

  function tryConnect() {
    const url = BROKER_URLS[idx];
    status(`연결 중... (${idx + 1}/${BROKER_URLS.length})`);
    settled = false;
    let c;
    try {
      c = mqtt.connect(url, {
        clientId: 'syr-' + uid(12),
        clean: true,
        connectTimeout: 8000,
        reconnectPeriod: 2000,
        keepalive: 30,
      });
    } catch (e) {
      advance();
      return;
    }
    client = c;
    const failTimer = setTimeout(() => {
      if (!settled) { settled = true; try { c.end(true); } catch (e) {} advance(); }
    }, 9000);

    c.on('connect', () => {
      if (settled && client !== c) return;
      settled = true;
      clearTimeout(failTimer);
      status('연결됨');
      pendingSubs.forEach((t) => c.subscribe(t, { qos: 1 }));
      if (handlers.onConnect) handlers.onConnect(c, url);
    });
    c.on('message', (topic, payload) => {
      let obj = null;
      try { obj = JSON.parse(payload.toString('utf8')); } catch (e) { return; }
      if (handlers.onMessage) handlers.onMessage(topic, obj);
    });
    c.on('reconnect', () => status('재연결 중...'));
    c.on('close', () => status('연결 끊김'));
    c.on('error', () => {
      if (!settled) { settled = true; clearTimeout(failTimer); try { c.end(true); } catch (e) {} advance(); }
    });
  }
  function advance() {
    idx++;
    if (idx >= BROKER_URLS.length) { status('연결 실패'); if (handlers.onFail) handlers.onFail(); return; }
    tryConnect();
  }
  tryConnect();

  return {
    getClient: () => client,
    subscribe(topic) {
      pendingSubs.push(topic);
      if (client && client.connected) client.subscribe(topic, { qos: 1 });
    },
    publish(topic, obj, opts) {
      if (!client) return;
      try { client.publish(topic, JSON.stringify(obj), Object.assign({ qos: 1 }, opts || {})); } catch (e) {}
    },
  };
}

const TEAM_COLORS = ['#ff6b4a', '#2dd4a7', '#4aa8ff', '#ffce45', '#c06bff', '#ff5b9e', '#6be3c2', '#ffa84a'];

/* ---------------- 게임 카탈로그 (원본 20종 + 이모지퀴즈 1종) ---------------- */
const GAMES = [
  { id: 'tapking', name: '연타왕', emo: '👆', engine: 'TAP', dur: 8, how: '8초 동안 버튼을 최대한 많이 눌러요!' },
  { id: 'shakeshake', name: '흔들흔들', emo: '📳', engine: 'TAP', dur: 8, how: '버튼을 흔들듯이 최대한 빠르게 눌러요!' },
  { id: 'rubrub', name: '문질문질', emo: '🫳', engine: 'ALT_TAP', dur: 8, labels: ['왼쪽', '오른쪽'], how: '왼쪽→오른쪽→왼쪽… 번갈아 눌러요!' },
  { id: 'whackmole', name: '두더지', emo: '🐹', engine: 'REACTION_MULTI', rounds: 6, how: '두더지가 "지금!"으로 바뀌면 바로 탭!' },
  { id: 'rps', name: '가위바위보', emo: '✌️', engine: 'RPS', dur: 10, how: '화면 위 모양과 같은 손을 최대한 빨리 눌러요!' },
  { id: 'run100', name: '100m 달리기', emo: '🏃', engine: 'ALT_TAP', dur: 8, labels: ['왼발', '오른발'], how: '왼발→오른발 번갈아 눌러 결승선까지!' },
  { id: 'piano', name: '피아노', emo: '🎹', engine: 'SEQUENCE_FOLLOW', rounds: 8, how: '건반이 켜지는 순서를 보고 그대로 눌러요!' },
  { id: 'stop10', name: '10초를 멈춰라', emo: '⏱️', engine: 'TIMER_STOP', target: 10, how: '시작을 누르고 감으로 10.00초에 정지!' },
  { id: 'lemon', name: '레몬짜기', emo: '🍋', engine: 'HOLD_GAUGE', dur: 10, how: '초록 구간을 유지하도록 누르고 떼고!' },
  { id: 'flash', name: '순간포착', emo: '⚡', engine: 'REACTION_MULTI', rounds: 5, how: '화면이 번쩍이는 순간 바로 탭!' },
  { id: 'towerstack', name: '탑 쌓기', emo: '🧱', engine: 'STACK', rounds: 6, how: '움직이는 블록이 가운데 올 때 눌러요!' },
  { id: 'oddeven', name: '홀짝 계산기', emo: '🧮', engine: 'QUIZ', dur: 25, bank: 'PARITY', how: '계산 결과가 홀수인지 짝수인지 골라요!' },
  { id: 'leftright', name: '왼쪽 오른쪽', emo: '↔️', engine: 'CLASSIFY', dur: 12, rule: 'PARITY_SIDE', how: '규칙대로 왼쪽/오른쪽을 빠르게 분류!' },
  { id: 'balloons', name: '색깔 풍선', emo: '🎈', engine: 'BALLOON', dur: 10, how: '파란 풍선만 터뜨리고 빨간 풍선은 피해요!' },
  { id: 'multiples', name: '구구단 릴레이', emo: '🔢', engine: 'QUIZ', dur: 25, bank: 'TIMES', how: '구구단 문제를 최대한 많이 맞혀요!' },
  { id: 'numhunt', name: '숫자 사냥', emo: '🎯', engine: 'NUMBER_HUNT', how: '1부터 16까지 순서대로 최대한 빨리!' },
  { id: 'memoryflash', name: '반짝 기억', emo: '✨', engine: 'SEQUENCE_MEMORY', rounds: 8, how: '반짝인 칸을 기억했다가 그대로 눌러요!' },
  { id: 'safe', name: '금고 열기', emo: '🔐', engine: 'GUESS', max: 100, tries: 8, how: '1~100 숫자를 업다운 힌트로 맞혀요!' },
  { id: 'oddcolor', name: '다른 색 찾기', emo: '🔍', engine: 'CLASSIFY', dur: 12, rule: 'ODD_ONE', how: '여러 개 중 다른 색 하나를 빠르게!' },
  { id: 'initials', name: '초성 퀴즈', emo: '🔤', engine: 'QUIZ', dur: 25, bank: 'INITIALS', how: '초성을 보고 단어를 빠르게 맞혀요!' },
  { id: 'emojiquiz', name: '성경 이모지 퀴즈', emo: '📖', engine: 'EMOJI_QUIZ', dur: 30, how: '이모지를 보고 알맞은 성경 이야기를 골라요!' },
];
const GAME_BY_ID = Object.fromEntries(GAMES.map((g) => [g.id, g]));

const WORD_BANK = [
  { init: 'ㅅㄱ', answer: '사과', choices: ['사과', '수건', '소금', '사자'] },
  { init: 'ㄱㅅ', answer: '감사', choices: ['감사', '기사', '교실', '가수'] },
  { init: 'ㄱㅎㅎㄱ', answer: '교회학교', choices: ['교회학교', '고양이형', '교육환경', '강아지호'] },
  { init: 'ㅊㅇ', answer: '찬양', choices: ['찬양', '창의', '침엽', '천연'] },
  { init: 'ㄱㄷ', answer: '기도', choices: ['기도', '가득', '구두', '가도'] },
  { init: 'ㅁㅆ', answer: '말씀', choices: ['말씀', '무쌍', '모심', '문서'] },
  { init: 'ㅅㄹ', answer: '사랑', choices: ['사랑', '소리', '수레', '서랍'] },
  { init: 'ㄱㅎ', answer: '교회', choices: ['교회', '기회', '근하', '구호'] },
  { init: 'ㅎㄴㄴ', answer: '하나님', choices: ['하나님', '하노네', '한나님', '허나니'] },
  { init: 'ㅇㅅㄴ', answer: '예수님', choices: ['예수님', '요산님', '유성님', '이사남'] },
];

/* 성경 이모지 퀴즈 문제 은행 — 이모지퀴즈_문제.txt 원문과 완전히 동일 */
const BIBLE_EMOJI = [
  { emoji: '🦁 🙏 🕳️', answer: '다니엘과 사자굴' },
  { emoji: '🚢 🐘 🦒 🌧️ 🌈', answer: '노아의 방주' },
  { emoji: '🌊 🚶‍♂️ 🌊', answer: '홍해가 갈라진 사건' },
  { emoji: '👦 🪨 💪 👹', answer: '다윗과 골리앗' },
  { emoji: '🍞 🐟 🐟 👥', answer: '오병이어' },
  { emoji: '🐳 👨 🙏', answer: '요나와 큰 물고기' },
  { emoji: '👶 🧺 🌊 👸', answer: '아기 모세' },
  { emoji: '🌳 👀 👨‍🦱 🏠', answer: '삭개오' },
  { emoji: '🐓 🐓 🐓 😢', answer: '베드로의 세 번 부인' },
  { emoji: '💪 💇‍♂️ 👩 ⛓️', answer: '삼손과 들릴라' },
  { emoji: '🏙️ 🚶 📯 🧱', answer: '여리고성 함락' },
  { emoji: '💧 🍷 💒', answer: '가나 혼인잔치' },
  { emoji: '🚶‍♂️ 🌊 ⛵ 😱', answer: '예수님이 물 위를 걸으심' },
  { emoji: '🐑 🐑 🐑 🔍 🐑', answer: '잃어버린 양' },
  { emoji: '👨‍👦 💰 🐖 🏠', answer: '돌아온 탕자' },
  { emoji: '🔥 🌳 👣 👂', answer: '불타는 떨기나무' },
  { emoji: '👨‍🦯 ✨ 👀 🙌', answer: '맹인을 고치신 예수님' },
  { emoji: '👑 👶 ⭐ 🎁', answer: '동방박사들의 방문' },
  { emoji: '✝️ 🪦 3️⃣ ☀️', answer: '예수님의 부활' },
  { emoji: '🗣️ 🗼 🌍 😵', answer: '바벨탑 사건' },
];
