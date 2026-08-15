/*
 * ごく簡単な効果音(WebAudio で音を合成しているので音声ファイルは不要)
 * 音が出せない環境でもゲームが止まらないよう、すべて try/catch で守っています。
 */
(function (global) {
  'use strict';

  var ctx = null;
  var enabled = true;
  var lastAt = 0;

  function ensure() {
    if (!enabled) return null;
    try {
      if (!ctx) {
        var AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) { enabled = false; return null; }
        ctx = new AC();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (err) {
      enabled = false;
      return null;
    }
  }

  function tone(freq, dur, type, gain, slideTo) {
    var ac = ensure();
    if (!ac) return;
    try {
      var now = ac.currentTime;
      /* 音が重なりすぎて割れないように間引く */
      if (now - lastAt < 0.012) return;
      lastAt = now;
      var osc = ac.createOscillator();
      var g = ac.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + dur);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(gain || 0.06, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(g); g.connect(ac.destination);
      osc.start(now); osc.stop(now + dur + 0.02);
    } catch (err) { /* 音が出なくてもゲームは続行 */ }
  }

  var Sfx = {
    unlock: function () { ensure(); },
    setEnabled: function (v) { enabled = v; if (v) ensure(); },
    isEnabled: function () { return enabled; },
    shoot: function () { tone(760, 0.05, 'square', 0.025); },
    cannon: function () { tone(160, 0.14, 'sawtooth', 0.05, 60); },
    ice: function () { tone(1200, 0.12, 'sine', 0.035, 1800); },
    snipe: function () { tone(300, 0.16, 'sawtooth', 0.05, 1400); },
    kill: function () { tone(420, 0.08, 'triangle', 0.045, 220); },
    build: function () { tone(520, 0.09, 'triangle', 0.07, 880); },
    upgrade: function () { tone(660, 0.16, 'triangle', 0.08, 1320); },
    sell: function () { tone(600, 0.12, 'triangle', 0.06, 300); },
    error: function () { tone(200, 0.12, 'square', 0.05, 140); },
    leak: function () { tone(180, 0.28, 'sawtooth', 0.08, 90); },
    boss: function () { tone(90, 0.7, 'sawtooth', 0.1, 55); },
    win: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        setTimeout(function () { tone(f, 0.28, 'triangle', 0.08); }, i * 130);
      });
    },
    lose: function () {
      [400, 320, 240, 150].forEach(function (f, i) {
        setTimeout(function () { tone(f, 0.34, 'sawtooth', 0.08); }, i * 170);
      });
    }
  };

  global.LFD = global.LFD || {};
  global.LFD.Sfx = Sfx;
})(typeof window !== 'undefined' ? window : globalThis);
