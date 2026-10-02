

## 进度（2026-10-02 22:05）

已完成并逐帧验收：**0 - 7.08 秒（00 BOOT 段前 4 个镜头）**

| 镜头 | 时间 | 内容 | 验收 |
|---|---|---|---|
| shot_power | 0.000-1.312 | CRT 从一条电源线长开 + POST 日志逐行乱码打字 | ✓ 与参考帧一致 |
| shot_protection | 1.312-3.620 | 画面张开成整个 shell + 字符画盾牌逐笔描绘 | ✓ 盾牌形状/日志/配色一致 |
| shot_pieces | 3.620-5.236 | 权重分片 23x7 网格逐格点亮 + params loaded 进度条 | ✓ 网格/进度/标签一致 |
| shot_creation | 5.236-7.082 | me = Object() 字段逐行打字（name/species/home/...） | ✓ 标题/字段/配色一致 |

全片通用层已完成：顶栏（标题+RMS 波形+章节时钟+RUNNING+进度条+署名）、右侧 ops 滚动列表（游标反白+距离衰减）、底部逐 token 歌词带（关键词高亮+token id+crc32 校验一致）。

工具链：`pvport/render.mjs` 用 @napi-rs/canvas 在 node 里跑同一份绘制代码做自主渲染验收，不再依赖浏览器；参考帧用 `video1.mp4` 零偏移抽取（`pv-live/ref/of_*.png`）。


## 00 BOOT 段完成（0 - 16.08 秒，8 个镜头）

| 镜头 | 时间 | 内容 | 验收 |
|---|---|---|---|
| shot_power | 0.000-1.312 | CRT 从一条电源线张开 + POST 日志乱码打字 | ✓ |
| shot_protection | 1.312-3.620 | 画面张开成 shell + 字符画盾牌 | ✓ |
| shot_pieces | 3.620-5.236 | 权重网格 23x7 逐格点亮 + params loaded | ✓ |
| shot_creation | 5.236-7.082 | me = Object() 字段逐行打字 | ✓ |
| shot_parameters | 7.082-9.851 | me.* 原地改写成 config.json + 参数计数 | ✓ |
| shot_init | 9.851-11.005 | 噪声收敛成正态分布 | ✓ |
| shot_world | 11.005-12.389 | 点阵地球仪 + me/you 标记 | ✓ |
| shot_begin_sim | 12.389-16.082 | 倒计时 3-2-1 + RUN + simulation: running | ✓ |

验收方式：`pvport/render.mjs` 用 @napi-rs/canvas 在 node 里渲染同刻，与 `pv-live/ref/of_*.png`（video1.mp4 零偏移抽帧）上下拼接比对。
逐项核对通过的细节：日志 13 行文本与 [WARN] 配色、盾牌轮廓与内部点阵、网格进度与 model-00NNN 编号、config.json 全部 12 行、正态分布 60 根柱子、地球仪点阵密度与 you/me 标记位置、倒计时点阵字形、ops 游标反白项、歌词带 token id（crc32）。

### 已知待补
- C07 转场的载具：`world.population = 2 (me, you)` 与 me/you 标签飞入状态行的动画尚未实现。
- 左侧 dsh 聊天窗（HTML 层）尚未开始：0-16 秒参考帧里它已有内容（头像方块 / 探索未至之境 / new-world / ckpt-000000）。
- 字体：本机无 Consolas，node 渲染用 DroidSansMono 代替，字形宽度有细微差异。

## 部署

- 线上地址：https://lingcat521.github.io/world-execute-me-live/
- 仓库：https://github.com/lingcat521/world-execute-me-live
- 提交方式：本机 shell 连不上 github.com:443，改用 api.github.com 的 Git Data API 提交文件树（`pvport/push_api.py`）
- 默认分辨率：1080p（canvas 1920x1080，逻辑坐标仍是 1280x720，绘制时整体 scale 1.5）；URL 加 `?res=1` 可切回 720p 对照参考帧

