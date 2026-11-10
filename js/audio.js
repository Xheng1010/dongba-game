/* WebAudio 合成音效与氛围音 —— 无外部音频文件 */
const Sound = (() => {
  let ctx = null, master = null, padNodes = null;
  let muted = localStorage.getItem('db_muted') === '1';

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      return true;
    } catch (e) { return false; }
  }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  function tone(freq, dur, type = 'sine', vol = 0.5, when = 0, slide = 0) {
    if (!ensure()) return;
    resume();
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  return {
    unlock() { ensure(); resume(); },
    click()  { tone(660, .08, 'triangle', .25); },
    correct(){ tone(523, .14, 'sine', .4); tone(659, .14, 'sine', .4, .09); tone(784, .3, 'sine', .45, .18); },
    wrong()  { tone(196, .22, 'sawtooth', .18, 0, -60); },
    link()   { tone(880, .1, 'triangle', .3); tone(1174, .22, 'triangle', .3, .07); },
    door()   { tone(140, .5, 'sine', .5, 0, 60); tone(392, .35, 'triangle', .3, .18); },
    star()   { tone(1046, .4, 'sine', .22, 0, 500); },
    win()    { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, .32, 'sine', .35, i * .13)); },
    level()  { tone(392, .18, 'triangle', .35); tone(523, .18, 'triangle', .35, .14); tone(659, .4, 'triangle', .4, .28); },
    ambient(on) {
      if (!ensure()) return;
      if (padNodes) { padNodes.forEach(n => { try { n.stop ? n.stop() : n.disconnect(); } catch (e) {} }); padNodes = null; }
      if (!on || muted) return;
      resume();
      const g = ctx.createGain(); g.gain.value = 0.05; g.connect(master);
      const freqs = [130.8, 196, 261.6];
      padNodes = freqs.map(f => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const og = ctx.createGain(); og.gain.value = 0.33;
        o.connect(og); og.connect(g); o.start(); return o;
      });
      padNodes.push(g);
    },
    /* 背景音乐：优先播放纳西古乐《白沙细乐》实录，加载失败退回合成拨弦 */
    bgm(on, theme = 'explore') {
      if (this._bgmT) { clearInterval(this._bgmT); this._bgmT = null; }
      if (this._bgmBus) { try { this._bgmBus.disconnect(); } catch (e) {} this._bgmBus = null; }
      if (this._bgmAudio) { try { this._bgmAudio.pause(); } catch (e) {} this._bgmAudio = null; }
      if (!on || muted) return;
      /* 安静东方风纯音乐（Kevin MacLeod《Eastminster》，CC-BY），循环播放 */
      const a = new Audio('assets/bgm_calm.mp3');
      a.loop = true; a.volume = 0.32;
      this._bgmAudio = a;
      a.play().catch(() => { /* 文件缺失或被拦截时退回合成版本 */
        if (this._bgmAudio === a) { this._bgmAudio = null; this._bgmSynth(theme); }
      });
      a.addEventListener('error', () => {
        if (this._bgmAudio === a) { this._bgmAudio = null; this._bgmSynth(theme); }
      });
    },
    /* 合成背景音乐（备用）：拨弦音色（类古筝）+ 回声空间 + 呼吸感乐句 */
    _bgmSynth(theme = 'explore') {
      if (!ensure()) return;
      resume();
      /* 总线：干声 + 反馈延迟制造山谷回声 */
      const bus = ctx.createGain(); bus.gain.value = 1;
      const dry = ctx.createGain(); dry.gain.value = 0.8;
      const dly = ctx.createDelay(1); dly.delayTime.value = 0.29;
      const fb = ctx.createGain(); fb.gain.value = 0.32;
      const wet = ctx.createGain(); wet.gain.value = 0.22;
      bus.connect(dry); dry.connect(master);
      bus.connect(dly); dly.connect(fb); fb.connect(dly); dly.connect(wet); wet.connect(master);
      this._bgmBus = bus;
      /* 拨弦：双振荡微失谐 + 低通扫频 + 快速衰减 */
      const pluck = (freq, when, vol = 0.16) => {
        [0, 4].forEach(det => {
          const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
          o.type = 'triangle'; o.frequency.value = freq; o.detune.value = det;
          f.type = 'lowpass';
          f.frequency.setValueAtTime(Math.max(40, freq * 5), when);
          f.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 1.1), when + 0.6);
          g.gain.setValueAtTime(0, when);
          g.gain.linearRampToValueAtTime(vol / 2, when + 0.008);
          g.gain.exponentialRampToValueAtTime(0.0006, when + 1.3);
          o.connect(f); f.connect(g); g.connect(bus);
          o.start(when); o.stop(when + 1.4);
        });
      };
      const pad2 = (freq, when, dur, vol = 0.03) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = freq;
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(vol, when + dur * .3);
        g.gain.linearRampToValueAtTime(0, when + dur);
        o.connect(g); g.connect(bus); o.start(when); o.stop(when + dur + .1);
      };
      /* 五声音阶乐句：null 为休止，节奏有呼吸 */
      const PH = {
        title: [[523, 1], [587, .5], [659, 1.5], [784, 1], [659, .5], [587, 1.5], [523, 1], [440, .5], [392, 2], [null, 1],
                [523, 1], [659, .5], [784, 1.5], [880, 1], [784, .5], [659, 1.5], [587, 1], [523, .5], [440, 2], [null, 2]],
        explore: [[659, .5], [784, .5], [880, 1], [1046, .5], [880, .5], [784, 1], [659, .5], [587, .5], [523, 1.5], [null, .5],
                  [587, .5], [659, .5], [784, 1], [880, .5], [784, .5], [659, 1], [587, .5], [440, .5], [523, 1.5], [null, 1]],
      };
      const BASS = { title: 130.8, explore: 196 };
      const seq = PH[theme] || PH.explore;
      let step = 0, nextAt = ctx.currentTime + 0.15, bar = 0;
      const STEP = 0.34;
      this._bgmT = setInterval(() => {
        if (muted) return;
        while (nextAt < ctx.currentTime + 0.8) {
          const n = seq[step % seq.length];
          if (step % seq.length === 0) { pad2(BASS[theme] || 196, nextAt, STEP * seq.length, .035); pad2((BASS[theme] || 196) * 1.5, nextAt, STEP * seq.length, .02); bar++; }
          if (n) pluck(n[0], nextAt, 0.14 * (n[1] > 1 ? 1.15 : 1));
          nextAt += n ? STEP * n[1] : STEP * (seq[(step - 1 + seq.length) % seq.length][1] || 1) * 0 + STEP;
          step++;
        }
      }, 160);
    },
    toggleMute() {
      muted = !muted;
      localStorage.setItem('db_muted', muted ? '1' : '0');
      if (master) master.gain.value = muted ? 0 : 0.5;
      if (this._bgmAudio) this._bgmAudio.volume = muted ? 0 : 0.32;
      if (muted) this.ambient(false);
      return muted;
    },
    isMuted() { return muted; }
  };
})();
