/* ===== 续文魂 · 东巴识字寻宝 v2 =====
 * 四关：看图猜字 → 火塘配对 → 地宫寻宝 → 执笔描红
 * 主角：莫愁（纳西族小女孩） */
(() => {
'use strict';

const $ = (sel, el = document) => el.querySelector(sel);
const screenEl = $('#screen');
const hudEl = $('#globalHud');
const pauseOverlay = $('#pauseOverlay');
const FIVE_COLORS = ['#e05548', '#f2c14e', '#4e8fd9', '#f5f0e6', '#9b8de0', '#e08cc0'];

/* ---------- 全局状态 ---------- */
const G = {
  state: 'title',
  paused: false,
  score: 0,
  learned: new Set(),
  stars: {},            // 每关星级 1-3
  level: 0,
  l1: null, l2: null, l3: null, l4: null,
  best: JSON.parse(localStorage.getItem('db_best') || 'null'),
};

const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const glyphSvg = (g, cls = '') => `<svg class="${g.real ? 'gr' : 'gl'} ${cls}" viewBox="0 0 100 100" aria-label="${g.word}">${g.svg}</svg>`;
const byId = id => GLYPHS.find(g => g.id === id);
const starStr = n => '★'.repeat(n) + '☆'.repeat(3 - n);

/* ---------- 粒子 ---------- */
function sparks(x, y, n = 12) {
  for (let i = 0; i < n; i++) {
    const s = document.createElement('div');
    s.className = 'spark';
    const sz = 4 + Math.random() * 5;
    s.style.cssText = `left:${x}px;top:${y}px;width:${sz}px;height:${sz}px;--dx:${(Math.random() - .5) * 160}px;--dy:${(Math.random() - .5) * 160}px`;
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 750);
  }
}

/* ================= 元系统：图鉴 + 成就（灵感：巴别塔圣歌手稿） ================= */
const META = JSON.parse(localStorage.getItem('db_meta') || 'null') || { seen: {}, ach: [] };
function saveMeta() { localStorage.setItem('db_meta', JSON.stringify(META)); }
function masteryOf(id) { const n = META.seen[id] || 0; return n >= 3 ? 2 : n >= 1 ? 1 : 0; } // 0未解锁 1初识 2掌握

function learn(id) {
  G.learned.add(id);
  const was = masteryOf(id);
  META.seen[id] = (META.seen[id] || 0) + 1;
  const now = masteryOf(id);
  saveMeta();
  if (now > was) {
    const g = byId(id);
    toast(now === 1 ? `📖 图鉴新收录：「${g.word}」` : `✒️ 「${g.word}」已破译掌握！`);
  }
}

const ACHIEVEMENTS = [
  { id: 'l1', icon: '🔥', name: '初燃火把', desc: '完成第一关' },
  { id: 'l1s3', icon: '👁️', name: '火眼金睛', desc: '第一关满星通过' },
  { id: 'l2s3', icon: '🧶', name: '五色连心', desc: '第二关满星通过' },
  { id: 'l3', icon: '🗝️', name: '地宫行者', desc: '打开地宫所有石门' },
  { id: 'l3s3', icon: '🕯️', name: '解谜人', desc: '第三关满星通过' },
  { id: 'l4', icon: '🖌️', name: '执笔人', desc: '完成描红最后一笔' },
  { id: 'combo5', icon: '🔥', name: '连珠', desc: '单次连对达到 5 次' },
  { id: 'c10', icon: '📖', name: '识字十', desc: '图鉴收录 10 个字' },
  { id: 'c20', icon: '📜', name: '半部经', desc: '图鉴收录 20 个字' },
  { id: 'call', icon: '🏔️', name: '小小东巴', desc: '图鉴收录全部文字' },
  { id: 'mastery10', icon: '✒️', name: '破译者', desc: '彻底掌握 10 个字' },
  { id: 'star12', icon: '🌌', name: '满天星', desc: '四关全部满星通关' },
  { id: 'score3k', icon: '✨', name: '文魂守护者', desc: '单局得分超过 3000' },
];
function unlock(id) {
  if (META.ach.includes(id)) return;
  META.ach.push(id);
  saveMeta();
  const a = ACHIEVEMENTS.find(x => x.id === id);
  toast(`🏆 成就解锁：${a.name}`);
  Sound.star();
}
function checkAchievements() {
  const collected = Object.keys(META.seen).length;
  const mastered = GLYPHS.filter(g => masteryOf(g.id) === 2).length;
  if (G.stars[1]) unlock('l1');
  if (G.stars[1] === 3) unlock('l1s3');
  if (G.stars[2] === 3) unlock('l2s3');
  if (G.stars[3]) unlock('l3');
  if (G.stars[3] === 3) unlock('l3s3');
  if (G.stars[4]) unlock('l4');
  if (collected >= 10) unlock('c10');
  if (collected >= 20) unlock('c20');
  if (collected >= GLYPHS.length) unlock('call');
  if (mastered >= 10) unlock('mastery10');
  if (Object.values(G.stars).reduce((a, b) => a + b, 0) >= 12) unlock('star12');
  if (G.score >= 3000) unlock('score3k');
}

/* ---------- 图鉴（藏经阁） ---------- */
function showCollection() {
  G.state = 'codex'; updateHud();
  const cells = GLYPHS.map(g => {
    const m = masteryOf(g.id);
    const cls = m === 2 ? 'm2' : m === 1 ? 'm1' : 'm0';
    const label = m === 0 ? '？' : g.word;
    const pips = '●'.repeat(m) + '○'.repeat(2 - m);
    return `<div class="codex-cell ${cls}">
      <div class="codex-glyph">${m === 0 ? '<span class="codex-q">?</span>' : glyphSvg(g)}</div>
      <div class="codex-word">${label}</div>
      <div class="codex-pips">${m === 0 ? '' : pips}</div>
    </div>`;
  }).join('');
  const collected = Object.keys(META.seen).length;
  screenEl.innerHTML = `<div class="screen" id="scr-codex">
    <div class="bg-photo" style="background-image:url('assets/bg_glyphs.jpg')"></div>
    <div class="codex-head">
      <h2 class="codex-title">字灵图鉴</h2>
      <p class="codex-sub">已收录 ${collected} / ${GLYPHS.length} · ●● 为彻底破译</p>
    </div>
    <div class="codex-grid">${cells}</div>
    <div style="width:min(80vw,280px);margin:.6rem auto 0">
      <button class="btn ghost" id="btnCodexBack">返回</button>
    </div>
  </div>`;
  $('#btnCodexBack').onclick = () => { Sound.click(); showTitle(); };
}

/* ---------- 成就 ---------- */
function showAchievements() {
  G.state = 'ach'; updateHud();
  const rows = ACHIEVEMENTS.map(a => {
    const got = META.ach.includes(a.id);
    return `<div class="ach-row ${got ? 'got' : ''}">
      <span class="ach-icon">${got ? a.icon : '🔒'}</span>
      <div class="ach-txt"><b>${got ? a.name : '？？？'}</b><span>${a.desc}</span></div>
    </div>`;
  }).join('');
  screenEl.innerHTML = `<div class="screen" id="scr-ach">
    <div class="bg-photo" style="background-image:url('assets/bg_glyphs.jpg')"></div>
    <div class="codex-head">
      <h2 class="codex-title">成就</h2>
      <p class="codex-sub">${META.ach.length} / ${ACHIEVEMENTS.length} 已解锁</p>
    </div>
    <div class="ach-list">${rows}</div>
    <div style="width:min(80vw,280px);margin:.6rem auto 0">
      <button class="btn ghost" id="btnAchBack">返回</button>
    </div>
  </div>`;
  $('#btnAchBack').onclick = () => { Sound.click(); showTitle(); };
}

/* ---------- 提示浮层 ---------- */
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1450);
}

/* ---------- HUD ---------- */
function updateHud() {
  hudEl.classList.toggle('hidden', !['l1', 'l2', 'l3', 'l4'].includes(G.state));
  $('#btnMute').textContent = Sound.isMuted() ? '🔇' : '🔊';
}
function levelHud(tip, progressHtml = '') {
  return `<div class="level-hud">
    <img class="hud-girl" src="assets/girl.jpg" alt="莫愁">
    <div class="hud-bubble">${tip}</div>
    <div class="hud-score">⭐ ${G.score}</div>
  </div>${progressHtml}`;
}
function dots(total, done, now) {
  let h = '<div class="progress-dots">';
  for (let i = 0; i < total; i++) h += `<i class="${i < done ? 'done' : i === now ? 'now' : ''}"></i>`;
  return h + '</div>';
}