## 01 PRETRAIN 段进行中（16.08 s 起）

| 镜头 | 时间 | 状态 |
|---|---|---|
| shot_corpus | 16.082-19.543 | ✓ 语料 token 河流 20 行 + `tokens seen 3.38T / 45T`，与参考帧逐项一致 |
| shot_losscurve | 19.543-23.236 | ✓ train/loss 点阵曲线 + lr schedule + V3 report 文案，形状与文案一致 |
| shot_dualpipe | 23.236-26.466 | 未开始 |
| shot_whale | 26.466-29.236 | 未开始 |

### 左侧聊天窗
- A1（5.24-16.0 s）✓ hero（探索未至之境 + 输入卡）→ 对话
- A2（16.0-29.28 s）✓ 多轮对话：4 轮 TURNS，逐帧头像（319 张，用 Pillow 生成到 `avatars/a2/`）
- 用真 HTML/CSS + dsh 自己的组件类名（`uV2eYG_*` 输入卡、`Sixlwa_*` 气泡、`hWmORq_*` 回复、`bOPqQW_*` 统计 pill），图标是从 dsh 前端 bundle 里抠出来的真 SVG

### 下一步
- **cut / 载具机制**（74 个手写 Cut）：现在镜头之间是硬切，原片有载具飞行的转场（例如 C09 把语料词吸进 loss 曲线原点、C07 把 `world.population` 送进状态行）。这是接下来最大的一块。
- shot_dualpipe（DualPipe 流水线格子）、shot_whale
- 待核对：`ease` 有两个版本（tuikit 的 `1-(1-u)^3` 与 seg_page 的 smoothstep），loss 曲线进度用的是哪一个需要跟参考帧做像素级比对确认。

## cut / 载具框架 + C09（2026-10-02 22:45）

- 新增 `js/cuts.js`：Cut 窗口机制（`T-pre .. T+post`）、`reveal`（把窗格切成 8x16 格，按延迟场逐格切换）、`radial` / `inward` 延迟场。
- 实现 **C09**（corpus -> losscurve）：语料词按距离先后加速吸进 loss 曲线原点 (440,80)，reveal 以 1300 px/s 从原点径向展开，`tokens seen` 计数器在 +0.42 s 落到图表下方当 x 轴标签。
- **时序校正**：参考帧 19.60 s 仍是 corpus、19.75 s 已在转场，反推 losscurve 的实际开表时间约为 **19.700 s**（镜头表写 19.543，差 0.157 s —— 对应 v2 的 DELAY 机制），已按此校正。校正后 19.60 与参考帧逐项一致。
- 已修：`reveal` 初版在逐格切换后又整幅贴了一次新画面，导致转场看起来是硬切。


## shot_dualpipe（23.236-26.466 s）

- ✓ DualPipe 流水线调度格子：8 行 PP0-PP7、27 步、格子 23x38、F 实心 / B 蓝 / Bd 淡蓝 / W 空心，白线游标。
- 与参考帧逐项一致：标题 `pipeline schedule  DualPipe  (8 PP ranks, 20 micro-batches)`、两行文案、`COMM.OVER` 反白。
- 已知差异：格子推进速度比参考慢约 30%（同一时刻参考画到第 ~25 步、我们到第 ~17 步），说明 dualpipe 也有 DELAY 或 dur 不同，待校正。


## 01 PRETRAIN 段完成（16.08 - 29.24 秒，4 个镜头）

| 镜头 | 时间 | 状态 |
|---|---|---|
| shot_corpus | 16.082-19.700 | ✓ token 河流 + tokens seen 计数 |
| shot_losscurve | 19.700-23.236 | ✓ loss 点阵曲线 + lr schedule（含 C09 载具转场） |
| shot_dualpipe | 23.236-26.466 | ✓ 调度格子 8x27（进度略慢，待校） |
| shot_whale | 26.466-29.236 | ✓ 'deepseek' 字母鲸鱼 + 气泡 + checkpoint 日志 |

