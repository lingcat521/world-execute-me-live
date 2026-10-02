# 转场（cut）实现台账

来源：原始工程 continuity_full_v2 的 cuts.py / s_boot.py / s_sft.py / s_chorus1.py。
Cut.T = 进入镜头的起点；窗口 = [T-pre, T+post]。我们已实现的镜头范围是 0 - 58.543 s，对应 C01-C24（全片约 90 个 cut）。

| Cut | T (s) | 状态 | 原始说明（截断） |
|---|---|---|---|
| C01 | 1.312 | 已实现 | power -> protection. UNFOLD：CRT 画面抬起、张开成整个 shell，锁在拍点上；POST 日志随之 |
| C02 | 3.620 | 已实现 | protection -> pieces. MORPH：盾牌亮起，点逐个离开（顶行先），落进权重网格的下一格 |
| C03 | 5.236 | 已实现（画布部分；她的 HTML 窗格揭示待补） | pieces -> creation. MORPH：已加载的 161 格向网格中心排空，远处的先走，各自缩成点并变色 |
| C04 | 7.082 | 已实现 | creation -> parameters. RETAIN：me.* 块先亮起并留在原地；chrome 收回 shell staging |
| C05 | 9.851 | 已实现 | parameters -> init. CARRY：'552,000,000,000 params' 亮起、沿弧线升起，落在直方图标题上 |
| C06 | 11.005 | 已实现 | init -> world. MORPH：定型的柱条亮起并碎成点列，每点飞向球面的一点 |
| C07 | 12.389 | 待做 | world -> begin_sim. CARRY+MORPH：me 与 you 离开轨道，各自飞进 population 行的词里 |
| C08 | 16.082 | 已实现 | begin_sim -> corpus. RUN 亮起后碎成词块飞进 token 河；预算行飞下去变成计数器 |
| C09 | 19.700 | 已实现 | corpus -> losscurve. 语料词加速吸进 loss 曲线原点，曲线从那里开始画 |
| C10 | 23.236 | 已实现 | losscurve -> dualpipe. 端点长大、沿曲线往回把它吃掉，到原点后跳进 pipeline 第一格 |
| C11 | 26.466 | 已实现 | dualpipe -> whale. 格子逐排升起成字母游向鲸鱼；最后一批落位时鲸鱼成形 |
| C12 | 29.236 | 已实现 | whale -> points. 每个字母原地缩成点，点再散开成点集 |
| C13 | 30.851 | 已实现 | points -> dimension. 聚成她形状的点抬起、沿弧线飞进左窗格，落在她自己的格子上 |
| C14 | 32.928 | 已实现 | dimension -> circle. 收到的向量按列折成窄条，变成第一个旋转对的指针，圆随之画出 |
| C15 | 34.543 | 已实现 | circle -> circumference. 其余五对缩回第一个，第一个移动并长大成待展开的圆 |
| C16 | 36.851 | 已实现 | circumference -> sine. 展开的蓝线抬到通道 2 并开始波动；其他通道逐条剥离 |
| C17 | 38.236 | 已实现 | sine -> tangent. 通道 2 振幅与周期长大成大正弦；其他通道滑走 |
| C18 | 40.312 | 已实现 | tangent -> infinity. 只有可视化窗格平移：镜头越过骑手继续向 +x 前进 |
| C19 | 41.928 | 已实现 | infinity -> limit. 一堵墙正好落在拍点上砸在增长中的 context 条上；越界部分碎裂 |
| C20 | 44.005 | 已实现 | limit -> current. 抵墙的条裂成八条线（每 GPU 一条），展开到各自行并开始交替 |
| C21 | 47.236 | 待做 | current -> blind. 八条功率轨迹亮起、量化成每条十二段（矩阵列上采样保持）并胀成格子 |
| C22 | 49.082 | 待做 | blind -> dizzy. 只有窗格内容旋转：遮罩矩阵躺下、在 'So dizzy' 上旋转并弯成碗 |
| C23 | 50.928 | 待做 | dizzy -> travel. 镜头只在窗格内后拉：旋转的碗向左离开，年份条（已在 2026 AD）进来 |
| C24 | 54.159 | 待做 | travel -> unite（进入 unite 镜头） |

已完成 19 / 24（C01-C06 + C08-C20）