/* ---------- 屏幕：首页 ---------- */
function showTitle() {
  G.state = 'title'; G.paused = false; updateHud();
  Sound.ambient(true); Sound.bgm(true, 'title');
  const best = G.best ? `最佳纪录：${G.best.score} 分 · ${G.best.stars ?? 0} 颗星` : '和莫愁一起，把东巴文重新点亮';
  /* 封面漂浮的真实东巴字（取字库前 18 字中的代表字形） */
  const FLOAT_IDS = [0, 1, 2, 3, 4, 6, 9, 11, 13, 14];
  const POS = [[6, 12, 54], [82, 9, 62], [14, 34, 40], [86, 32, 44], [4, 55, 48], [90, 55, 52], [20, 74, 36], [76, 76, 40], [40, 6, 42], [60, 82, 38]];
  const floaters = FLOAT_IDS.map((gi, i) => {
    const g = GLYPHS[gi], [x, y, s] = POS[i];
    return `<svg class="float-glyph" viewBox="0 0 100 100" style="left:${x}%;top:${y}%;width:${s}px;height:${s}px;animation-duration:${7 + (i % 4) * 2.1}s;animation-delay:${i * 0.7}s">${g.svg}</svg>`;
  }).join('');
  screenEl.innerHTML = `<div class="screen" id="scr-title">
    <div class="bg-photo" style="background-image:url('assets/bg_glyphs.jpg')"></div>
    ${floaters}
    ${[12, 26, 44, 63, 81].map((l, i) => `<span class="ember" style="left:${l}%;animation-duration:${5 + i * 1.3}s;animation-delay:${i * 0.9}s"></span>`).join('')}
    <div class="title-hero">
      <div class="hero-medal"><div class="hero-ring"></div><img src="assets/girl.jpg" alt="莫愁"></div>
    </div>
    <h1 class="game-title">续文魂 · 东巴识字寻宝</h1>
    <p class="game-sub">唤醒纳西东巴文脉星光</p>
    <p class="title-record">${best}</p>
    <div class="title-btns">
      <button class="btn primary" id="btnStart">开始闯关</button>
      <div class="title-row">
        <button class="btn half" id="btnCodex">📖 字灵图鉴</button>
        <button class="btn half" id="btnAch">🏆 成就</button>
      </div>
      <button class="btn ghost" id="btnHow">怎么玩</button>
    </div>
  </div>`;
  $('#btnStart').onclick = () => { Sound.unlock(); Sound.click(); startRun(); };
  $('#btnCodex').onclick = () => { Sound.click(); showCollection(); };
  $('#btnAch').onclick = () => { Sound.click(); showAchievements(); };
  $('#btnHow').onclick = () => { Sound.click(); showHowto(); };
}

function showHowto() {
  G.state = 'howto'; updateHud();
  screenEl.innerHTML = `<div class="screen" id="scr-howto">
    <div class="bg-photo" style="background-image:url('assets/family.jpg')"></div>
    <div style="flex:1;display:flex;align-items:center;justify-content:center">
      <div class="panel" style="text-align:left">
        <h2 style="text-align:center">怎么玩</h2>
        <div class="howto-list">
          <p>🏔️ 纳西族小女孩<b>莫愁</b>要救回家里没人读得懂的东巴古经，需要你的帮助！</p>
          <p><b>一 · 看图猜字</b>：东巴文是"图画文字"。前 5 题有提示，后 5 题要靠自己。</p>
          <p><b>二 · 火塘配对</b>：6 个字对 7 个词——有一个词是混进来的陷阱！</p>
          <p><b>三 · 地宫寻宝</b>：火把照亮石门，门上只有谜语，猜出意思再认字。</p>
          <p><b>四 · 执笔描红</b>：像莫愁一样，用手指把古字一笔一笔描出来。</p>
          <p>✨ 每关按表现评 1~3 颗星，通关后学会的字会化作<b>星光升上夜空</b>！</p>
        </div>
        <button class="btn primary" id="btnHowBack">知道啦</button>
      </div>
    </div>
  </div>`;
  $('#btnHowBack').onclick = () => { Sound.click(); showTitle(); };
}

/* ---------- 流程 ---------- */
function startRun() {
  G.score = 0; G.learned = new Set(); G.stars = {};
  G.level = 1;
  showExplore(0);
}

/* ================= 探索模式（章节闯关 · 跟着莫愁的故事走） ================= */
let exRAF = null;

/* ---- 布景小件 ---- */
function treeHtml(x, y, s = 1) {
  const w = 34 * s, h = 30 * s;
  return `<div class="vx-tree" style="left:${x}px;top:${y}px;z-index:${Math.round(y)}">
    <i style="--w:${(w * .55).toFixed(0)}px;--h:${h.toFixed(0)}px;--c:#33603a"></i>
    <i style="--w:${(w * .78).toFixed(0)}px;--h:${(h * 1.15).toFixed(0)}px;--c:#27512e"></i>
    <i style="--w:${w.toFixed(0)}px;--h:${(h * 1.32).toFixed(0)}px;--c:#1d4126"></i>
    <b></b></div>`;
}
function borderTrees(W, H, gap = 130) {
  let s = '';
  for (let x = 80; x <= W - 60; x += gap) { s += treeHtml(x, 50, 1.05 + (x % 390) / 900); s += treeHtml(x + 40, H - 45, 1 + (x % 260) / 800); }
  for (let y = 180; y <= H - 120; y += gap + 10) { s += treeHtml(50, y, 1.05 + (y % 300) / 900); s += treeHtml(W - 50, y + 50, 1.1 + (y % 450) / 1000); }
  return s;
}
function houseHtml(x, y, w, bh, rh, wins, name) {
  return `<div class="vx-house" style="left:${x}px;top:${y}px;width:${w}px;z-index:${y}">
    <div class="vx-roof" style="height:${rh}px"></div>
    <div class="vx-body" style="height:${bh}px">${'<i class="vx-win"></i>'.repeat(wins)}<div class="vx-door"></div></div>
    ${name ? `<div class="vx-name-tag">${name}</div>` : ''}</div>`;
}
function lampHtml(x, y) {
  return `<div class="vx-lamp" style="left:${x}px;top:${y}px;z-index:${y}"><div class="vx-lampglow"></div><b></b><i></i><u></u></div>`;
}
function firepitHtml(x, y, name) {
  return `<div class="vx-firepit" style="left:${x}px;top:${y}px;z-index:${y + 20}">
    <div class="vx-fireglow"></div><div class="ring"><span class="fire">🔥</span></div>
    ${name ? `<div class="vx-name-tag">${name}</div>` : ''}</div>`;
}
function rockHtml(x, y, s = 1) {
  return `<div class="vx-rockdeco" style="left:${x}px;top:${y}px;font-size:${(1.6 * s).toFixed(2)}rem;z-index:${y}">🪨</div>`;
}

/* ---- 四章故事场景 ---- */
const SCENES = [
  { /* 第一章 · 火塘小院 */
    name: '第一章 · 火塘小院', sub: '风把经页吹散了一院子——拾回 3 页残页，点亮火塘石碑',
    quote: '「字是画出来的画，画是写出来的字。」',
    intro: ['👵 奶奶：莫愁，夜风把经书的残页吹散了一院子！', '👧 莫愁：我这就去拾！拾齐 3 页，就去火塘边的石碑认字。', '💡 院子右上的是咱家，中间是奶奶的火塘——石碑就立在火塘旁。'],
    W: 1400, H: 1000, ground: 's0', bg: 'assets/bg_s0.jpg', spawn: { x: 700, y: 900 }, lv: 1,
    stele: { x: 810, y: 700, icon: '🔥', name: '火塘授字' }, needPages: 3,
    pages: [{ x: 460, y: 530 }, { x: 1010, y: 410 }, { x: 1130, y: 840 }],
    build() {
      const h = [];
      h.push(houseHtml(1150, 330, 220, 130, 52, 3, '莫愁的家'));
      h.push(firepitHtml(810, 530, '奶奶的火塘'));
      h.push(`<div class="vx-farm" style="left:140px;top:640px;width:210px;height:120px;z-index:762"><i style="left:16px;top:10px">🌾</i><i style="left:60px;top:12px">🌱</i><i style="left:106px;top:8px">🌾</i><i style="left:152px;top:14px">🌱</i><i style="left:30px;top:56px">🌱</i><i style="left:84px;top:60px">🌾</i><i style="left:138px;top:58px">🌱</i></div>`);
      h.push(lampHtml(650, 690) + lampHtml(960, 690) + lampHtml(700, 420));
      h.push(rockHtml(1230, 620) + rockHtml(420, 850, .8));
      return {
        html: h.join(''),
        rects: [
          { x: 0, y: 0, w: 175, h: 1000 },
          { x: 1060, y: 286, w: 180, h: 44 },
          { x: 772, y: 496, w: 76, h: 42 },
          { x: 140, y: 655, w: 210, h: 110 },   // 庄稼地（整片不可踏入）
        ],
      };
    },
  },
  { /* 第二章 · 经幡山道 */
    name: '第二章 · 经幡山道', sub: '山风把经页卷上了栈道——追风拾回 4 页，走到山道尽头',
    quote: '「跑快些，字要追上风。」',
    intro: ['👧 莫愁：残页被山风卷跑了，顺着栈道飞！', '💡 追上会飞的经页碰它就能认字；小心一阵一阵的狂风。拾齐 4 页，去山道尽头的半山木楼。'],
    W: 2400, H: 1000, ground: 's1', bg: 'assets/bg_s1.jpg', spawn: { x: 150, y: 500 }, lv: 2,
    stele: { x: 2210, y: 500, icon: '🏮', name: '木楼配对' }, needPages: 4,
    pages: [], flyPages: 6, gust: true,
    build() {
      const h = [];
      h.push(lampHtml(150, 560) + lampHtml(2210, 590));
      h.push(houseHtml(2210, 392, 170, 96, 40, 2, '半山木楼'));
      h.push(treeHtml(420, 320, 1.1) + treeHtml(1020, 330, .95) + treeHtml(1500, 324, 1.15) + treeHtml(700, 700, 1) + treeHtml(1350, 706, .9));
      h.push(rockHtml(560, 330) + rockHtml(1180, 700, 1.2) + rockHtml(1980, 330, .9));
      return {
        html: h.join(''),
        rects: [
          { x: 0, y: 0, w: 2400, h: 336 },
          { x: 0, y: 575, w: 2400, h: 425 },   // 栈道外沿即是悬崖，不可行走
          { x: 2140, y: 356, w: 140, h: 38 },
        ],
      };
    },
  },
  { /* 第三章 · 藏书楼地宫 */
    name: '第三章 · 藏书楼地宫', sub: '石牌坊封着地宫前的石阶——认出封印古字才能上前',
    quote: '「石门，只认得下笔有神的人。」',
    intro: ['👧 莫愁：藏书楼到了……石牌坊上有古字封印！', '💡 撞上石牌坊会触发认字封印，答对就能穿过。先去楼上打开宝箱，再去石碑下地宫。'],
    W: 1400, H: 1200, ground: 's2', bg: 'assets/bg_s2.jpg', spawn: { x: 700, y: 1100 }, lv: 3,
    stele: { x: 700, y: 590, icon: '🗝️', name: '地宫寻宝' }, needPages: 0,
    pages: [{ x: 300, y: 950 }, { x: 1100, y: 950 }],
    gate: { x: 700, y: 830 },
    chest: { x: 1180, y: 350 },
    build() {
      const h = [];
      h.push(houseHtml(700, 330, 250, 180, 60, 4, '藏书楼'));
      h.push(`<div class="vx-cliff s2wall" style="left:0;top:700px;width:486px;height:40px"></div>`);
      h.push(`<div class="vx-cliff s2wall" style="left:914px;top:700px;width:486px;height:40px"></div>`);
      h.push(lampHtml(600, 840) + lampHtml(800, 840) + lampHtml(520, 560) + lampHtml(880, 560));
      h.push(rockHtml(260, 620) + rockHtml(1140, 620, 1.1) + rockHtml(420, 1060, .9) + rockHtml(980, 1060, .9));
      h.push(treeHtml(180, 1080, 1) + treeHtml(1220, 1080, 1.05) + treeHtml(200, 260, .95) + treeHtml(1200, 240, 1));
      return {
        html: h.join(''),
        rects: [
          { x: 585, y: 278, w: 230, h: 52 },
          { x: 0, y: 700, w: 486, h: 40 },
          { x: 914, y: 700, w: 486, h: 40 },
          { x: 164, y: 1072, w: 32, h: 14 }, { x: 1204, y: 1072, w: 32, h: 14 },
          { x: 184, y: 252, w: 32, h: 14 }, { x: 1184, y: 232, w: 32, h: 14 },
        ],
        gateRect: { x: 640, y: 806, w: 120, h: 24 },
      };
    },
  },
  { /* 第四章 · 湖畔书房 */
    name: '第四章 · 湖畔书房', sub: '泸沽湖的水声很近——灯下还亮着，去把古字描下来',
    quote: '「泸沽湖的水，记得每一个字。」',
    intro: ['👵 奶奶：最后一课，在湖边书房，静下心来。', '💡 到湖边的石碑去，照着古字一笔一画描红，写完就算出师啦。'],
    W: 1400, H: 1000, ground: 's3', bg: 'assets/bg_s3.jpg', spawn: { x: 700, y: 880 }, lv: 4,
    stele: { x: 700, y: 760, icon: '🖌️', name: '灯下描红' }, needPages: 0,
    pages: [{ x: 1060, y: 620 }],
    build() {
      const h = [];
      h.push(houseHtml(430, 590, 190, 110, 46, 2, '湖边书房'));
      h.push(lampHtml(560, 750) + lampHtml(840, 750) + lampHtml(700, 480));
      h.push(rockHtml(300, 420, .9) + rockHtml(1150, 460, 1.1));
      h.push(treeHtml(220, 700, 1.1) + treeHtml(1180, 720, 1) + treeHtml(380, 880, .9) + treeHtml(1020, 870, 1.05));
      return {
        html: h.join(''),
        rects: [
          { x: 0, y: 0, w: 1400, h: 395 },   // 泸沽湖水面，岸线以下才可行走
          { x: 345, y: 552, w: 170, h: 38 },
          { x: 204, y: 692, w: 32, h: 14 }, { x: 1164, y: 712, w: 32, h: 14 },
          { x: 364, y: 872, w: 32, h: 14 }, { x: 1004, y: 862, w: 32, h: 14 },
        ],
      };
    },
  },
];