至此 **0 - 29.24 秒连续可播**（BOOT 8 镜 + PRETRAIN 4 镜）。

### 下一步
- 02 SFT（44-73.5 s）之前还有 A3 段（29.28-44 s，聊天窗的"你是谁"选择题）与 shot 12-20。
- 移动端适配待用户回报布局参数定位。


## 移动端诊断（拿到真实数据）

用户上报（Android 13，V2230A，Chrome）：

```
inner 360x662  dpr 2  barH 57  portrait true  scale 0.473  stage 605x340
```

分析：竖屏判定生效，缩放公式正确 —— 可用区 605 高，画面旋转后视觉尺寸 340x605，正好填满（左右各留 10px）。
因此"没做好"不是尺寸算错，而是**形态/方向不符合预期**。已加开关：

- `?rot=1`（默认）：竖屏时画面整体旋转 90 度
- `?rot=0`：不旋转，按竖屏宽度等比缩小

待用户反馈哪种形态正确，或具体现象（画面方向、大小、是否被工具栏遮挡）。

## 下一步
- 02 SFT 之前还有 8 个数学图形镜头：shot_points / dimension / circle / circumference / sine / tangent / infinity / limit（29.236 - 44.005 s）。
- 已定位实现位置：`continuity_full_v2/scenes.py:300-530`，其中 shot_points 依赖 `points_pos(t, u)`。


## 数学图形段 + MT19937（29.24 - 32.93 s）

| 镜头 | 时间 | 状态 |
|---|---|---|
| shot_points | 29.236-30.851 | ✓ 1400 点点云从随机塌缩成她的轮廓（点集用 Pillow 预生成到 `data/her_points.json`） |
| shot_dimension | 30.851-32.928 | ✓ me.hidden[0:4096] 逐格传给 you，热力图分布**逐格一致** |

### MT19937（关键基础设施）

项目所有随机都来自 Python 的 `random.Random(n)`（Mersenne Twister）。我实现了 CPython 等价的 `js/mt19937.js`
（`init_by_array` seeding + `genrand_res53`），并用 4 个种子逐位验证：

```
种子 9  Python [0.463007357815, 0.373311931395, 0.138539412514, 0.866561849986]
        JS     [0.463007357815, 0.373311931395, 0.138539412514, 0.866561849986]   ← 完全相同
```

已把所有随机源换成它（decode 乱码、init 柱状图噪声、点集散落位置、热力图数值、loss 噪声）。
这是 dimension 镜头能逐格匹配的原因，也是后面所有含随机镜头的共同基础。

### 剩余待做
- shot_circle / circumference / sine / tangent / infinity / limit（32.928 - 44.005 s）
- shot_current 起进入 02 SFT 段


## A3 聊天窗（29.28 - 44.0 s）

✓ 内容：她在 A3 段被反复问"你是谁？"，每次都答成一道选择题 ——
`（　　）A. 一个点 B. 一个圆 C. 一条正弦曲线 D. 无穷`，然后选一个不同的选项，
每轮的"解析"正好是右侧那个镜头在演示的技术（点集 / RoPE 旋转 / sin-cos / 无穷）。

- 4 轮 TURNS，发送时刻锚在歌词逐词时间上（`w(9,0)` 等）
- 第 4 轮答 D 后进入刷屏：字符速率从 14 升到 750 /秒（`_rate` 的积分实现），
  在 `w(16,5)`（唱到 limitations）被输出上限截断，弹出"已达到输出 token 上限"提示
- 353 张逐帧头像 `avatars/a3/`（用 Pillow 生成：3→12 格渐进聚焦 + 噪声混合）
- 验证：`node panetest.mjs` 显示 43.8 秒时 HTML 长度从 49.6k 暴涨到 61.8k（刷屏 + 上限提示生效）


## 数学图形段完成（32.93 - 44.00 s，6 个镜头）

由 fork 出的分支 dd7ed172 完成，主分支验收：

