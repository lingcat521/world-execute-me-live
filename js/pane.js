/* pane.js —— 左侧 dsh 聊天窗（真 HTML/CSS）。对应 batch_a1.py 的 body(t)：5.24 s 起从她的种子里长出来。 */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var FPS = 24, PANE_T0 = 5.236;
  var SIXTEENTH = 60 / 130 / 4;
  function beat(k) { return 0.1807 + k * 4 * SIXTEENTH; }
  var CREATE = 5.24, PARAMS = 7.19, INIT = 9.75, WORLD = 10.90, BEGIN = 12.47, SEND = beat(32);
  var KEYS = [[beat(28) + SIXTEENTH, '你'], [beat(28) + 3 * SIXTEENTH, '你好']];
  var MODEL = 'DeepSeek-V4.1-Flash';
  var GARBLED = 'æ¨¡åž‹';
  var PRETRAIN_END = 44.41, SFT_END = 59.06, NAN = 71.59, RESTORE = 73.54, RELEASE = 88.54, SWAP = 0.6;
  var PREVIEW = 'deepseek-v4.1-flash-expires-on-0910';
  var SOUP = ['Ġthe', 'çļĦ', 'ĊĊ', '}]', '拟', '_{', 'Ġ3', 'ãĢĤ', 'ĠĠĠ', 'irr', 'ëĭ', 'Ġ.', '\n', 'æĪĳ', 'Ġof', 'ðŁ',
              'Ġ(', 'ĸ', 'ecause', 'Ġ您', '].', 'ĉ', 'Ġ"', 'Ã©', 'Ġwh', 'ĳ', 'ĠĊ', '0', 'Ġ*', 'ãģ', 'ç', 'Ġto'];
  var ICONS = {}, app = null, chatEl = null, lastBody = null;
  fetch('data/icons.json').then(function (r) { return r.json(); }).then(function (d) { ICONS = d; }).catch(function () {});
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }
  function svg(name, size) {
    var s = ICONS[name] || '';
    if (size && s) s = s.replace('width="16" height="16"', 'width="' + size + '" height="' + size + '"');
    return s;
  }
  function smooth(u) { u = T.clamp01(u); return u * u * (3 - 2 * u); }
  function avatar(t) {
    if (t < PARAMS) return 'avatars/a1_seed.png';
    if (t < INIT) return 'avatars/a1_params' + pad(Math.min(12, Math.floor(13 * (t - PARAMS) / (INIT - 0.15 - PARAMS))), 2) + '.png';
    return 'avatars/a1_noise' + pad(Math.floor(t * FPS) % 24, 2) + '.png';
  }
  function typedAt(t) { var txt = ''; for (var i = 0; i < KEYS.length; i++) if (t >= KEYS[i][0]) txt = KEYS[i][1]; return txt; }
  function modelName(t) {
    if (t < INIT) return GARBLED;
    if (t < PRETRAIN_END) { var x = T.clamp01((t - BEGIN) / (PRETRAIN_END - BEGIN)); return 'ckpt-' + pad(Math.round(213000 * Math.pow(x, 1.3)), 6); }
    if (t < SFT_END) return 'sft-step-' + pad(Math.round(1200 * (t - PRETRAIN_END) / (SFT_END - PRETRAIN_END)), 4);
    if (t < NAN) return 'rl-step-' + pad(Math.round(640 * (t - SFT_END) / (NAN - SFT_END)), 4);
    if (t < RESTORE) return 'rl-step-NaN';
    if (t < RELEASE) return PREVIEW;
    return MODEL;
  }
  function modelLabel(t) {
    if (t < PARAMS) return '<span style="color:var(--dsw-alias-label-tertiary)">选择模型</span>';
    var name = modelName(t);
    if (t < INIT) name = name.slice(0, Math.floor((t - PARAMS) * 12));
    else if (t >= RELEASE && t < RELEASE + SWAP) {
      var half = SWAP / 2;
      if (t < RELEASE + half) name = PREVIEW.slice(0, Math.round(PREVIEW.length * (1 - (t - RELEASE) / half)));
      else name = MODEL.slice(0, Math.round(MODEL.length * (t - RELEASE - half) / half));
    }
    var tail = t >= RELEASE + SWAP ? '&nbsp;<span style="color:var(--dsw-alias-label-tertiary)">Max</span>' : '';
    return '<span style="white-space:nowrap">' + esc(name) + '</span>' + tail;
  }
  function workspace(t) {
    var name = t >= WORLD ? 'new-world' : '选择工作区';
    var col = t >= WORLD ? 'var(--dsw-alias-label-secondary)' : 'var(--dsw-alias-label-tertiary)';
    return '<span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:' + col + '">' + svg('IconFolderClose16', 16) + esc(name) + '</span>';
  }
  function composerCard(text, focused, t, o) {
    o = o || {};
    var ph = o.placeholder || '发消息或创建任务，/ 调用指令，@ 文件或对话';
    var caretOn = o.typing || Math.floor(t / 0.53) % 2 === 0;
    var caret = focused ? '<span style="display:inline-block;width:1.5px;height:1.1em;vertical-align:-0.15em;margin-left:1px;background:var(--dsw-alias-label-primary);opacity:' + (caretOn ? 1 : 0) + '"></span>' : '';
    if (text || focused) ph = '';
    var spin = '';
    if (o.running) {
      var ang = Math.round(t * 360 * 1.2) % 360;
      spin = '<svg width="18" height="18" viewBox="0 0 18 18" style="transform:rotate(' + ang + 'deg)"><circle cx="9" cy="9" r="7" stroke="var(--dsw-alias-label-tertiary)" stroke-width="1.6" fill="none" stroke-dasharray="30 14" stroke-linecap="round"/></svg>';
    }
    return '<div class="uV2eYG_root" id="composer"><div class="uV2eYG_card">' +
      '<div class="uV2eYG_scroll"><div class="uV2eYG_grow">' +
      '<div class="uV2eYG_input">' + esc(text) + caret + '</div>' +
      (ph ? '<div class="uV2eYG_placeholder">' + esc(ph) + '</div>' : '') +
      '</div></div><div class="uV2eYG_row">' +
      '<div class="uV2eYG_modes" style="display:flex;align-items:center">' +
      '<button type="button" class="uV2eYG_add">' + svg('IconPlusOutline16', 16) + '</button>' +
      '<button type="button" class="uV2eYG_add">' + svg('IconPaperclipOutline16', 16) + '</button></div>' +
      '<div class="uV2eYG_trailing"><span class="uV2eYG_select" style="background-image:none;display:inline-flex;align-items:center;padding:0">' + (o.model || '') + '</span>' +
      spin + '<button type="button" class="uV2eYG_primary">' + svg('IconSendOutline14', 14) + '</button>' +
      '</div></div></div></div>';
  }
  function userRow(text) {
    return '<div class="Sixlwa_userRow"><div class="Sixlwa_userStack"><div class="Sixlwa_bubble">' + esc(text) + '</div></div></div>';
  }
  function herRow(text) {
    return '<div class="hWmORq_root"><div class="hWmORq_body"><p style="margin:0">' + esc(text).replace(/\n/g, '<br>') + '</p></div></div>';
  }
  function statsRow(turns, steps, tps, tokens, cache) {
    function pill(icon, a, b) {
      return '<span class="bOPqQW_anchor"><span class="bOPqQW_pill">' + svg(icon, 16) +
        '<span class="bOPqQW_label">' + a + (b ? '<span class="bOPqQW_sep" aria-hidden="true">·</span>' + b : '') + '</span></span></span>';
    }
    return '<div class="bOPqQW_root" data-composer-stats="true">' +
      pill('IconGaugeOutline16', turns + ' 轮 ' + steps + ' 步', tps ? tps + ' tok/s' : '') +
      pill('IconDatabaseOutline16', tokens + ' tok', '缓存命中 ' + cache + '%') + '</div>';
  }
  function hero(t) {
    var text = t >= BEGIN ? typedAt(t) : '';
    var card = composerCard(text, t >= BEGIN, t, { placeholder: '描述你想要构建的内容，/ 调用指令，@ 文件或对话', typing: !!text, model: modelLabel(t) });
    return '<div style="height:100%;display:flex;flex-direction:column;align-items:center;padding-top:' + (177 - 36) + 'px;box-sizing:border-box">' +
      '<div class="pv-pet" style="width:72px;height:72px"><img src="' + avatar(t) + '"></div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-top:16px">' +
      '<span style="font-size:20px;line-height:28px;font-weight:600;color:var(--dsw-alias-label-primary)">探索未至之境</span>' +
      '<span style="font-size:11px;line-height:16px;padding:1px 6px;border-radius:6px;background:#1f2b52;color:#9fb3ff">预览版</span></div>' +
      '<div style="margin-top:22px;align-self:stretch;padding:0 12px 4px">' + workspace(t) + '</div>' +
      '<div style="align-self:stretch">' + card + '</div></div>';
  }
  function chat(t) {
    var rngN = Math.floor(Math.max(0, t - (SEND + 0.15)) * 14), i, soup = '';
    for (i = 0; i < rngN; i++) soup += SOUP[i % SOUP.length];
    if (!soup) soup = '\u200b';
    var head = '<div class="pv-head"><div class="pv-pet"><img src="' + avatar(t) + '"></div>' +
      '<div class="pv-who"><div class="pv-name">大肥鱼</div><div class="pv-state"><span class="pv-dot" style="background:#3fb950"></span>运行中 · ' + esc(modelName(t)) + '</div></div></div>';
    var appear = smooth((t - SEND) / 0.12);
    var rows = '<div style="opacity:' + appear.toFixed(3) + '">' + userRow('你好') + '</div>' + herRow(soup);
    return head + '<div id="timeline">' + rows + '</div>' +
      composerCard('', false, t, { placeholder: '发消息或创建任务，/ 调用指令，@ 文件或对话', model: modelLabel(t), running: true }) +
      statsRow(1, 1, null, String(Math.max(1, rngN)), 0);
  }

  /* ---- batch_a2（16.0 - 29.28 s，01 PRETRAIN）：一轮轮对话长出来 ---- */
  var A2_T0 = 16.0, A2_T1 = 29.28, TYPE_AHEAD = 0.55;
  var FREQ = '的 的 。the the , of 是 了 and 的 ， 我 the 。 。 在 a 的';
  var FRAG = '你好 你好 hello , the world 是 一个 的 时候 我们 is a 。 你 们 好 the day';
  var BASETXT = '你好，我是一名大三学生，今天想和大家分享一下我的考研经验。首先，要选对学校和专业……';
  var TURNS = [
    [SEND, 'soup', SEND + 0.15, 14, 17.30, '00:12'],
    [beat(39), FREQ, beat(39) + 0.20, 22, beat(39) + 1.35, '03:47'],
    [beat(47), FRAG, beat(47) + 0.20, 20, beat(47) + 2.30, '09:30'],
    [beat(55), BASETXT, beat(55) + 0.20, 17, beat(55) + 2.95, '21:05']];
  function soupOf(n) { var s = '', i; for (i = 0; i < n; i++) s += SOUP[i % SOUP.length]; return s; }
  function replyText(i, t) {
    var Tn = TURNS[i], txt = Tn[1], start = Tn[2], rate = Tn[3], end = Tn[4];
    if (t < start) return '';
    var n = Math.floor((Math.min(t, end) - start) * rate);
    if (txt === 'soup') return t < end ? soupOf(n) : soupOf(Math.floor((end - start) * rate));
    return t < end ? txt.slice(0, n) : txt;
  }
  function tailRow(duration, clock) {
    function icon(n) { return '<button type="button" class="xzv4MW_action">' + svg(n, 16) + '</button>'; }
    return '<div class="TS9iAW_root" data-actions-reveal="always"><div class="xzv4MW_actions TS9iAW_actions">' +
      icon('IconCopyOutline16') + icon('IconLikeOutline16') + icon('IconDislikeOutline16') + icon('IconBranchOutline16') +
      '<span class="Q51KRG_root"><button type="button" class="Q51KRG_trigger">' + svg('IconClockOutline16', 16) +
      '<span class="Q51KRG_label">用时 ' + esc(duration) + '</span></button></span>' +
      '<span class="xzv4MW_timeEnd">' + esc(clock) + '</span></div></div>';
  }
  function a2Header(t) {
    return '<div class="pv-head"><div class="pv-pet"><img src="avatars/a2/' + pad(Math.round(t * FPS), 5) + '.png"></div>' +
      '<div class="pv-who"><div class="pv-name">大肥鱼</div><div class="pv-state"><span class="pv-dot" style="background:#d29922"></span>预训练中 · ' +
      esc(modelName(t)) + '</div></div></div>';
  }
  function a2Body(t) {
    var rows = [], turnsDone = 0, typing = '', i, j;
    for (i = 0; i < TURNS.length; i++) {
      var Tn = TURNS[i], send = Tn[0], end = Tn[4], clock = Tn[5];
      if (i && t >= send - TYPE_AHEAD && t < send) typing = '你好'.slice(0, 1 + (((t - (send - TYPE_AHEAD)) / (TYPE_AHEAD / 2)) > 1 ? 1 : 0));
      if (t < send) continue;
      rows.push('<div style="opacity:' + smooth((t - send) / 0.12).toFixed(3) + '">' + userRow('你好') + '</div>');
      rows.push(herRow(replyText(i, t) || '\u200b'));
      if (t >= end + 0.1) { rows.push(tailRow((end - send).toFixed(1) + '秒', clock)); turnsDone++; }
    }
    var running = false;
    for (j = 0; j < TURNS.length; j++) if (t >= TURNS[j][0] && t < TURNS[j][4] + 0.1) running = true;
    var cache = [0, 33, 50, 61, 66][Math.min(4, turnsDone)];
    var tokens = 12 + 60 * turnsDone, nTurns = 0;
    for (j = 0; j < TURNS.length; j++) if (t >= TURNS[j][0]) nTurns++;
    return a2Header(t) + '<div id="timeline">' + rows.join('') + '</div>' +
      composerCard(typing, !!typing, t, { model: modelLabel(t), running: running, typing: !!typing }) +
      statsRow(nTurns, nTurns, null, String(tokens), cache);
  }


  /* ---- batch_a3（29.28 - 44.0 s）：她不知道自己是什么，把"你是谁"答成选择题 ---- */
  var A3_T0 = 29.28, A3_T1 = 44.0, ASK = '你是谁？';
  var QUIZ = '（　　）\nA. 一个点　B. 一个圆\nC. 一条正弦曲线　D. 无穷\n答案：A';
  var CAN = ['回答问题','写诗','写代码','陪你聊天','翻译','做数学题','写作文','讲故事','查资料','总结文章','写邮件','做计划','起名字','画表格','解释概念','改简历','写歌','背单词','算账','下棋','讲笑话','写菜谱','写周报','写论文','写剧本','做 PPT','写小说','改 bug','写测试','读论文','做翻译','写影评','出考题','改作文'];
  var RAMBLE = '答案：D。我是一个语言模型，' + CAN.map(function (c) { return '我可以' + c + '，'; }).join('') + new Array(801).join('我可以');
  function w(i, j) { var L = PV.LINES && PV.LINES[i]; return (L && L.words[j]) ? L.words[j].onset : 0; }
  function a3turns() {
    var lim = w(16, 5) || 43.56, inf = w(15, 2) || 41.90;
    return [lim, inf, [
      [w(9, 0), QUIZ, w(9, 0) + 0.18, (QUIZ.length - 1) / Math.max(0.1, w(9, 5) - w(9, 0) - 0.18), null, '22:40'],
      [w(11, 0), '答案：B\n解析：位置是一个旋转角度。', w(11, 3) - 3 / 13, 13, null, '23:02'],
      [w(13, 0), '答案：C\n解析：每个位置是一组 sin 和 cos。', w(13, 3) - 3 / 13, 13, null, '23:15'],
      [w(14, 7), RAMBLE, w(14, 7) + 0.15, null, lim, '23:31']]];
  }
  function a3Rate(t, inf) { return 14 + (750 - 14) * smooth((t - inf) / 0.3); }
  function rambleChars(t, start, inf, lim) {
    t = Math.min(t, lim);
    var k = Math.round(Math.max(0, t - start) * 240), sum = 0;
    for (var j = 0; j < k; j++) sum += a3Rate(start + (j + 0.5) / 240, inf);
    return Math.floor(sum / 240);
  }
  function a3Reply(i, t, T3, inf, lim) {
    var Tn = T3[i], text = Tn[1], start = Tn[2], rate = Tn[3];
    if (t < start) return '';
    var n = rate === null ? rambleChars(t, start, inf, lim) : Math.floor((t - start) * rate);
    return text.slice(0, n);
  }
  function maxTokensNotice(p) {
    return '<div class="Sixlwa_turnErrorRow" role="status" style="opacity:' + p.toFixed(3) + '">' +
      '<span class="Sixlwa_turnErrorDot" style="width:10px;height:10px;border-radius:50%;background:currentColor"></span>' +
      '<div class="Sixlwa_turnErrorCopy"><span class="Sixlwa_maxTokensTitle">已达到输出 token 上限</span>' +
      '<span class="Sixlwa_turnErrorMessage">回答被截断，已有输出保留在对话中。发送“继续”可让模型接着输出。</span></div></div>';
  }
  function a3Header(t) {
    return '<div class="pv-head"><div class="pv-pet"><img src="avatars/a3/' + pad(Math.round(t * FPS), 5) + '.png"></div>' +
      '<div class="pv-who"><div class="pv-name">大肥鱼</div><div class="pv-state"><span class="pv-dot" style="background:#d29922"></span>预训练中 · ' +
      esc(modelName(t)) + '</div></div></div>';
  }
  function a3Body(t) {
    var r = a3turns(), lim = r[0], inf = r[1], T3 = r[2];
    var rows = [], typing = '', i, j;
    rows.push(userRow('你好'));
    rows.push(herRow('你好，我是一名大三学生，今天想和大家分享一下我的考研经验。首先，要选对学校和专业……'));
    rows.push(tailRow('21.1秒', '21:05'));
    for (i = 0; i < T3.length; i++) {
      var Tn = T3[i], send = Tn[0], end = Tn[4];
      if (t >= send - 0.5 && t < send) typing = ASK.slice(0, 1 + Math.min(3, Math.floor((t - (send - 0.5)) / 0.17)));
      if (t < send) continue;
      rows.push('<div style="opacity:' + smooth((t - send) / 0.12).toFixed(3) + '">' + userRow(ASK) + '</div>');
      rows.push(herRow(a3Reply(i, t, T3, inf, lim) || '\u200b'));
      if (end !== null && t >= end + 0.1) rows.push(tailRow((end - send).toFixed(1) + '秒', Tn[5]));
      else if (end === null && t > send + 2.2) rows.push(tailRow((t - send).toFixed(1) + '秒', Tn[5]));
    }
    if (t >= lim) rows.push(maxTokensNotice(smooth((t - lim) / 0.2)));
    var running = false;
    for (j = 0; j < T3.length; j++) if (t >= T3[j][0] && (T3[j][4] === null || t < T3[j][4] + 0.1)) running = true;
    var nTurns = 1;
    for (j = 0; j < T3.length; j++) if (t >= T3[j][0]) nTurns++;
    var tokens = 252 + 60 * 3 + (t >= lim ? Math.round(rambleChars(lim, T3[3][2], inf, lim) / 1.5) : 0);
    return a3Header(t) + '<div id="timeline">' + rows.join('') + '</div>' +
      composerCard(typing, !!typing, t, { model: modelLabel(t), running: running, typing: !!typing }) +
      statsRow(nTurns, nTurns, null, String(tokens), 66);
  }

  PV.paneBody = function (t) { if (t < CREATE) return ''; if (t < SEND) return hero(t); if (t < A2_T0) return chat(t); if (t < A3_T0) return a2Body(t); return a3Body(t); };
  PV.paneVisible = function (t) { return t >= PANE_T0; };
  PV.sync = function (t) {
    if (!chatEl) chatEl = document.getElementById('chat');
    if (!app) app = document.getElementById('app');
    if (!chatEl || !app) return;
    var vis = PV.paneVisible(t);
    chatEl.style.display = vis ? 'block' : 'none';
    if (!vis) return;
    var boxel = document.getElementById('chatbox');
    if (boxel) boxel.style.transform = 'translate(27px,65px)';
    var b = PV.paneBody(t);
    if (b !== lastBody) { app.innerHTML = b; lastBody = b; }
  };
})();