function showExplore(unlocked) {
  cancelAnimationFrame(exRAF);
  G.state = 'explore'; updateHud();
  const sceneIdx = Math.min(unlocked ?? (G.explore?.unlocked || 0), 3);
  if (!G.explore) G.explore = { unlocked: 0, pages: new Set(), gateOpen: false, chestOpen: false };
  const ex = G.explore;
  if (unlocked !== undefined) ex.unlocked = unlocked;
  const def = SCENES[sceneIdx];
  ex.scene = sceneIdx;
  ex.x = def.spawn.x; ex.y = def.spawn.y;
  Sound.ambient(true); Sound.bgm(true, 'explore');

  const built = def.build();
  const pageKey = p => `${sceneIdx}:${p.x}`;
  const pages = def.pages.map(p => `<div class="vx-page" data-x="${p.x}" data-y="${p.y}" data-k="${pageKey(p)}" style="left:${p.x}px;top:${p.y}px;z-index:${p.y};${ex.pages.has(pageKey(p)) ? 'display:none' : ''}">📜</div>`).join('');
  const flyPages = def.flyPages ? Array.from({ length: def.flyPages }, (_, i) => {
    const fx = 300 + (i * 331) % (def.W - 600), fy = 380 + (i * 173) % 240;
    const k = `${sceneIdx}:fly${i}`;
    return `<div class="vx-flypage" data-k="${k}" data-i="${i}" style="left:${fx}px;top:${fy}px;z-index:${fy + 5};${ex.pages.has(k) ? 'display:none' : ''}">📜</div>`;
  }).join('') : '';
  const st = def.lv <= ex.unlocked ? 'done' : def.lv === ex.unlocked + 1 ? 'next' : 'locked';
  const stele = `<div class="vx-stele ${st}" style="left:${def.stele.x}px;top:${def.stele.y}px;z-index:${def.stele.y}">
      <div class="vx-beam"></div>
      <div class="st">${st === 'done' ? '✦' : def.stele.icon}</div>
      <div class="vx-name-tag">${def.stele.name}</div></div>`;
  const gate = def.gate ? `<div class="vx-gate ${ex.gateOpen ? 'open' : ''}" id="vxGate" style="left:${def.gate.x}px;top:${def.gate.y}px;z-index:${def.gate.y}">
      <div class="arch"></div><div class="cols"><u></u><u></u></div>
      <div class="seal">${ex.gateOpen ? '✦' : '字'}</div></div>` : '';
  const chest = def.chest ? `<div class="vx-chest ${ex.chestOpen ? 'open' : ''}" id="vxChest" style="left:${def.chest.x}px;top:${def.chest.y}px;z-index:${def.chest.y}">${ex.chestOpen ? '🧺' : '🎁'}</div>` : '';
  const flies = Array.from({ length: 10 }, (_, i) => {
    const fx = 120 + (i * 197) % (def.W - 240), fy = 140 + (i * 313) % (def.H - 280);
    return `<div class="vx-fly" style="left:${fx}px;top:${fy}px;--d:${5 + i % 4}s;z-index:${fy + 5}"></div>`;
  }).join('');

  screenEl.innerHTML = `<div class="screen" id="scr-explore">
    <div id="world" style="width:${def.W}px;height:${def.H}px">
      <div class="vx-ground ${def.ground}${def.bg ? ' hasbg' : ''}" ${def.bg ? `style="background-image:url('${def.bg}');background-size:100% 100%"` : ''}></div>
      ${built.html}${pages}${flyPages}${gate}${chest}${stele}${flies}
      <div class="vx-girl dir-d" id="vxGirl">
        <div class="vx-torchlight"></div>
        <div class="vx-swrap"><canvas class="vx-walk-sprite" id="vxSpriteC" width="300" height="440"></canvas></div>
        <div class="vx-shadow"></div>
      </div>
    </div>
    <div class="vx-vignette"></div><div class="vx-moonglow"></div>
    <div class="vx-chapter"><b>${def.name}</b><span>${def.sub}</span>${def.quote ? `<span class="vx-quote">${def.quote}</span>` : ''}</div>
    <div class="ex-top">
      ${levelHud(def.sub, `<div class="progress-dots">${SCENES.map((s, i) => `<i class="${s.lv <= ex.unlocked ? 'done' : i === sceneIdx ? 'now' : ''}"></i>`).join('')}</div>`)}
      <button class="ex-gear" id="exGear" aria-label="设置">⚙️</button>
    </div>
    <div class="ex-controls">
      <div class="ex-dpad">
        <button class="ex-btn up" id="exUp">▲</button>
        <button class="ex-btn left" id="exLeft">◀</button>
        <button class="ex-btn right" id="exRight">▶</button>
        <button class="ex-btn down" id="exDown">▼</button>
      </div>
      <div class="ex-prompt hidden" id="exPrompt"><b id="exPromptName"></b><span id="exPromptSub">点这里开始仪式</span></div>
      <div style="width:120px;pointer-events:none"></div>
    </div>
    ${def.intro ? `<div class="vx-dialog" id="vxDialog"><div class="vx-dialog-text" id="vxDialogText"></div><div class="vx-dialog-tip">点击继续 ▸</div></div>` : ''}
  </div>`;
  setTimeout(() => $('.vx-chapter')?.classList.add('out'), 2400);

  const world = $('#world'), girl = $('#vxGirl'), prompt = $('#exPrompt');
  /* 角色帧全部预解码为位图，canvas 绘制零换帧解码开销 */
  const spriteCv = $('#vxSpriteC'), sctx = spriteCv.getContext('2d');
  const spriteBM = { front: [], back: [], side: [] };
  const loadBM = async (d, key, url) => {
    try { spriteBM[d][key] = await createImageBitmap(await (await fetch(url)).blob()); } catch (e) { }
  };
  const bmJobs = [];
  ['front', 'back', 'side'].forEach(d => {
    for (let i = 0; i < 12; i++) bmJobs.push(loadBM(d, i, `assets/walk_${d}_${i}.png`));
    bmJobs.push(loadBM(d, 'idle', `assets/walk_${d}_idle.png`));
  });
  Promise.all(bmJobs).then(() => drawSprite('front', 'idle', false));
  let lastDraw = '';
  function drawSprite(dirKey, fKey, flip, tilt = 0) {
    const bm = spriteBM[dirKey] && spriteBM[dirKey][fKey];
    if (!bm) return;
    const sig = `${dirKey}|${fKey}|${flip}|${tilt}`;
    if (sig === lastDraw) return;
    lastDraw = sig;
    sctx.clearRect(0, 0, 300, 440);
    sctx.save();
    if (flip) { sctx.translate(300, 0); sctx.scale(-1, 1); }
    if (tilt) { sctx.translate(150, 430); sctx.rotate(tilt * Math.PI / 180); sctx.translate(-150, -430); }
    sctx.drawImage(bm, 0, 0, 300, 440);
    sctx.restore();
  }
  const keys = { u: 0, d: 0, l: 0, r: 0 };
  const joy = { on: false, id: null, sx: 0, sy: 0, x: 0, y: 0, el: null, knob: null };
  const vel = { x: 0, y: 0 };
  let near = false, quizLock = false, lastDir = 'd';
  const flyers = [...document.querySelectorAll('.vx-flypage')].map((el, i) => ({
    el, k: el.dataset.k,
    x: parseFloat(el.style.left), y: parseFloat(el.style.top),
    vx: (i % 2 ? -1 : 1) * (1.1 + (i % 3) * 0.5), ph: i * 1.3,
  }));
  let gustT = 300, gustOn = 0, gustDir = 1, gustToastDone = false;

  /* 开场剧情对话：逐行播放，点击推进，播完才可移动 */
  let introLock = false;
  if (def.intro) {
    const dlg = $('#vxDialog'), dt = $('#vxDialogText');
    let li = 0;
    introLock = true; quizLock = true;
    const showLine = () => {
      if (li >= def.intro.length) {
        dlg.classList.add('hide');
        setTimeout(() => dlg.remove(), 400);
        introLock = false; quizLock = false;
        return;
      }
      dt.textContent = def.intro[li++];
      dt.classList.remove('pop'); void dt.offsetWidth; dt.classList.add('pop');
    };
    dlg.addEventListener('click', showLine);
    setTimeout(showLine, 1200);   // 等章节标题渐隐后开播
  }

  const rects = built.rects;
  const gateRect = built.gateRect || null;
  const R = 13;
  const hitRect = (x, y, r) => x > r.x - R && x < r.x + r.w + R && y > r.y - R && y < r.y + r.h + R;
  const blocked = (x, y) => {
    if (x < 90 || x > def.W - 90 || y < 90 || y > def.H - 90) return true;
    for (const r of rects) if (hitRect(x, y, r)) return true;
    if (gateRect && !ex.gateOpen && hitRect(x, y, gateRect)) return 'gate';
    return false;
  };
  const scenePages = () => def.pages.filter(p => ex.pages.has(pageKey(p))).length
    + flyers.filter(f => ex.pages.has(f.k)).length;

  function frame() {
    if (G.state !== 'explore') return;
    if (G.paused) { exRAF = requestAnimationFrame(frame); return; }
    let tx = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
    let ty = (keys.d ? 1 : 0) - (keys.u ? 1 : 0);
    if (joy.on && (Math.abs(joy.x) > 10 || Math.abs(joy.y) > 10)) { tx = joy.x / 42; ty = joy.y / 42; }
    const len = Math.hypot(tx, ty);
    if (len > 1) { tx /= len; ty /= len; }
    const SP = 4.6;
    if (quizLock) { tx = 0; ty = 0; }
    vel.x += (tx * SP - vel.x) * 0.22;
    vel.y += (ty * SP - vel.y) * 0.22;
    if (Math.abs(vel.x) < 0.05) vel.x = 0;
    if (Math.abs(vel.y) < 0.05) vel.y = 0;
    const moving = Math.hypot(vel.x, vel.y) > 0.4;
    if (moving) {
      const px0 = ex.x, py0 = ex.y;
      const b1 = blocked(ex.x + vel.x, ex.y);
      if (!b1) ex.x += vel.x;
      const b2 = blocked(ex.x, ex.y + vel.y);
      if (!b2) ex.y += vel.y;
      ex.stepDist = (ex.stepDist || 0) + Math.hypot(ex.x - px0, ex.y - py0);
      if (b1 === 'gate' || b2 === 'gate') openGateQuiz();
      /* 朝向滞后：主轴速度明显占优才换向，避免斜向移动时朝向高频抖动 */
      const ax = Math.abs(vel.x), ay = Math.abs(vel.y);
      if (ax > ay * 1.35) lastDir = vel.x < 0 ? 'l' : 'r';
      else if (ay > ax * 1.35) lastDir = vel.y < 0 ? 'u' : 'd';
      girl.classList.add('walk');
    } else girl.classList.remove('walk');
    girl.className = `vx-girl dir-${lastDir}${girl.classList.contains('walk') ? ' walk' : ''}`;
    /* 走路序列帧：按移动距离驱动，canvas 位图绘制 */
    const dirKey = lastDir === 'u' ? 'back' : (lastDir === 'd' ? 'front' : 'side');
    const walking = girl.classList.contains('walk');
    /* 步态：4 帧（左跨→过渡→右跨→过渡），侧面用自然步幅，随步伐轻微侧倾 */
    const CYC = { front: [4, 1, 6, 8], back: [2, 1, 5, 9], side: [0, 1, 2, 3] };
    const step = Math.floor((ex.stepDist || 0) / 38);
    const fKey = walking ? CYC[dirKey][step % CYC[dirKey].length] : 'idle';
    drawSprite(dirKey, fKey, lastDir === 'r', walking ? (step % 2 === 0 ? -2.2 : 2.2) : 0);
    girl.style.left = ex.x + 'px';
    girl.style.top = ex.y + 'px';
    girl.style.zIndex = Math.round(ex.y) + 5;

    const vw = screenEl.clientWidth, vh = screenEl.clientHeight;
    const camX = def.W <= vw ? (def.W - vw) / 2 : Math.max(0, Math.min(def.W - vw, ex.x - vw / 2));
    const camY = def.H <= vh ? (def.H - vh) / 2 : Math.max(0, Math.min(def.H - vh, ex.y - vh / 2));
    world.style.transform = `translate(${-camX}px,${-camY}px)`;

    /* 风卷经页 + 阵风 */
    if (def.flyPages) {
      const t = performance.now() / 1000;
      for (const f of flyers) {
        if (ex.pages.has(f.k)) continue;
        f.x += f.vx + (gustOn > 0 ? gustDir * 2.2 : 0);
        const fy = f.y + Math.sin(t * 2 + f.ph) * 26;
        if (f.x < 200) f.x = def.W - 220;
        if (f.x > def.W - 220) f.x = 200;
        f.el.style.left = f.x + 'px';
        f.el.style.top = fy + 'px';
        f.el.style.zIndex = Math.round(fy) + 5;
        if (!quizLock && !(+f.el.dataset.cd > Date.now()) && Math.hypot(f.x - ex.x, fy - ex.y) < 55) {
          const r = f.el.getBoundingClientRect();
          sparks(r.left + 15, r.top + 15, 8);
          openPageStudy(f.el, f.k);
        }
      }
      /* 阵风：周期性把人和纸页一起吹动 */
      if (gustOn > 0) {
        gustOn--;
        const push = gustDir * 1.7;
        if (!quizLock && !blocked(ex.x + push, ex.y)) ex.x += push;
        if (gustOn === 0) $('.vx-gust')?.remove();
      } else if (def.gust) {
        gustT--;
        if (gustT <= 0) {
          gustT = 380 + Math.floor(Math.random() * 160);
          gustOn = 130;
          gustDir = Math.random() < 0.5 ? -1 : 1;
          if (!gustToastDone) { toast(gustDir > 0 ? '🌬️ 山风来了——人往东边飘，稳住！' : '🌬️ 山风来了——人往西边飘，稳住！'); gustToastDone = true; }
          const g = document.createElement('div');
          g.className = 'vx-gust' + (gustDir < 0 ? ' rev' : '');
          g.innerHTML = '<i></i><i></i><i></i><i></i><i></i>';
          $('#scr-explore').appendChild(g);
          Sound.wind?.();
        }
      }
    }
    /* 残页 */
    if (!quizLock) document.querySelectorAll('.vx-page').forEach(pg => {
      const px = +pg.dataset.x, py = +pg.dataset.y;
      if (!ex.pages.has(pg.dataset.k) && !(+pg.dataset.cd > Date.now()) && Math.hypot(px - ex.x, py - ex.y) < 52) {
        const r = pg.getBoundingClientRect();
        sparks(r.left + 15, r.top + 15, 8);
        openPageStudy(pg, pg.dataset.k);
      }
    });
    /* 宝箱 */
    if (def.chest && !ex.chestOpen && !quizLock && Math.hypot(def.chest.x - ex.x, def.chest.y - ex.y) < 60) openChestQuiz();
    /* 仪式石碑 */
    near = Math.hypot(def.stele.x - ex.x, def.stele.y - ex.y) < 110 && def.lv === ex.unlocked + 1;
    prompt.classList.toggle('hidden', !near);
    if (near) {
      const lack = def.needPages - scenePages();
      $('#exPromptName').textContent = def.stele.icon + ' ' + def.stele.name;
      $('#exPromptSub').textContent = lack > 0 ? `还差 ${lack} 页残页才能开始` : '点这里开始仪式';
      prompt.classList.toggle('off', lack > 0);
    }
    exRAF = requestAnimationFrame(frame);
  }
  exRAF = requestAnimationFrame(frame);

  /* 残页研读：认出残页上的字（四选一），答对收进图鉴，答错残页留下 */
  function openPageStudy(el, key) {
    quizLock = true;
    Sound.star();
    const pool = GLYPHS.filter(g => !G.learned.has(g.id));
    const g = (pool.length ? shuffle(pool) : shuffle(GLYPHS))[0];
    const opts = shuffle([g, ...shuffle(GLYPHS.filter(x => x.id !== g.id)).slice(0, 3)]);
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="panel">
      <p class="panel-sub" style="margin-bottom:.2rem">📜 经文残页</p>
      <h2 style="margin:.1rem 0">残页研读</h2>
      <p class="panel-sub" style="line-height:1.7">${g.ctx || g.hint}</p>
      <div class="reveal-glyph" style="width:118px;height:118px">${glyphSvg(g)}</div>
      <div class="options" style="grid-template-columns:1fr 1fr;width:100%">
        ${opts.map(o => `<button class="option" data-id="${o.id}">${o.word}</button>`).join('')}
      </div>
    </div>`;
    document.body.appendChild(ov);
    ov.querySelectorAll('.option').forEach(btn => {
      btn.onclick = () => {
        if (btn.dataset.id === g.id) {
          Sound.door();
          learn(g.id);
          ex.pages.add(key);
          el.style.display = 'none';
          G.score += 20;
          $('.hud-score').textContent = `⭐ ${G.score}`;
          ov.remove();
          toast(`📖 「${g.word}」已收入字灵图鉴 +20`);
          setTimeout(() => quizLock = false, 300);
        } else {
          Sound.wrong();
          ov.remove();
          el.dataset.cd = Date.now() + 1500;
          toast('没认对——残页又飘走了，下次再来');
          setTimeout(() => quizLock = false, 500);
        }
      };
    });
  }
  /* 识字快答（石牌坊 / 宝箱） */
  function glyphQuiz(title, sub, onWin) {
    quizLock = true;
    const learned = [...G.learned].map(byId).filter(Boolean);
    const g = learned.length ? shuffle(learned)[0] : shuffle(GLYPHS)[0];
    const opts = shuffle([g, ...shuffle(GLYPHS.filter(x => x.id !== g.id)).slice(0, 2)]);
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="panel">
      <h2>${title}</h2>
      <p class="panel-sub">${sub}</p>
      <div class="reveal-glyph" style="width:120px;height:120px">${glyphSvg(g)}</div>
      <div class="options" style="grid-template-columns:1fr 1fr 1fr;width:100%">
        ${opts.map(o => `<button class="option" data-id="${o.id}" style="font-size:.95rem">${o.word}</button>`).join('')}
      </div>
    </div>`;
    document.body.appendChild(ov);
    ov.querySelectorAll('.option').forEach(btn => {
      btn.onclick = () => {
        if (btn.dataset.id === g.id) {
          Sound.door();
          learn(g.id);
          ov.remove();
          onWin();
          $('.hud-score').textContent = `⭐ ${G.score}`;
          setTimeout(() => quizLock = false, 400);
        } else {
          btn.classList.add('wrong');
          Sound.wrong();
          setTimeout(() => btn.classList.remove('wrong'), 450);
        }
      };
    });
  }
  function openGateQuiz() {
    if (quizLock) return;
    glyphQuiz('字符石牌坊', '牌坊上的封印亮了——认出这个古字才能通过', () => {
      ex.gateOpen = true;
      G.score += 60;
      const g = $('#vxGate');
      if (g) { g.classList.add('open'); $('.seal', g).textContent = '✦'; }
      toast('✦ 封印解开 +60');
    });
  }
  function openChestQuiz() {
    if (quizLock) return;
    glyphQuiz('林中宝匣', '一只缠着五色线的木匣——答对封印字就能打开', () => {
      ex.chestOpen = true;
      G.score += 100;
      const c = $('#vxChest');
      if (c) { c.classList.add('open'); c.textContent = '🧺'; }
      Sound.win();
      toast('🎁 宝匣开了！里面是一页金粉经文 +100');
    });
  }

  /* 方向盘 */
  const bindHold = (id, k) => {
    const btn = $(id);
    const start = e => { e.preventDefault(); keys[k] = 1; };
    const stop = () => { keys[k] = 0; };
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('pointercancel', stop);
  };
  bindHold('#exUp', 'u'); bindHold('#exDown', 'd'); bindHold('#exLeft', 'l'); bindHold('#exRight', 'r');
  $('#exGear').onclick = () => { Sound.click(); setPaused(true); };

  const keyMap = { ArrowUp: 'u', ArrowDown: 'd', ArrowLeft: 'l', ArrowRight: 'r', w: 'u', s: 'd', a: 'l', d: 'r', W: 'u', S: 'd', A: 'l', D: 'r' };
  const keyD = e => { const k = keyMap[e.key]; if (k) { e.preventDefault(); keys[k] = 1; } };
  const keyU = e => { const k = keyMap[e.key]; if (k) keys[k] = 0; };
  window.addEventListener('keydown', keyD);
  window.addEventListener('keyup', keyU);

  /* 虚拟摇杆 */
  const scr = $('#scr-explore');
  scr.addEventListener('pointerdown', e => {
    if (e.target.closest('button') || e.target.closest('.ex-prompt') || e.target.closest('.level-hud')) return;
    joy.on = true; joy.id = e.pointerId; joy.sx = e.clientX; joy.sy = e.clientY; joy.x = 0; joy.y = 0;
    joy.el = document.createElement('div');
    joy.el.className = 'vx-joy';
    joy.el.style.left = joy.sx + 'px';
    joy.el.style.top = joy.sy + 'px';
    joy.knob = document.createElement('div');
    joy.knob.className = 'vx-joy-knob';
    joy.el.appendChild(joy.knob);
    scr.appendChild(joy.el);
  });
  scr.addEventListener('pointermove', e => {
    if (!joy.on || e.pointerId !== joy.id) return;
    let dx = e.clientX - joy.sx, dy = e.clientY - joy.sy;
    const d = Math.hypot(dx, dy);
    if (d > 42) { dx *= 42 / d; dy *= 42 / d; }
    joy.x = dx; joy.y = dy;
    if (joy.knob) joy.knob.style.transform = `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`;
  });
  const joyEnd = e => {
    if (e.pointerId !== joy.id) return;
    joy.on = false; joy.x = 0; joy.y = 0;
    if (joy.el) { joy.el.remove(); joy.el = null; joy.knob = null; }
  };
  scr.addEventListener('pointerup', joyEnd);
  scr.addEventListener('pointercancel', joyEnd);

  prompt.onclick = () => {
    if (!near) return;
    const lack = def.needPages - scenePages();
    if (lack > 0) { Sound.wrong(); toast(`📜 还差 ${lack} 页残页，在附近找找发光的纸页`); return; }
    Sound.click();
    cleanup();
    G.level = def.lv;
    showIntro(def.lv);
  };
  function cleanup() {
    cancelAnimationFrame(exRAF);
    window.removeEventListener('keydown', keyD);
    window.removeEventListener('keyup', keyU);
  }
  G.exploreCleanup = cleanup;
}
function stopExplore() { if (G.exploreCleanup) G.exploreCleanup(); }

