/* ---------------- 게임 엔진 (원본 20종 포팅 + 이모지퀴즈 1종) ----------------
   원본과 동일한 로직. 단, 한 기기를 팀끼리 돌려쓰던 구조를 없애고
   각자 자기 폰에서 플레이하도록 turnSubmit(score) -> submit(score) 콜백으로 교체했다. */

function mountGame(area, g, submit) {
  const engines = {
    TAP: engineTap, ALT_TAP: engineAltTap, REACTION_MULTI: engineReactionMulti,
    RPS: engineRps, SEQUENCE_FOLLOW: engineSequence(false), SEQUENCE_MEMORY: engineSequence(true),
    TIMER_STOP: engineTimerStop, HOLD_GAUGE: engineHoldGauge, STACK: engineStack,
    QUIZ: engineQuiz, CLASSIFY: engineClassify, BALLOON: engineBalloon,
    NUMBER_HUNT: engineNumberHunt, GUESS: engineGuess, EMOJI_QUIZ: engineEmojiQuiz,
  };
  (engines[g.engine] || function (a) { a.innerHTML = '<p>준비 중인 게임이에요</p>'; })(area, g, submit);
}

function countdownLabel(area, seconds, onTick) {
  let left = seconds;
  const id = setInterval(() => { left -= 1; onTick(left); if (left <= 0) clearInterval(id); }, 1000);
  return () => clearInterval(id);
}

