# OpenAI 账号授权工作台 · 界面设计规范（v2）

更新：2026-11-28。当前实现以本文件、`src/client/style.css` 与 `tailwind.config.ts` 为准。

## 1. 设计方向：Precision Obsidian & Alabaster

面向管理员的 OpenAI 凭据安全与 Sub2API 协同运维工作台，采用双生精密控制台美学：
- **浅色模式（Alabaster Daylight）**：柔和灰白画布 `#F4F6F8`、纯净卡片 `#FFFFFF` 与细腻半透明微边框。
- **深色模式（Obsidian Midnight）**：深邃炭黑画布 `#090B0E`、阶梯深色表面 `#11141A / #171C24` 与顶部微高光边。
- **系统主题自适应**：默认跟随操作系统 `prefers-color-scheme`，`index.html` 内联首帧防闪烁脚本，并提供「系统 / 浅色 / 深色」三态切换器（`ThemeToggle.vue` + `useTheme.ts`）。

## 2. 语义色彩令牌

| 令牌 | 浅色值 | 深色值 | 用途 |
| --- | --- | --- | --- |
| `--bg-canvas` | `#F4F6F8` | `#090B0E` | 全局画布背景 |
| `--bg-surface` | `#FFFFFF` | `#11141A` | 卡片、侧边栏、表格容器 |
| `--bg-elevated` | `#FFFFFF` | `#171C24` | 弹窗、抽屉、悬浮操作条 |
| `--bg-subtle` | `#EEF1F5` | `#1C222D` | 表头、分段底槽、悬停态 |
| `--text-primary` | `#0F172A` | `#F1F5F9` | 主标题、核心指标、账号邮箱 |
| `--text-secondary` | `#475569` | `#94A3B8` | 次要文案、标签 |
| `--text-muted` | `#64748B` | `#64748B` | 辅助说明、时间戳 |
| `--accent` | `#0D9488` | `#2DD4BF` | 主操作按钮、激活态、焦点光晕 |
| `--status-ok` | `#059669` | `#34D399` | 健康、已授权、已同步 |
| `--status-warn` | `#B45309` | `#FBBF24` | 限流、异常、已暂停调度 |
| `--status-danger` | `#DC2626` | `#F87171` | 凭据失效、失败、危险操作 |
| `--status-info` | `#2563EB` | `#60A5FA` | 进行中任务（配合微脉冲呼吸灯） |

## 3. 布局与核心交互规范

- **应用壳层（`AppShell.vue`）**：桌面端采用可折叠左侧导航栏（`244px` / `72px`）+ 流式画布（最大宽度 `1480px`）；移动端切换为毛玻璃顶栏 + 底部固定双标签栏。
- **账号工作台（`AccountsView.vue`）**：
  - **Bento 用量仪表盘（`UsageBento.vue`）**：5 小时 / 7 天动态阈值进度条 + 预计剩余可用时间状态卡。
  - **账号列表**：快捷状态胶囊筛选、可清空搜索框、精简高可读桌面表格与移动端分层卡片；勾选账号后底部浮现悬浮批量操作条。
  - **2FA 六步进度**：行内仅展示紧凑步进胶囊，点击滑出右侧详情抽屉（`SlideDrawer.vue`）以垂直时间轴完整展示步骤与失败原因。
  - **弹窗交互**：统一自定义确认弹窗（`ConfirmDialog.vue`）替代原生 `confirm()`；凭据弹窗（`AccountCredentialsModal.vue`）提供默认脱敏遮罩、显隐切换与一键复制反馈；全局操作反馈采用右上角悬浮 Toast（`ToastHost.vue`）。
- **系统设置（`SettingsView.vue`）**：粘性毛玻璃操作栏（含未保存状态徽标）+ 左侧目录锚点 + 右侧分组卡片与三段式代理策略控制器。
- **无障碍与动效**：统一 `180ms cubic-bezier(0.22, 1, 0.36, 1)`，完整支持 `prefers-reduced-motion`、焦点管理与 `Esc` 关闭弹窗/抽屉。