const INTROS = {
  1: { icon: '🔥', name: '看图猜字', place: '火塘边', story: '奶奶摊开东巴经：<br>"这些字啊，都是画出来的。"<br>前 5 题奶奶给你提示，<br>后面的路要自己走了。' },
  2: { icon: '🏮', name: '火塘配对', place: '木楼火塘', story: '莫愁把残卷上的字抄在小木牌上。<br>小心——有一个词是混进来的陷阱，<br>连错的木牌会熄灭五色线。' },
  3: { icon: '🗝️', name: '地宫寻宝', place: '藏书楼地宫', story: '地宫里一片漆黑。<br>石门上没有字，只有一句谜语——<br>猜出谜语说的是什么，再选出对应的字。' },
  4: { icon: '🖌️', name: '执笔描红', place: '灯下书桌', story: '最后，像莫愁一样提起笔。<br>用手指顺着金色的古字描下来，<br>墨盖住了字形，字就真正属于你了。' },
};
const LEVEL_COUNT = 4;

function showIntro(lv) {
  G.state = 'intro'; updateHud();
  const i = INTROS[lv];
  Sound.level();
  const nodes = Object.keys(INTROS).map(k => {
    k = +k;
    const cls = k < lv ? 'done' : k === lv ? 'now' : '';
    return `<div class="map-node ${cls}"><i>${INTROS[k].icon}</i><span>${INTROS[k].place}</span></div>`;
  }).join('<div class="map-link"></div>');
  screenEl.innerHTML = `<div class="screen" id="scr-intro">
    <div class="bg-photo" style="background-image:url('assets/family.jpg')"></div>
    <div class="map-path">${nodes}</div>
    <img class="intro-girl" src="assets/girl.jpg" alt="莫愁">
    <p class="intro-level">第 ${lv} / ${LEVEL_COUNT} 关</p>
    <h2 class="intro-name">${i.icon} ${i.name}</h2>
    <p class="intro-story">${i.story}</p>
    <div style="width:min(80vw,280px);margin:0 auto">
      <button class="btn primary" id="btnGo">出发</button>
    </div>
  </div>`;
  $('#btnGo').onclick = () => { Sound.click(); ({ 1: startL1, 2: startL2, 3: startL3, 4: startL4 })[lv](); };
}