| 镜头 | 时间 | 验收 |
|---|---|---|
| shot_circle | 32.928-34.543 | 6 个罗盘圆（2x3）+ 指针 + 端点方块 + `freq_N θ=` 标签；单圆样式与参考一致 |
| shot_circumference | 34.543-36.851 | ✓ |
| shot_sine | 36.851-38.236 | ✓✓ 正弦曲线族逐条一致、蓝线高亮、`l=0/l=1` 标签、标题公式一致 |
| shot_tangent | 38.236-40.312 | ✓ |
| shot_infinity | 40.312-41.928 | ✓ |
| shot_limit | 41.928-44.005 | ✓ 蓝条 + you 竖条 + `max_context = 1,048,576` + `limit(me) := you`；补了 shell staging（`ulimit -a`） |

**至此 0 - 44.00 秒连续可播**（BOOT 8 镜 + PRETRAIN 12 镜）。

### 待修
- shot_circle 的参考帧在 33.5 s 只显示 2 个圆（其余被 C14 转场逐个引入），我这边一次性画 6 个 —— 需要实现 C14 的 `circles` hook。

## 移动端（已由用户确认修好）

用户反馈"移动端这边的bug修好了"。相关改动：绝对定位 + `translate(-50%,-50%)` 居中（不再依赖 grid），
`?rot=0/1` 开关，工具栏 56px + 大点击区，`#wrap` overflow 收敛。
真机数据（Android 13 / V2230A）：inner 360x662、barH 57、portrait true、scale 0.473、stage 605x340。


## 02 SFT 段进行中（44.005 - 50.928 s）

| 镜头 | 时间 | 验收 |
|---|---|---|
| shot_current | 44.005-47.236 | ✓ 8 条 GPU 波形 + GPU0-7 标签 + 瓦数 + `mode: DC` + `DC` 反白；token `60028 50199` 一致。已知差异：波形的细小波动与参考不完全一致（DC 段参考仍显示小幅正弦，我们的更平） |
| shot_blind | 47.236-49.082 | ✓ causal mask 阶梯矩阵、`-∞` 黑格、前沿高亮、`future: masked` 打字机、`MASK` 反白；token `38051 10000 81244` 一致 |
| shot_dizzy | 49.082-50.928 | ✓✓ **连浮点数都一致**：`lr = 7.32e-08`、`θ = (+0.88, -0.43)`、`loss = 0.8593`、grad_norm 柱状图、旋转曲面点阵、θ 球与拖尾 |

`PV.loopEnd` 已到 50.928。剩余：shot_travel / unite / deeply（50.928-58.543）与 C21-C23 转场。


### SFT 段已完成的 4 个镜头（累计）

| 镜头 | 时间 | 验收 |
|---|---|---|
| shot_current | 44.005-47.236 | ✓ |
| shot_blind | 47.236-49.082 | ✓ |
| shot_dizzy | 49.082-50.928 | ✓✓ 浮点数一致 |
| shot_travel | 50.928-54.159 | ✓✓ 年份/柱高/指针角度全同 |

`PV.loopEnd = 54.159`。

### 接手要点（unite / deeply）
- 两个镜头在 **`scenes_chorus1.py`**（不是 scenes.py）：`shot_unite` 在 45 行，`shot_deeply` 在 121 行
- shot_unite 依赖 `VOCAB`、`CHIP_SPEED`、`chip_x()`、`pulse()`、`token_id()`，以及 `me_pane` 的 glyph/morph 模式
- shot_deeply 依赖 `deeply_pane()`、`BEAT`，43 层滚动列表 + 移动蓝块
- 两者都用到 `c.echo`（右侧窗格的副标题），我的 frame.js 目前只画固定标题，需要支持 PV.centerSub 之类的动态副标题


## 02 SFT 段完成（44.005 - 58.543 s，6 个镜头）