function engineTap(area, g, submit) {
  let count = 0;
  area.innerHTML = `<div class="num" id="cnt" style="font-size:40px;font-weight:900">0</div><button class="tapbtn" id="tb">탭!</button>`;
  const btn = document.getElementById('tb');
  btn.onclick = () => { count++; document.getElementById('cnt').textContent = count; };
  countdownLabel(area, g.dur, (left) => { if (left <= 0) { btn.disabled = true; setTimeout(() => submit(count), 500); } });
}
function engineAltTap(area, g, submit) {
  let count = 0, last = null;
  area.innerHTML = `<div class="num" id="cnt" style="font-size:40px;font-weight:900">0</div>
  <div class="zonewrap"><button class="zonebtn" style="background:var(--accent)" data-side="L">${g.labels[0]}</button><button class="zonebtn" style="background:var(--good)" data-side="R">${g.labels[1]}</button></div>`;
  area.querySelectorAll('[data-side]').forEach(b => b.onclick = () => {
    const side = b.dataset.side;
    if (side !== last) { count++; last = side; document.getElementById('cnt').textContent = count; }
  });
  countdownLabel(area, g.dur, (left) => { if (left <= 0) { area.querySelectorAll('button').forEach(b => b.disabled = true); setTimeout(() => submit(count), 500); } });
}
function engineReactionMulti(area, g, submit) {
  let round = 0, total = 0, waitingSince = 0, armed = false;
  const n = g.rounds;
  function next() {
    if (round >= n) { setTimeout(() => submit(n ? (total / n) : 0), 400); return; }
    round++;
    area.innerHTML = `<p class="muted">${round}/${n}</p><div style="display:flex;justify-content:center"><div id="zone" style="width:200px;height:200px;border-radius:50%;background:var(--panel2);display:flex;align-items:center;justify-content:center;font-size:28px">대기</div></div>`;
    armed = false;
    const delay = 900 + Math.random() * 2200;
    setTimeout(() => {
      armed = true; waitingSince = performance.now();
      const z = document.getElementById('zone'); if (z) { z.style.background = 'var(--accent)'; z.textContent = '지금!'; }
    }, delay);
    document.getElementById('zone').onclick = () => {
      if (!armed) { return; }
      const ms = performance.now() - waitingSince;
      const score = Math.max(0, 100 - ms / 10);
      total += score; armed = false;
      setTimeout(next, 350);
    };
  }
  next();
}
function engineRps(area, g, submit) {
  const shapes = ['✊', '✌️', '🖐'];
  let score = 0, target = shapes[Math.floor(Math.random() * 3)];
  area.innerHTML = `<div class="num" id="sc" style="font-size:30px;font-weight:900">0</div>
  <div class="disp" id="target" style="font-size:64px">${target}</div>
  <div class="row">${shapes.map(s => `<button class="btn big" data-s="${s}" style="font-size:30px">${s}</button>`).join('')}</div>`;
  function newTarget() { target = shapes[Math.floor(Math.random() * 3)]; document.getElementById('target').textContent = target; }
  area.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
    if (b.dataset.s === target) { score++; document.getElementById('sc').textContent = score; newTarget(); }
  });
  countdownLabel(area, g.dur, (left) => { if (left <= 0) { area.querySelectorAll('button').forEach(b => b.disabled = true); setTimeout(() => submit(score), 500); } });
}
function engineSequence(memoryMode) {
  return function (area, g, submit) {
    let round = 0, seq = [], input = [];
    const n = 6;
    area.innerHTML = `<p class="muted" id="info">라운드 준비중</p><div class="seqgrid" id="grid">${Array.from({ length: n }).map((_, i) => `<button class="seqcell" data-i="${i}"></button>`).join('')}</div>`;
    const cells = [...area.querySelectorAll('.seqcell')];
    function lit(i, on) { cells[i].classList.toggle('lit', on); }
    async function playSeq() {
      document.getElementById('info').textContent = `레벨 ${round + 1} - 순서를 보세요`;
      cells.forEach(c => c.disabled = true);
      for (const i of seq) { lit(i, true); await new Promise(r => setTimeout(r, 380)); lit(i, false); await new Promise(r => setTimeout(r, 180)); }
      document.getElementById('info').textContent = memoryMode ? '기억한 순서대로 누르세요' : '같은 순서로 눌러보세요';
      cells.forEach(c => c.disabled = false);
      input = [];
    }
    function nextRound(fail) {
      if (fail || round >= g.rounds) { setTimeout(() => submit(round), 400); return; }
      round++; seq.push(Math.floor(Math.random() * n));
      playSeq();
    }
    cells.forEach(c => c.onclick = () => {
      const i = +c.dataset.i; lit(i, true); setTimeout(() => lit(i, false), 150);
      input.push(i);
      const idx = input.length - 1;
      if (seq[idx] !== i) { nextRound(true); return; }
      if (input.length === seq.length) { setTimeout(() => nextRound(false), 400); }
    });
    nextRound(false);
  };
}
function engineTimerStop(area, g, submit) {
  let startedAt = null, finished = false;
  area.innerHTML = `<p class="muted">감으로 ${g.target}.00초를 맞혀보세요</p><button class="btn big" id="go">시작</button>`;
  document.getElementById('go').onclick = function () {
    if (!startedAt) { startedAt = performance.now(); this.textContent = '정지!'; this.id = 'stop'; this.onclick = stopFn; }
  };
  function stopFn() {
    if (finished) return; finished = true;
    const sec = (performance.now() - startedAt) / 1000;
    const err = Math.abs(sec - g.target);
    const score = Math.max(0, 100 - err * 20);
    area.innerHTML = `<p>${sec.toFixed(2)}초 (오차 ${err.toFixed(2)}초)</p>`;
    setTimeout(() => submit(score), 700);
  }
}
function engineHoldGauge(area, g, submit) {
  let value = 0, held = false, good = 0, ticks = 0;
  area.innerHTML = `<div style="max-width:320px;margin-inline:auto;position:relative"><div class="scorebar-track" style="height:34px"><div id="gfill" class="scorebar-fill" style="width:0%;background:var(--accent)"></div></div><div style="position:absolute;left:55%;top:0;bottom:0;width:25%;border-left:2px dashed var(--good);border-right:2px dashed var(--good)"></div></div>
  <button class="tapbtn" id="hb" style="margin-top:20px">꾹 누르기</button>`;
  const hb = document.getElementById('hb');
  hb.onpointerdown = () => held = true; hb.onpointerup = () => held = false; hb.onpointerleave = () => held = false;
  const iv = setInterval(() => {
    value += held ? 4 : -3; value = Math.max(0, Math.min(100, value));
    document.getElementById('gfill').style.width = value + '%';
    ticks++; if (value >= 55 && value <= 80) good++;
  }, 60);
  countdownLabel(area, g.dur, (left) => { if (left <= 0) { clearInterval(iv); hb.disabled = true; setTimeout(() => submit(ticks ? (good / ticks * 100) : 0), 400); } });
}
function engineStack(area, g, submit) {
  let round = 0, total = 0;
  function playRound() {
    if (round >= g.rounds) { setTimeout(() => submit(total / g.rounds), 400); return; }
    round++;
    area.innerHTML = `<p class="muted">${round}/${g.rounds}</p>
    <div style="max-width:320px;margin-inline:auto;height:40px;background:var(--panel2);border-radius:10px;position:relative;overflow:hidden">
      <div style="position:absolute;left:40%;width:20%;top:0;bottom:0;background:rgba(45,212,167,.3)"></div>
      <div id="marker" style="position:absolute;top:0;bottom:0;width:14px;background:var(--accent);border-radius:4px"></div>
    </div>
    <button class="btn big" id="place" style="margin-top:18px">쌓기!</button>`;
    let pos = 0, dir = 1;
    const iv = setInterval(() => {
      pos += dir * 3; if (pos >= 95 || pos <= 0) { dir *= -1; }
      document.getElementById('marker').style.left = pos + '%';
    }, 16);
    document.getElementById('place').onclick = () => {
      clearInterval(iv);
      const dist = Math.abs(pos - 50);
      const score = Math.max(0, 100 - dist * 2);
      total += score;
      setTimeout(playRound, 300);
    };
  }
  playRound();
}
function genQuizQ(bank) {
  if (bank === 'PARITY') {
    const a = 1 + Math.floor(Math.random() * 20), b = 1 + Math.floor(Math.random() * 20), op = Math.random() < 0.5 ? '+' : '×';
    const val = op === '+' ? a + b : a * b;
    return { q: `${a} ${op} ${b} = ?`, choices: ['홀수', '짝수'], answer: val % 2 === 0 ? '짝수' : '홀수' };
  }
  if (bank === 'TIMES') {
    const a = 2 + Math.floor(Math.random() * 8), b = 1 + Math.floor(Math.random() * 9);
    const correct = a * b;
    const opts = new Set([correct]);
    while (opts.size < 4) opts.add(Math.max(1, correct + (Math.floor(Math.random() * 9) - 4 || 1)));
    return { q: `${a} × ${b} = ?`, choices: [...opts].sort(() => Math.random() - .5).map(String), answer: String(correct) };
  }
  const w = WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)];
  return { q: `초성: ${w.init}`, choices: [...w.choices].sort(() => Math.random() - .5), answer: w.answer };
}
function engineQuiz(area, g, submit) {
  let score = 0;
  function nextQ() {
    const qq = genQuizQ(g.bank);
    area.innerHTML = `<div class="num" style="font-weight:900">맞힌 개수: ${score}</div>
    <h3>${escapeHtml(qq.q)}</h3>
    <div class="row">${qq.choices.map(c => `<button class="btn ghost" data-c="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}</div>`;
    area.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
      if (b.dataset.c === qq.answer) score++;
      nextQ();
    });
  }
  nextQ();
  countdownLabel(area, g.dur, (left) => { if (left <= 0) { setTimeout(() => submit(score), 300); } });
}
function engineClassify(area, g, submit) {
  let score = 0;
  function round() {
    if (g.rule === 'PARITY_SIDE') {
      const n = 1 + Math.floor(Math.random() * 20);
      area.innerHTML = `<div class="num" style="font-weight:900">${score}점</div><h3>${n} 은(는)?</h3>
      <div class="zonewrap"><button class="zonebtn" style="background:var(--accent)" data-ans="${n % 2 === 0}">짝수→왼쪽</button><button class="zonebtn" style="background:var(--good)" data-ans="${n % 2 !== 0}">홀수→오른쪽</button></div>`;
      area.querySelectorAll('[data-ans]').forEach(b => b.onclick = () => { if (b.dataset.ans === 'true') score++; round(); });
    } else {
      const colors = ['#ff6b4a', '#2dd4a7', '#4aa8ff', '#ffce45'];
      const base = colors[Math.floor(Math.random() * colors.length)];
      const oddIdx = Math.floor(Math.random() * 9);
      area.innerHTML = `<div class="num" style="font-weight:900">${score}점</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;max-width:260px;margin-inline:auto">
      ${Array.from({ length: 9 }).map((_, i) => `<button data-odd="${i === oddIdx}" style="aspect-ratio:1/1;border-radius:12px;border:none;background:${base};opacity:${i === oddIdx ? 0.65 : 1}"></button>`).join('')}
      </div>`;
      area.querySelectorAll('[data-odd]').forEach(b => b.onclick = () => { if (b.dataset.odd === 'true') score++; round(); });
    }
  }
  round();
  countdownLabel(area, g.dur, (left) => { if (left <= 0) { setTimeout(() => submit(score), 300); } });
}
function engineBalloon(area, g, submit) {
  let score = 0; const good = '#4aa8ff', trap = '#ef5b5b';
  area.innerHTML = `<div class="num" style="font-weight:900">${score}점 · 파란 풍선만!</div><div class="balloon-wrap" id="bw"></div>`;
  const bw = document.getElementById('bw');
  function spawn() {
    const isTrap = Math.random() < 0.35;
    const b = document.createElement('button');
    b.className = 'balloon'; b.style.background = isTrap ? trap : good; b.style.border = 'none';
    b.style.left = (Math.random() * 80) + '%'; b.style.top = '100%';
    bw.appendChild(b);
    const dur = 2600 + Math.random() * 1200;
    const anim = b.animate([{ top: '100%' }, { top: '-12%' }], { duration: dur, easing: 'linear' });
    anim.onfinish = () => b.remove();
    b.onclick = () => { score += isTrap ? -1 : 1; score = Math.max(0, score); area.querySelector('.num').textContent = score + '점 · 파란 풍선만!'; b.remove(); };
  }
  const spawner = setInterval(spawn, 500);
  countdownLabel(area, g.dur, (left) => { if (left <= 0) { clearInterval(spawner); bw.innerHTML = ''; setTimeout(() => submit(score), 300); } });
}
function engineNumberHunt(area, g, submit) {
  const nums = Array.from({ length: 16 }, (_, i) => i + 1).sort(() => Math.random() - .5);
  let next = 1; const start = performance.now();
  area.innerHTML = `<div class="numgrid">${nums.map(n => `<button class="numtile" data-n="${n}">${n}</button>`).join('')}</div>`;
  area.querySelectorAll('[data-n]').forEach(b => b.onclick = () => {
    if (+b.dataset.n === next) {
      b.classList.add('done'); b.disabled = true; next++;
      if (next > 16) { const sec = (performance.now() - start) / 1000; setTimeout(() => submit(Math.max(0, 100 - sec * 5)), 400); }
    }
  });
}
function engineGuess(area, g, submit) {
  const secret = 1 + Math.floor(Math.random() * g.max);
  let tries = 0;
  function render2(hint) {
    area.innerHTML = `<p class="muted">시도 ${tries}/${g.tries} ${hint ? ('· ' + hint) : ''}</p>
    <input class="input" id="gi" type="number" min="1" max="${g.max}" placeholder="1~${g.max}">
    <button class="btn" id="gb" style="margin-top:10px">확인</button>`;
    document.getElementById('gb').onclick = () => {
      const v = +document.getElementById('gi').value;
      if (!v) return;
      tries++;
      if (v === secret) { setTimeout(() => submit(Math.max(10, (g.tries - tries + 1) * 12)), 400); return; }
      if (tries >= g.tries) { setTimeout(() => submit(0), 400); return; }
      render2(v < secret ? 'UP ⬆️' : 'DOWN ⬇️');
    };
  }
  render2('');
}