function showClear(lv, extra = '') {
  showRitual(lv, extra);
}

/* ---------- 破译仪式（巴别塔圣歌式：整页破译定稿） ---------- */
function showRitual(lv, extra) {
  G.state = 'ritual'; updateHud();
  const pools = { 1: G.l1?.pool, 2: G.l2?.pool, 3: G.l3?.pool, 4: G.l4?.pool };
  const pool = shuffle((pools[lv] || []).slice()).slice(0, 5);
  if (!pool.length) return showStars(lv, extra);
  let done = 0, correct = 0;
  const cards = pool.map(g => {
    const wrong = shuffle(GLYPHS.filter(x => x.id !== g.id))[0];
    const opts = shuffle([g.word, wrong.word]);
    return { g, opts };
  });
  screenEl.innerHTML = `<div class="screen" id="scr-ritual">
    <div class="bg-photo" style="background-image:url('assets/family.jpg')"></div>
    <div class="codex-head">
      <h2 class="codex-title">破译仪式</h2>
      <p class="codex-sub">像破译手稿一样，为每个字选定最终的意思<br>全部猜对，这一页就能「定稿」</p>
    </div>
    <div class="ritual-list">
      ${cards.map((c, i) => `<div class="ritual-card" data-i="${i}">
        <div class="ritual-glyph">${glyphSvg(c.g)}</div>
        <div class="ritual-opts">
          ${c.opts.map(w => `<button class="ritual-opt" data-w="${w}">${w}</button>`).join('')}
        </div>
      </div>`).join('')}
    </div>
    <div style="width:min(80vw,280px);margin:.5rem auto 0">
      <button class="btn primary" id="btnRitualNext" disabled style="opacity:.4">定稿</button>
    </div>
  </div>`;
  screenEl.querySelectorAll('.ritual-card').forEach(card => {
    const c = cards[+card.dataset.i];
    card.querySelectorAll('.ritual-opt').forEach(btn => {
      btn.onclick = () => {
        if (card.classList.contains('done')) return;
        card.classList.add('done');
        const ok = btn.dataset.w === c.g.word;
        btn.classList.add(ok ? 'right' : 'bad');
        if (!ok) card.querySelector(`[data-w="${c.g.word}"]`).classList.add('right');
        done++;
        if (ok) { correct++; G.score += 50; learn(c.g.id); Sound.correct(); }
        else Sound.wrong();
        if (done >= cards.length) {
          if (correct === cards.length) {
            G.score += 200;
            toast('📜 整页定稿！奖励 +200');
            Sound.win();
          }
          const b = $('#btnRitualNext');
          b.disabled = false; b.style.opacity = 1;
          b.textContent = `定稿 ${correct}/${cards.length} · 继续`;
        }
      };
    });
  });
  $('#btnRitualNext').onclick = () => { Sound.click(); showStars(lv, extra); };
}