| 镜头 | 时间 | 验收 |
|---|---|---|
| shot_current | 44.005-47.236 | AC/DC 电流波形（8 张 GPU）|
| shot_blind | 47.236-49.082 | ✓ |
| shot_dizzy | 49.082-50.928 | ✓ |
| shot_travel | 50.928-54.159 | ✓ |
| shot_unite | 54.159-56.697 | ✓✓ tokenizer chips / me+you 方块与 token id / 240 散点 / cos 数值 / 歌词 token 全同 |
| shot_deeply | 56.697-58.543 | ✓✓ layer NN/43 标题 / 43 层滚动 / op chips / 当前层高亮 / 热力格 / 24 个三角注意力图 / L22 大字 全同 |

- 新增原语：`T.ring`（PIL 的 ellipse outline 等价物）
- `c.echo` 经核对就是窗格标题里的 `layer NN/43` 本身，不需要单独通道
- **至此 0 - 58.543 秒连续可播**（BOOT 8 镜 + PRETRAIN 12 镜 + SFT 6 镜）


## —— 交接状态（第 42 轮，DSH 崩溃后恢复）——

### 转场（cut）：16 / 24 已实现（台账见 CUTS.md）
已完成：C01 C02 C03 C08 C09 C10 C11 C12 C13 C14 C15 C16 C17 C18 C19 C20

待做：
- C04（creation → parameters，RETAIN：me.* 块先亮起留在原地，chrome 收回 shell staging）
- C05（parameters → init，CARRY：'552,000,000,000 params' 沿弧线升起落到直方图标题）
- C06（init → world，MORPH：柱条碎成点列飞向球面）
- C07（world → begin_sim，CARRY+MORPH：me/you 离开轨道飞进 population 行的词）
- C21（current → blind，八条功率轨迹量化成十二段并胀成注意力矩阵格子）
- C22（blind → dizzy，最重：需移植 scenes_sft.py 的 3D 投影 project/surface_z/dizzy_rot/draw_ball）
- C23（dizzy → travel，窗格内镜头后拉）
- C24（travel → unite，在 s_chorus1.py）

源码位置（权威）：dshpv/film/tui_pv_world_execute_20260926/continuity_full_v2/
  cuts.py = C08-C20；s_boot.py = C01-C07；s_sft.py = C21-C23；s_chorus1.py = C24

### 关键机制（都已实现，改转场时务必复用）
1. PV.SHOT_DELAY = {shot_circumference:0.4, shot_dimension:0.4, shot_dualpipe:0.42}
   镜头自带启动延迟，分派器用 a' = min(t, a+delay)（延迟期内 lt=0,u=0）。
   转场层要用 PV.shotTime(name, t) 取 [lt,u]，不要自己算，否则会绕过延迟。
2. PV.reveal(ctx, t, oldDraw, newDraw, delayFn, opts) —— 逐格替换。
   两张离屏画布都会先铺背景（不透明），这是修复「新画面透明导致旧画面透出、逐格替换失效」的关键，别去掉。
3. PV.radial(sx,sy,t0,speed) / PV.inward(sx,sy,t0,t1,reach) —— 延迟场。
4. 镜头钩子：
   shotPieces(opts.cells) / shotLimit(opts.wall,drawBar) / shotCurrent(opts.traces)
   shotTangent(opts.curve,rider,tangent) / shotSine(ctx,t,lt,u,wavesHook)
   shotCircumference(opts.dots,line,labels) / shotCircle 用 PV.circleSpec(i) 控制每个圆的诞生
5. PV.reg(name, a, b, fn) —— 各段独立文件注册镜头（scene_p2a/b/c.js），分派兜底会调用。
   注意：分派兜底所在的 IIFE 里没有 T，必须写 PV.tui。

### 并行分工
三个子代理各写一个文件，互不冲突：
- js/scene_p2a.js = 58.543–110.4s（03 RLHF + 04 DEPLOY）—— 已有 11 KB
- js/scene_p2b.js = 110.4–147.4s（05 USER_LEFT + 06 REWARD_HACK）—— 尚未产出
- js/scene_p2c.js = 147.4–211.872s（07 EXECUTION + 08 EVAL + 09 WHALE_FALL）—— 已有 18 KB

