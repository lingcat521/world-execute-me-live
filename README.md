# world.execute(me); · live

把 [MisakaZentai/world-execute-me-dsh-pv](https://github.com/MisakaZentai/world-execute-me-dsh-pv) 从
Python + PIL + Playwright 的逐帧渲染管线，移植成**浏览器里实时运行**的版本。

原项目每帧都是歌曲时间 t 的纯函数；这个移植把同一套绘制逻辑搬进 Canvas 2D 与真 HTML/CSS，
由音频时间轴驱动，不再需要预渲染任何一帧。

## 怎么用

打开页面，用底部的按钮选你**自己合法获得**的歌曲文件（MP3/FLAC）。
歌曲不随本仓库分发。时间轴以歌曲第一个采样为零点，不需要偏移。

## 进度

| 段落 | 时间 | 状态 |
|---|---|---|
| 00 BOOT | 0 - 16.08 s | 已完成（8 个镜头，逐帧比对过） |
| 01 PRETRAIN 起 | 16.08 s - | 未开始 |

已完成的部分包含：顶栏（标题 / RMS 波形 / 章节时钟 / 进度条 / 署名）、右侧 ops 滚动列表、
底部逐 token 歌词带（关键词高亮 + token id）、以及左侧 dsh 聊天窗（真 HTML/CSS，用 dsh 自己的组件类名）。

## 署名与许可

- **原项目**：[MisakaZentai/world-execute-me-dsh-pv](https://github.com/MisakaZentai/world-execute-me-dsh-pv)，代码 MIT
- **音乐**：Mili - world.execute(me);（词曲与录音版权归 ProjectMili 及原权利人所有，本仓库不含音频）
- **角色与美术**：溟月 © 上善无形 / 女仆版 ZipZipPipe / 立绘·表情 dsh-deep-whale, dsh-whale-galgame（CC BY-NC-SA 4.0）
- **界面**：致敬 DeepSeek Harness（dsh）前端（MIT, Copyright (c) 2026 DeepSeek）
- **字体**：Space Mono（SIL OFL 1.1）、Anton（SIL OFL 1.1）

这是非官方同人作品，与 DeepSeek、Mili 没有从属或合作关系。