function showStars(lv, extra = '') {
  G.state = 'clear'; updateHud();
  Sound.win();
  checkAchievements();
  const st = G.stars[lv] || 1;
  screenEl.innerHTML = `<div class="screen" id="scr-clear">
    <div class="bg-photo" style="background-image:url('assets/bg_glyphs.jpg')"></div>
    <img class="intro-girl" src="assets/girl.jpg" alt="莫愁">
    <h2 class="intro-name">过关啦！</h2>
    <div class="clear-stars">${starStr(st)}</div>
    <p class="clear-score">当前得分 ${G.score}${extra}</p>
    <div style="width:min(80vw,280px);margin:0 auto">
      <button class="btn primary" id="btnNext">${lv < LEVEL_COUNT ? '继续赶路 →' : '点亮星空'}</button>
    </div>
  </div>`;
  $('#btnNext').onclick = () => {
    Sound.click();
    if (lv < LEVEL_COUNT) { G.level = lv + 1; showExplore(lv); } else showVictory();
  };
}

/* ================= 第一关：看图猜字 ================= */
const L1_ROUNDS = 10, L1_OPTS = 4, L1_HINT_ROUNDS = 5;
function startL1() {
  Sound.bgm(false);
  const pool = shuffle(GLYPHS).slice(0, L1_ROUNDS);
  G.l1 = { pool, idx: 0, combo: 0, misses: 0 };
  G.state = 'l1'; updateHud();
  renderL1();
}

function renderL1() {
  const { pool, idx } = G.l1;
  const g = pool[idx];
  const wrong = shuffle(GLYPHS.filter(x => x.id !== g.id)).slice(0, L1_OPTS - 1);
  const opts = shuffle([g, ...wrong]);
  const showHint = idx < L1_HINT_ROUNDS;
  screenEl.innerHTML = `<div class="screen" id="scr-quiz">
    <div class="bg-photo" style="background-image:url('assets/bg_glyphs.jpg')"></div>
    ${levelHud(showHint ? '这个"画"是什么意思？' : '没有提示了——相信你的眼睛！', dots(L1_ROUNDS, idx, idx))}
    <div class="quiz-timer"><div class="quiz-timer-bar" id="qTimer"></div></div>
    <div class="quiz-stage">
      <div class="glyph-card"><span class="glyph-corner tl"></span><span class="glyph-corner tr"></span><span class="glyph-corner bl"></span><span class="glyph-corner br"></span>${glyphSvg(g)}</div>
      <p class="quiz-hint">${showHint ? '小提示：' + g.hint : ''}</p>
      ${!showHint ? `<div class="ctx-sentence">「${g.ctx}」<span class="ctx-tag">语境破译</span></div>` : ''}
      <div class="options">
        ${opts.map(o => `<button class="option" data-id="${o.id}">${o.word}</button>`).join('')}
      </div>
      <p class="combo-fire" id="comboFire">${G.l1.combo >= 2 ? '🔥 连对 x' + G.l1.combo : ''}</p>
    </div>
  </div>`;
  // 每题 12 秒倒计时
  let tLeft = 12;
  const tBar = $('#qTimer');
  const advance = () => {
    G.l1.idx++;
    if (G.l1.idx >= L1_ROUNDS) {
      G.stars[1] = G.l1.misses <= 1 ? 3 : G.l1.misses <= 3 ? 2 : 1;
      showClear(1);
    } else renderL1();
  };
  G.l1.timer = setInterval(() => {
    if (G.paused || G.state !== 'l1') return;
    tLeft -= 0.1;
    if (tBar) tBar.style.width = Math.max(0, tLeft / 12 * 100) + '%';
    if (tLeft <= 0) {
      clearInterval(G.l1.timer);
      G.l1.misses++; G.l1.combo = 0;
      Sound.wrong();
      showReveal(g, advance, true);
    }
  }, 100);
  screenEl.querySelectorAll('.option').forEach(btn => {
    btn.onclick = () => {
      const ok = btn.dataset.id === g.id;
      screenEl.querySelectorAll('.option').forEach(b => b.style.pointerEvents = 'none');
      if (ok) {
        clearInterval(G.l1.timer);
        btn.classList.add('correct');
        G.l1.combo++;
        if (G.l1.combo === 5) unlock('combo5');
        const gain = 100 + (G.l1.combo - 1) * 20 + Math.round(tLeft) * 2;
        G.score += gain;
        G.learned.add(g.id);
        Sound.correct();
        const r = btn.getBoundingClientRect();
        sparks(r.left + r.width / 2, r.top + r.height / 2);
        setTimeout(() => showReveal(g, advance), 650);
      } else {
        btn.classList.add('wrong');
        G.l1.combo = 0;
        G.l1.misses++;
        const cf = $('#comboFire'); if (cf) cf.textContent = '';
        Sound.wrong();
        setTimeout(() => {
          screenEl.querySelectorAll('.option').forEach(b => { b.style.pointerEvents = ''; b.classList.remove('wrong'); });
        }, 500);
      }
    };
  });
}

function showReveal(g, next, timedOut = false) {
  const stage = $('.quiz-stage');
  stage.innerHTML = `<div class="reveal-card">
    ${timedOut ? '<p class="timeout-note">⏰ 时间到！正确答案是——</p>' : ''}
    <div class="reveal-glyph">${glyphSvg(g)}</div>
    <p class="reveal-word">${g.word}</p>
    <p class="reveal-hanzi">东巴象形字 · 汉字写作「${g.hanzi}」—— 一字即一画</p>
    <div style="width:min(70vw,220px);margin:0 auto"><button class="btn primary" id="btnRevealNext">继续</button></div>
  </div>`;
  $('.hud-score').textContent = `⭐ ${G.score}`;
  $('#btnRevealNext').onclick = () => { Sound.click(); next(); };
}

/* ================= 第二关：火塘配对（含干扰词） ================= */
const L2_PAIRS = 6, L2_DECOYS = 1;
let l2Timer = null;

function startL2() {
  Sound.bgm(false);
  const pool = shuffle(GLYPHS).slice(0, L2_PAIRS);
  const decoys = shuffle(GLYPHS.filter(x => !pool.includes(x))).slice(0, L2_DECOYS);
  G.l2 = { pool, words: shuffle([...pool, ...decoys]), sel: null, linked: 0, misses: 0, left: 60 };
  G.state = 'l2'; updateHud();
  renderL2();
  l2Timer = setInterval(() => {
    if (G.paused || G.state !== 'l2') return;
    G.l2.left--;
    const el = $('#matchTime');
    if (el) el.textContent = G.l2.left;
    if (G.l2.left <= 0) {
      clearInterval(l2Timer);
      G.stars[2] = 1;
      showClear(2, '（时间到，未连完的字下次再来）');
    }
  }, 1000);
}