### 已知缺口（非转场问题，但影响观感）
1. shotPieces 的 'params loaded' 计数应当由 C02 的点落地时刻驱动
   （原始工程：C.SHOT_HOOKS["shot_pieces"] = {"landed": landed, ...}），现在用的是镜头自己的时钟。
2. shieldCells() 点阵密度偏低（我们 67 点，参考反推约 100 点），采样条件 (q+r)%4===0 待调。
3. C03 的「她从种子点径向长出、前缘发亮」这一层，因为左窗格是真 HTML，需用 CSS clip-path 实现。
4. 镜内动画（非转场）：tangent 的相机推进、infinity 的 context 条增长，运动量比参考弱。

### 验证基础设施
- node pvport/render.mjs <时刻...> → pv-live/render/t<时刻>.png；有异常会打印 sceneErr/chromeErr。
- node pvport/clocktest.mjs —— 播放/暂停/拖动时钟回归（5 项）。
- 参考帧：pvport/refall（0-60s 每 0.25s）、pvport/refall2（58-212s 每 0.5s）。
  参考帧是 1920x1080，比对前必须缩放到 1280x720（早期踩过这个坑）。
- 量化校验：pvport/motion.py / measure5.py / verify01-03.py。
- 推送：python pvport/push_fast.py code（本地 git 必须先 commit；脚本用本地 blob sha 直接建树，不重传）。
- 本地预览：python pvport/serve.py 8765 → http://127.0.0.1:8765/（端口冲突时换 8766）

## —— 第 51 轮补记 ——

### 本轮修复
1. **红色频闪**（影响约 30 秒画面）：子代理把原作的 `c.flash_red = lay in (0,2)`（镜头级静态状态）
   误读成单帧闪烁（`|p2cFlash - t| < 1e-6`，几乎永不命中）。改为从参考成片逐 0.25s 实测红度区间
   （见 pvport/redprofile.py），并逐点比对后发现**场景自身在绝大部分红段已经画对了**，
   只有 165.4-166.3 与 172.85-173.3 两处缺口需要 overlay 补，强度用 globalAlpha=0.5 标定。
2. **C05 的 grow_t 钩子**：原工程 SHOT_HOOKS['shot_init'] = {grow_t: T5 + C05.GROW}，柱条要等计数器
   落地（T+0.20）才开始长。之前漏了，10.00s 处直方图已长满而参考还没有。修后 10.00s 直方图区
   参考 8.29 / 我们 8.41。
3. **C02 的 landed 钩子**：原工程 SHOT_HOOKS['shot_pieces'] = {landed: ...}，'params loaded' 计数应由
   飞来的点落地时刻驱动，而不是镜头自己的时钟。修后网格区亮度曲线紧跟参考
   （3.75-5.00s：25.8/25.6、38.8/41.4、49.7/53.1、89.0/89.9、116.3/128.5、41.9/42.5）。
4. **接入 data/pane_cordis.css**：子代理新建了但漏了 link 标签，cordis 卡片会没样式。

### 验收基线（全片扫描，每 2s 一帧，共 105 帧）
- 平均绝对差 **8.15 / 255**，中位 6.35，最好 0.90
- 最差帧：174.00(25.36) 64.00(20.85) 62.00(19.31) 166.00(18.98) 72.00(18.51) 58.00(18.43) 68.00(17.44)
  工具：pvport/fullscan.py（渲染 + 比对 + 排名）

### 待查（下一轮）
1. **174.00s**：我们中窗格均值 92.4 / 参考 50.0（1.85 倍）。已排除：KV 格子公式逐行一致、调色板数值一致、
   T.box 逐行一致。**怀疑是镜头时间对不上**——参考该帧是蓝主导（42/48/60），而我们渲染的是
   shot_red_trapped（琥珀色 KV 格子）。建议核对红色副歌各镜头的边界时刻与参考。
