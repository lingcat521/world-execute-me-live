

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