function renderL2() {
  const { pool, words } = G.l2;
  screenEl.innerHTML = `<div class="screen" id="scr-match">
    <div class="bg-photo" style="background-image:url('assets/family.jpg')"></div>
    ${levelHud('6 个字对 7 个词——有一个是陷阱！', dots(L2_PAIRS, G.l2.linked, G.l2.linked))}
    <p class="match-timer">⏳ <span id="matchTime">${G.l2.left}</span> 秒</p>
    <div class="match-area">
      <div class="match-col" id="colG">
        ${pool.map(g => `<div class="match-item" data-id="${g.id}" data-side="g">${glyphSvg(g)}</div>`).join('')}
      </div>
      <div class="match-col" id="colW">
        ${words.map(g => `<div class="match-item" data-id="${g.id}" data-side="w">${g.word}</div>`).join('')}
      </div>
      <svg id="matchLines"></svg>
    </div>
  </div>`;
  screenEl.querySelectorAll('.match-item').forEach(item => {
    item.onclick = () => {
      if (item.classList.contains('linked')) return;
      const side = item.dataset.side;
      if (side === 'g') {
        screenEl.querySelectorAll('.match-item.sel').forEach(x => x.classList.remove('sel'));
        item.classList.add('sel');
        G.l2.sel = item;
        Sound.click();
      } else {
        if (!G.l2.sel) { item.classList.add('wrongpick'); setTimeout(() => item.classList.remove('wrongpick'), 450); return; }
        if (G.l2.sel.dataset.id === item.dataset.id) {
          const color = FIVE_COLORS[G.l2.linked % FIVE_COLORS.length];
          drawLine(G.l2.sel, item, color);
          G.l2.sel.classList.add('linked'); item.classList.add('linked');
          G.l2.sel.classList.remove('sel');
          G.l2.sel = null;
          G.l2.linked++;
          G.score += 80;
          G.learned.add(item.dataset.id);
          Sound.link();
          const r = item.getBoundingClientRect();
          sparks(r.left + r.width / 2, r.top + r.height / 2, 8);
          $('.hud-score').textContent = `⭐ ${G.score}`;
          $('.progress-dots').outerHTML = dots(L2_PAIRS, G.l2.linked, G.l2.linked);
          if (G.l2.linked >= L2_PAIRS) {
            clearInterval(l2Timer);
            const bonus = G.l2.left * 5;
            G.score += bonus;
            G.stars[2] = G.l2.misses === 0 && G.l2.left >= 25 ? 3 : G.l2.left >= 10 ? 2 : 1;
            setTimeout(() => showClear(2, `（时间奖励 +${bonus}）`), 700);
          }
        } else {
          const isDecoy = !G.l2.pool.some(p => p.id === item.dataset.id);
          item.classList.add(isDecoy ? 'decoy' : 'wrongpick');
          G.l2.sel.classList.add('wrongpick');
          G.l2.misses++;
          toast(isDecoy ? '🪤 这是混进来的陷阱词！' : '不是这个哦，再想想');
          Sound.wrong();
          setTimeout(() => {
            item.classList.remove('wrongpick', 'decoy');
            if (G.l2.sel) { G.l2.sel.classList.remove('wrongpick', 'sel'); G.l2.sel = null; }
          }, 550);
        }
      }
    };
  });
}

function drawLine(a, b, color) {
  const svg = $('#matchLines');
  const sr = svg.getBoundingClientRect();
  const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', ra.right - sr.left); line.setAttribute('y1', ra.top + ra.height / 2 - sr.top);
  line.setAttribute('x2', rb.left - sr.left); line.setAttribute('y2', rb.top + rb.height / 2 - sr.top);
  line.style.stroke = color; line.style.color = color;
  svg.appendChild(line);
}

/* ================= 第三关：地宫寻宝（谜语式） ================= */
const L3_DOORS = 8, L3_OPTS = 4;
function startL3() {
  Sound.bgm(false);
  const pool = shuffle(GLYPHS).slice(0, L3_DOORS);
  G.l3 = { pool, open: 0, misses: 0 };
  G.state = 'l3'; updateHud();
  renderL3();
}

function renderL3() {
  const { pool } = G.l3;
  screenEl.innerHTML = `<div class="screen" id="scr-tomb">
    <div class="tomb-dark"></div>
    <div class="tomb-doors">
      ${pool.map((g, i) => `<div class="door" data-i="${i}" data-id="${g.id}">
        <div class="door-seal"><span class="seal-ring">${['壹','贰','叁','肆','伍','陆','柒','捌'][i]}</span></div><span class="door-lock">🔒</span>
      </div>`).join('')}
    </div>
    <div id="torchMask"></div>
    <div style="position:absolute;top:calc(1rem + var(--safe-top));left:1.1rem;right:1.1rem;z-index:4">
      ${levelHud('拖动火把照亮四周，点一扇石门猜谜认字', dots(L3_DOORS, 0, 0))}
    </div>
    <p class="tomb-tip">🔥 手指拖动，火光圈会跟着你走</p>
  </div>`;
  const mask = $('#torchMask');
  const move = e => {
    const t = e.touches ? e.touches[0] : e;
    mask.style.setProperty('--tx', t.clientX + 'px');
    mask.style.setProperty('--ty', t.clientY + 'px');
  };
  const tomb = $('#scr-tomb');
  tomb.addEventListener('pointermove', move);
  tomb.addEventListener('touchmove', move, { passive: true });
  tomb.addEventListener('pointerdown', move);
  screenEl.querySelectorAll('.door').forEach(d => {
    d.onclick = () => {
      if (d.classList.contains('open')) return;
      Sound.click();
      openDoorQuiz(d);
    };
  });
}

function openDoorQuiz(doorEl) {
  const g = byId(doorEl.dataset.id);
  const wrong = shuffle(GLYPHS.filter(x => x.id !== g.id)).slice(0, L3_OPTS - 1);
  const opts = shuffle([g, ...wrong]);
  const ov = document.createElement('div');
  ov.className = 'overlay tomb-quiz';
  ov.innerHTML = `<div class="panel">
    <h2>石门谜语</h2>
    <div class="riddle">「${g.hint}」</div>
    <p class="panel-sub">它说的是哪个东巴字？</p>
    <div class="tomb-opts">
      ${opts.map(o => `<button class="tomb-opt" data-id="${o.id}"><span class="glyph-mini">${glyphSvg(o)}</span></button>`).join('')}
    </div>
    <button class="btn ghost" id="tombCancel" style="margin-top:.9rem">先去看看别的</button>
  </div>`;
  document.body.appendChild(ov);
  $('#tombCancel', ov).onclick = () => { Sound.click(); ov.remove(); };
  ov.querySelectorAll('.tomb-opt').forEach(btn => {
    btn.onclick = () => {
      if (btn.dataset.id === g.id) {
        btn.classList.add('correct');
        Sound.door();
        setTimeout(() => {
          ov.remove();
          doorEl.classList.add('open');
          $('.door-seal', doorEl).outerHTML = glyphSvg(g, 'door-glyph');
          $('.door-lock', doorEl).textContent = g.word;
          G.l3.open++;
          G.score += 120;
          G.learned.add(g.id);
          const r = doorEl.getBoundingClientRect();
          sparks(r.left + r.width / 2, r.top + r.height / 2, 16);
          $('.hud-score').textContent = `⭐ ${G.score}`;
          $('.progress-dots').outerHTML = dots(L3_DOORS, G.l3.open, G.l3.open);
          if (G.l3.open >= L3_DOORS) {
            G.stars[3] = G.l3.misses <= 1 ? 3 : G.l3.misses <= 3 ? 2 : 1;
            setTimeout(() => showClear(3), 900);
          }
        }, 600);
      } else {
        btn.classList.add('wrong');
        G.l3.misses++;
        Sound.wrong();
        setTimeout(() => btn.classList.remove('wrong'), 500);
      }
    };
  });
}

/* ================= 第四关：执笔描红 ================= */
const L4_GLYPHS = 3, L4_COVER = 0.45, L4_PREC = 0.45;
let l4RAF = null;

function startL4() {
  Sound.bgm(false);
  const pool = shuffle(GLYPHS).slice(0, L4_GLYPHS);
  G.l4 = { pool, idx: 0, results: [] };
  G.state = 'l4'; updateHud();
  renderL4();
}

function glyphMask(g, size) {
  // 将字形渲染到离屏 canvas，返回目标像素掩码
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  return new Promise(resolve => {
    const inner = g.real
      ? `<g fill="black" stroke="none">${g.svg}</g>`
      : `<g stroke="black" stroke-width="9" stroke-linecap="round" fill="none">${g.svg.replace(/fill="currentColor" stroke="none"/g, 'fill="black" stroke="none"')}</g>`;
    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">${inner}</svg>`;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, size, size);
      const d = ctx.getImageData(0, 0, size, size).data;
      const mask = new Uint8Array(size * size);
      let total = 0;
      for (let i = 0; i < size * size; i++) if (d[i * 4 + 3] > 100) { mask[i] = 1; total++; }
      resolve({ mask, total });
    };
    img.onerror = () => resolve({ mask: new Uint8Array(size * size), total: 0 });
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
  });
}

