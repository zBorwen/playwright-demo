# Dashboard 重构 — 分阶段实施计划

> 决策记录：2026/05/11
> 方案：分 4 个阶段，小步快走

## 已确认的决策

- Dashboard 3 个 KPI 卡片（今日执行、通过率、失败数）
- 录制创建用侧滑面板
- 侧边栏显示活跃项目（最多 5 个）+ "查看全部"链接
- 时间线方案 A（进度条 + 步骤列表），暂不加截图
- 图表库：Recharts
- 图标库：lucide-react
- Server 层暂不改动，Dashboard 数据前端聚合

---

## 阶段 1：基础视觉系统升级

**目标**：统一视觉语言，为后续重构打底。不改变布局结构。

### 任务清单

| # | 任务 | 涉及文件 | 说明 |
|---|------|----------|------|
| 1.1 | 安装依赖 | `package.json` | `lucide-react` |
| 1.2 | 色彩系统 | `index.css`, `tailwind.config.ts` | 语义色、品牌色 violet |
| 1.3 | 状态徽章组件 | `components/status-badge.tsx` | CheckCircle/XCircle/Loader2 替代 emoji |
| 1.4 | 按钮层级组件 | `components/ui-button.tsx` | Primary(violet)/Secondary/Ghost/Danger |
| 1.5 | 替换 ReplayPanel emoji | `components/replay-panel.tsx` | 用 status-badge 替代 ✓✗○ |
| 1.6 | 替换列表 emoji | `components/recordings-list.tsx`, `components/project-list.tsx` | 状态指示器用组件 |
| 1.7 | 骨架屏组件 | `components/skeleton.tsx` | 灰色块动画替代文字加载 |
| 1.8 | 列表加载骨架 | `components/recordings-list.tsx`, `components/project-list.tsx` | loading 时显示骨架 |

### 完成标准
- 所有页面不再出现 emoji 状态指示
- 加载时显示骨架而非 "加载中..." 文字
- 按钮样式统一

### 预计文件数：新增 3 个，修改 4 个

---

## 阶段 2：侧边栏布局 + Dashboard

**目标**：引入全新的页面布局结构和首页 Dashboard。

### 任务清单

| # | 任务 | 涉及文件 | 说明 |
|---|------|----------|------|
| 2.1 | 面包屑组件 | `components/breadcrumb.tsx` | 路径上下文导航 |
| 2.2 | 侧边栏组件 | `components/sidebar-nav.tsx` | 导航 + 活跃项目列表 |
| 2.3 | App 布局组件 | `components/app-layout.tsx` | Sidebar + Header + Content 结构 |
| 2.4 | 重写 App.tsx | `App.tsx` | 改用侧边栏布局，替换顶部导航 |
| 2.5 | 更新所有页面 | 所有现有页面组件 | 面包屑替代旧导航链接 |
| 2.6 | Dashboard 页面 | `components/dashboard.tsx` | 3 个 KPI + 失败列表 + 趋势图 |
| 2.7 | Dashboard 数据聚合 | `lib/api.ts` + Dashboard 组件 | 拉全量 executions + recordings，前端计算 KPI |
| 2.8 | 安装 Recharts | `package.json` | `pnpm add recharts` |
| 2.9 | 趋势图组件 | `components/trend-chart.tsx` | 7 天通过率折线（Recharts） |

### 完成标准
- 首页显示 Dashboard 而非项目列表
- 左侧有导航栏，主内容区独立滚动
- 3 个 KPI 卡片数据正确
- 失败列表按时间倒序，点击跳转到录制详情
- 趋势图显示 7 天数据

### 预计文件数：新增 5 个，修改 7 个

---

## 阶段 3：录制创建侧滑面板 + 快捷操作

**目标**：改善录制创建流程，Dashboard 快捷操作可用。

### 任务清单

| # | 任务 | 涉及文件 | 说明 |
|---|------|----------|------|
| 3.1 | 侧滑面板容器 | `components/slide-over.tsx` | 通用侧滑动画容器 |
| 3.2 | 新建录制面板 | `components/new-recording-slide-over.tsx` | 选项目 → 输入 URL → 启动 |
| 3.3 | Dashboard 快捷操作 | `components/dashboard.tsx` | 新建录制 + 批量重跑 + 导出报告按钮 |
| 3.4 | Dashboard 失败列表点击 | `components/dashboard.tsx` | 点击跳转到对应录制详情 |
| 3.5 | 项目列表快捷入口 | `components/project-list.tsx` | 支持从侧边栏 "查看全部" 进入 |
| 3.6 | 优化 RecordingForm | `components/recording-form.tsx` | 适配侧滑面板场景 |

### 完成标准
- Dashboard "新建录制" 按钮触发侧滑面板
- 面板内完成项目选择 + URL 输入 + 启动
- 启动后自动跳转到录制详情页
- 批量重跑和导出报告按钮存在（功能后续完善可留 TODO）

### 预计文件数：新增 2 个，修改 3 个

---

## 阶段 4：时间线重构（无截图版）

**目标**：录制详情页时间线从列表升级为视频播放器隐喻。

### 任务清单

| # | 任务 | 涉及文件 | 说明 |
|---|------|----------|------|
| 4.1 | 进度条组件 | `components/timeline-progress.tsx` | 进度条 + 步骤标记 + 播放控制 |
| 4.2 | 紧凑步骤列表 | `components/timeline-step-list.tsx` | 行高 32px 紧凑列表，悬浮联动进度条 |
| 4.3 | 重写 ReplayPanel | `components/replay-panel.tsx` | 拆分为进度条 + 列表两个子组件 |
| 4.4 | 失败自动滚动 | `components/timeline-step-list.tsx` | 执行完成后自动滚动到第一个失败步骤 |
| 4.5 | 录制详情页概览 Tab | `components/recording-detail.tsx` | 新增概览 Tab，展示基本信息 + 最近执行状态 + 快捷操作 |
| 4.6 | recording-detail 拆分 | `components/recording-detail.tsx` | 487 行拆成 3-4 个 < 150 行子组件 |

### 完成标准
- 时间线顶部有进度条，显示已完成的步骤比例
- 进度条上有颜色标记：绿色=已完成、红色=失败、灰色=未执行
- 步骤列表紧凑排列，行悬浮时进度条对应位置高亮
- 失败步骤自动滚动到视口
- recording-detail.tsx 拆分后每个子组件 < 150 行

### 预计文件数：新增 2 个，修改 2 个

---

## 阶段依赖关系

```
阶段 1（视觉系统）
    ↓
阶段 2（侧边栏 + Dashboard）
    ↓
阶段 3（侧滑面板 + 快捷操作）
    ↓
阶段 4（时间线重构）
```

阶段 1 和阶段 2 可以较快完成。阶段 3 依赖阶段 2 的 Dashboard。阶段 4 相对独立，但建议在阶段 2 之后做，因为需要理解新布局。

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| Recharts 体积增加 | 290KB 对 MVP 可接受，后续可 code-split |
| 前端聚合大量数据性能差 | 内部工具数据量小，后续加服务端聚合 |
| recording-detail 拆分可能引入回归 | 拆分不改逻辑，只做组件提取 |
| 侧滑面板与现有 RecordingForm 不兼容 | 阶段 3.6 专门适配 |