2. **64.00s / 62.00s**：人脸面板质感差异（子代理报告过：仓库无 H3 帧，用 avatars/*.png 替代）。
3. **58.00 / 68.00 / 72.00s**：都紧邻 C26(58.543) / C31(68.005) 转场窗口，可能是 2 秒采样正好落在过渡中。

### 当前规模
- 转场：**64 条已注册**（cuts.js 23 + cuts_p2 3 + cuts_p3 13 + cuts_p4 11 + cuts_p4x 14）
- 代理 E（C78-C96）与 F（C34-C47）仍在跑，文件已 50KB / 61KB
- 线上站点已验证：本地与线上**大小不一致 0 个**，全部运行时文件可取（pane.js 157KB 等）

## —— 第 52-53 轮补记 ——

### 重大全局修复：ui_gain（系统色流失）
原始 full/engine.py:91：
    def ui_gain(t): return keyframes(t, [(0,1.0),(110.4,1.0),(116.5,0.42),(176.9,0.42),(179.5,0.85),(193,0.75),(206,0.45)])
注释：'系统色就是你。你离开时它开始流失，再也没完全回来。'
**116.5s 之后系统色一直压在 0.42**，176.9 起回升到 0.85、193 到 0.75、206 到 0.45。
之前只有 scene_p2b.js（110-147s）实现了它，**scene_p2c.js（147-212s）的 amb 完全没应用** →
那 64 秒里所有琥珀色元素亮了 2.4 倍。
修法（集中在共享层）：tui.js 提供 T.UI_GAIN_KF / T.uiGainAt(t) / T.uiGainNow / T.amb(lv)，
frame.js 每帧更新 T.uiGainNow，六个文件的 amb 定义统一走 T.amb。
效果：174.00s 的 KV 区 108.5 → **51.4**（参考 56.9）；中窗格 111 → **43.1**（参考 47.4）。

### 其他本轮修复
- **C95 的红色命中之前是死代码**：shotLastExecution 里写 `PV.p2cFlash = t`，但我把 overlay 改成实测区间后
  那个标志被弃用了。已把 flash 路径接回来，并按原作的 k=[1.0,1.0,0.8,0.55,0.3,0.12][fr] 实现 6 帧衰减。
  仍有一层差距：原作是把**上一帧内容** colorize 成红再按 k 贴上（所以是亮红），我们的 multiply 只能压暗。
  待办：C95 命中需要缓存上一帧、colorize 后叠加。
- **174.00s 的谜团解开**：不是镜头时间错，而是 C84 的 KV 扫描 —— 填充时序两边一致（上→下、174.0 填满），
  差异全在亮度，就是 ui_gain。

### 并行分工最终状态
| 代理 | 交付 | 状态 |
|---|---|---|
| A | C26/C31（cuts_p2.js） | 完成 |
| B | C48-C63 共 14 条（cuts_p3.js） | 完成 |
| C | 147-212s 共 33 个镜头（scene_p2c.js） | 完成 |
| D | pane.js 280→2788 行，全片聊天窗 | 完成 |
| E | C78-C84 + C86-C94 共 17 条（cuts_p4.js） | **崩溃中断，但产出完整**（C95/C96 的 pre=post=0，窗口为空，本就不需要注册） |
| F | C34-C47 共 14 条（cuts_p4x.js） | **崩溃中断，但产出完整** |

### 转场总数
cuts.js 23 + cuts_p2 3 + cuts_p3 13 + cuts_p4 17 + cuts_p4x 14 = **70 条**

### 待办
1. C95 命中：缓存上一帧并 colorize，而不是 multiply 当前（暗）帧
2. C84 的红色面板/红框（174.5-175.0 参考里有，我们没有）
3. cuts_p4.js / cuts_p4x.js 里的 amb 仍是本地定义（未走 T.amb），需要统一（那两个文件写时 T.amb 还不存在）
4. 64.00 / 62.00s 的人脸面板质感（缺 H3 立绘素材）