async function renderL4() {
  const { pool, idx } = G.l4;
  const g = pool[idx];
  screenEl.innerHTML = `<div class="screen" id="scr-trace">
    <div class="bg-photo" style="background-image:url('assets/family.jpg')"></div>
    ${levelHud('顺着金色的字描下来，像莫愁在灯下描经一样', dots(L4_GLYPHS, idx, idx))}
    <div class="trace-stage">
      <div class="trace-wrap" id="traceWrap">
        <div class="trace-under">${glyphSvg(g)}</div>
        <canvas id="traceCanvas"></canvas>
      </div>
      <div class="trace-progress"><div class="trace-bar" id="traceBar"></div><span id="tracePct">0%</span></div>
      <div class="trace-btns">
        <button class="btn ghost" id="btnTraceClear">重写</button>
        <button class="btn primary" id="btnTraceDone">写好了</button>
      </div>
    </div>
  </div>`;

  const wrap = $('#traceWrap');
  const canvas = $('#traceCanvas');
  const SIZE = 160; // 掩码分辨率
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = wrap.getBoundingClientRect();
  canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px'; canvas.style.height = rect.height + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.strokeStyle = '#f5c96b';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(14, rect.width * 0.055);
  ctx.shadowColor = 'rgba(245,201,107,.8)'; ctx.shadowBlur = 8;

  // 玩家笔迹掩码
  const ink = document.createElement('canvas');
  ink.width = ink.height = SIZE;
  const inkCtx = ink.getContext('2d', { willReadFrequently: true });
  inkCtx.strokeStyle = '#000'; inkCtx.lineCap = 'round'; inkCtx.lineJoin = 'round';
  inkCtx.lineWidth = SIZE * 0.085;

  const { mask, total } = await glyphMask(g, SIZE);
  if (G.state !== 'l4') return; // 异步期间切屏

  let drawing = false, last = null, dirty = false;
  const pos = e => {
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  };
  const toMask = p => ({ x: p.x / canvas.getBoundingClientRect().width * SIZE, y: p.y / canvas.getBoundingClientRect().height * SIZE });
  const down = e => { e.preventDefault(); drawing = true; last = pos(e); dot(last); };
  const dot = p => {
    ctx.beginPath(); ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, 7); ctx.fillStyle = '#f5c96b'; ctx.fill();
    const m = toMask(p);
    inkCtx.beginPath(); inkCtx.arc(m.x, m.y, inkCtx.lineWidth / 2, 0, 7); inkCtx.fill();
    dirty = true;
  };
  const moveFn = e => {
    if (!drawing) return;
    e.preventDefault();
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    const a = toMask(last), b = toMask(p);
    inkCtx.beginPath(); inkCtx.moveTo(a.x, a.y); inkCtx.lineTo(b.x, b.y); inkCtx.stroke();
    last = p; dirty = true;
  };
  const up = () => { drawing = false; };

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', moveFn);
  window.addEventListener('pointerup', up);
  canvas.addEventListener('touchstart', down, { passive: false });
  canvas.addEventListener('touchmove', moveFn, { passive: false });
  window.addEventListener('touchend', up);

  function coverage() {
    const d = inkCtx.getImageData(0, 0, SIZE, SIZE).data;
    let hit = 0, drawn = 0;
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (d[i * 4 + 3] > 60) { drawn++; if (mask[i]) hit++; }
    }
    return { cov: total ? hit / total : 0, prec: drawn ? hit / drawn : 0, drawn };
  }
  function updateBar() {
    if (dirty) {
      dirty = false;
      const { cov } = coverage();
      const pct = Math.min(100, Math.round(cov / L4_COVER * 100));
      $('#traceBar').style.width = pct + '%';
      $('#tracePct').textContent = pct + '%';
      if (pct >= 100) setTimeout(finish, 350);
    }
    l4RAF = requestAnimationFrame(updateBar);
  }
  l4RAF = requestAnimationFrame(updateBar);

  $('#btnTraceClear').onclick = () => {
    Sound.click();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    inkCtx.clearRect(0, 0, SIZE, SIZE);
  };
  let finished = false;
  const finish = () => {
    if (finished) return;
    const { cov, prec, drawn } = coverage();
    if (drawn < SIZE * SIZE * 0.004) { // 几乎没写
      $('#tracePct').textContent = '先描一描';
      return;
    }
    if (cov < L4_COVER) {
      $('#tracePct').textContent = `还差一点点（${Math.round(cov / L4_COVER * 100)}%）`;
      Sound.wrong();
      return;
    }
    if (prec < 0.38) {
      $('#tracePct').textContent = '墨涂到字外面啦，顺着金字描';
      Sound.wrong();
      return;
    }
    finished = true;
    cancelAnimationFrame(l4RAF);
    const quality = cov >= 0.8 && prec >= 0.6 ? 3 : cov >= 0.65 && prec >= L4_PREC ? 2 : 1;
    G.l4.results.push(quality);
    G.learned.add(g.id);
    G.score += 150 + (quality - 1) * 50;
    Sound.correct();
    const r = wrap.getBoundingClientRect();
    sparks(r.left + r.width / 2, r.top + r.height / 2, 18);
    setTimeout(() => showTraceReveal(g, quality), 500);
  };
  $('#btnTraceDone').onclick = finish;

  function showTraceReveal(g, quality) {
    G.l4.idx++;
    const isLast = G.l4.idx >= L4_GLYPHS;
    const stage = $('.trace-stage');
    stage.innerHTML = `<div class="reveal-card">
      <div class="reveal-glyph">${glyphSvg(g)}</div>
      <p class="reveal-word">${g.word} ${starStr(quality)}</p>
      <p class="reveal-hanzi">东巴象形字 · 汉字写作「${g.hanzi}」—— 这个字现在是你的了</p>
      <div style="width:min(70vw,220px);margin:0 auto"><button class="btn primary" id="btnTraceNext">${isLast ? '完成' : '下一个字'}</button></div>
    </div>`;
    $('.hud-score').textContent = `⭐ ${G.score}`;
    $('#btnTraceNext').onclick = () => {
      Sound.click();
      if (isLast) {
        const avg = G.l4.results.reduce((a, b) => a + b, 0) / G.l4.results.length;
        G.stars[4] = Math.round(avg);
        showClear(4);
      } else renderL4();
    };
  }
}

/* ================= 胜利：点亮星空 ================= */
function showVictory() {
  G.state = 'victory'; updateHud();
  Sound.ambient(false); Sound.bgm(false); Sound.win();
  const learnedCount = G.learned.size;
  const totalStars = Object.values(G.stars).reduce((a, b) => a + b, 0);
  const maxStars = LEVEL_COUNT * 3;
  const isRecord = !G.best || G.score > G.best.score;
  if (isRecord) {
    G.best = { score: G.score, learned: learnedCount, stars: totalStars };
    localStorage.setItem('db_best', JSON.stringify(G.best));
  }
  const starsHtml = [...G.learned].map((id, i) => {
    const g = byId(id);
    const left = 6 + Math.random() * 88, size = 34 + Math.random() * 40, dur = 5 + Math.random() * 4, delay = i * 0.35;
    return `<div class="sky-star" style="left:${left}%;bottom:-60px;width:${size}px;height:${size}px;animation-duration:${dur}s;animation-delay:${delay}s">${glyphSvg(g)}</div>`;
  }).join('');
  const levelStars = Object.keys(INTROS).map(k =>
    `<div class="vstar"><span>${INTROS[k].name}</span><b>${starStr(G.stars[k] || 0)}</b></div>`).join('');
  screenEl.innerHTML = `<div class="screen" id="scr-victory">
    <div class="bg-photo" style="background-image:url('assets/hero.jpg');filter:brightness(.62)"></div>
    <div id="sky">${starsHtml}</div>
    <div style="position:relative;z-index:2">
      <h2 class="victory-title">星空被点亮了</h2>
      <p class="victory-quote">莫愁举起火把，看着学会的字一颗一颗升上夜空。<br>「原来文字不是躺在经卷里的，<br>它们可以住在孩子的眼睛里。」</p>
      <div class="victory-stars">${levelStars}</div>
      <div class="victory-stats">
        <div><b>${G.score}</b><span>总得分</span></div>
        <div><b>${totalStars}/${maxStars}</b><span>星星</span></div>
        <div><b>${learnedCount}</b><span>学会的东巴字</span></div>
      </div>
      <p>${isRecord ? '<span class="newrecord">新纪录！</span>' : ''}</p>
      <div style="width:min(84vw,300px);margin:0 auto">
        <button class="btn primary" id="btnAgain">再玩一次</button>
        <button class="btn ghost" id="btnHome">回到首页</button>
      </div>
    </div>
  </div>`;
  [...G.learned].slice(0, 12).forEach((id, i) => setTimeout(() => Sound.star(), i * 350));
  $('#btnAgain').onclick = () => { Sound.click(); startRun(); };
  $('#btnHome').onclick = () => { Sound.click(); showTitle(); };
}

/* ---------- 暂停 ---------- */
function setPaused(p) {
  if (!['l1', 'l2', 'l3', 'l4', 'explore'].includes(G.state)) return;
  G.paused = p;
  pauseOverlay.classList.toggle('hidden', !p);
}
$('#btnPause').onclick = () => { Sound.click(); setPaused(true); };
$('#btnResume').onclick = () => { Sound.click(); setPaused(false); };
$('#btnRestartLevel').onclick = () => {
  Sound.click(); setPaused(false);
  if (l2Timer) clearInterval(l2Timer);
  if (l4RAF) cancelAnimationFrame(l4RAF);
  if (G.state === 'explore') { stopExplore(); showExplore(G.explore?.unlocked ?? 0); }
  else ({ l1: startL1, l2: startL2, l3: startL3, l4: startL4 })[G.state]();
};
$('#btnQuitTitle').onclick = () => {
  Sound.click(); setPaused(false);
  if (l2Timer) clearInterval(l2Timer);
  if (l4RAF) cancelAnimationFrame(l4RAF);
  stopExplore();
  showTitle();
};
$('#btnMute').onclick = () => {
  const m = Sound.toggleMute();
  $('#btnMute').textContent = m ? '🔇' : '🔊';
  if (!m) { Sound.ambient(true); Sound.click(); }
};
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

/* ---------- 启动 ---------- */
window.__db = { G, startL1, startL2, startL3, startL4, showVictory, showExplore }; // 调试钩子
showTitle();
})();
