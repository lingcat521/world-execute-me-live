

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