/* ---------------- 성경 이모지 퀴즈 (신규) ---------------- */
function engineEmojiQuiz(area, g, submit) {
  let score = 0;
  let queue = [];
  function refillQueue() {
    queue = BIBLE_EMOJI.map((_, i) => i).sort(() => Math.random() - .5);
  }
  function nextQ() {
    if (queue.length === 0) refillQueue();
    const idx = queue.pop();
    const q = BIBLE_EMOJI[idx];
    const wrongPool = BIBLE_EMOJI.filter((_, i) => i !== idx).map(x => x.answer);
    const wrongs = wrongPool.sort(() => Math.random() - .5).slice(0, 3);
    const choices = [q.answer, ...wrongs].sort(() => Math.random() - .5);
    area.innerHTML = `<div class="num" style="font-weight:900">맞힌 개수: ${score}</div>
    <div class="disp emoji-row">${q.emoji}</div>
    <div class="row" style="flex-direction:column;max-width:420px;margin-inline:auto">${choices.map(c => `<button class="btn ghost big" data-c="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}</div>`;
    area.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
      if (b.dataset.c === q.answer) score++;
      nextQ();
    });
  }
  nextQ();
  countdownLabel(area, g.dur, (left) => { if (left <= 0) { setTimeout(() => submit(score), 300); } });
}
