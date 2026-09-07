---
name: wps-web
description: 通过 opencli 桥接的登录态 Chrome 读写金山文档/WPS 网页版（尤其多维表格 ksheet）。覆盖读取表格内容（截图识图、抓 open/ksheet 内部接口、SDK 直读）、新建子表、写单元格、删除子表，以及 opencli 操作 canvas 类网页的通用坑。当用户提到 金山文档、kdocs、kdocs.cn、WPS 网页版、多维表格、ksheet、在线表格读取/写入、opencli 操作网页表格、canvas 表格取数、window.APP.OpenAPI、setCellValue、新建/删除子表、open/ksheet 抓包、远程 AI 操作本地 Chrome 读写金山文档 时使用。仅手动 /调用，不自动触发。

metadata:
  short_name: wps-web
---

# wps-web：opencli 读写金山文档/WPS 网页版

在远程服务器上，通过 opencli 桥接到办公电脑登录态 Chrome，读写金山在线文档（重点是多维表格 / ksheet）。
本 skill 只沉淀非显然的坑与可靠做法；opencli 桥接的部署（`ssh -L 19825` 反向/正向隧道、
daemon 只绑 127.0.0.1、`opencli doctor` 验证）属于 opencli 通用知识，此处不复述。

## 一句话最大坑

**建子表只能"opencli 原生 click 走 UI"（内部 API `add()` 会永远 pending），`insertRecord()` 插新记录同样挂起
（走底层 `position.insert(1)`），`setCellValue` 批量连写会静默丢写（一格一验）；读表内容因为是 canvas 渲染，
`extract`/innerText 取不到，得截图或调 `window.APP.OpenAPI`。**

## 何时用哪篇

| 需求 | 看 |
|---|---|
| 读金山表格内容（截图/抓接口/SDK 三法取舍、canvas 限制、network 抓包坑） | `references/kdocs-read.md` |
| 用 `window.APP.OpenAPI` 增删改：新建子表、插入新记录（insertRecord 挂起的底层替代）、写单元格（逐格一验）、读表结构/单选选项、删表、数据安全自查；含**记录 id↔行号定位、看板任务更新（标记完成/填进展/填日期）** | `references/kdocs-sdk-write.md` |
| 整表下载为 xlsx（`OpenAPI.export` 拿 ks3 临时 URL 直接 curl，含常用表格链接） | `references/kdocs-batch-download.md` |
| docs.sophgo.com WebOffice ET 表读写（APP.OpenAPI 为 undefined 的另一套 API、queryRangeValues/setValue2、【doing】标记） | `references/weboffice-et-write.md` |
| opencli 操作 canvas SPA 的通用坑（click≠el.click、eval 不能 await、session 生命周期、本机 nvm 前缀） | `references/opencli-canvas-gotchas.md` |

## 每次操作前

1. source nvm（否则 `opencli: command not found`）：
   `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh" >/dev/null 2>&1`
2. 探活：`opencli doctor` 全绿 + eval 确认 `window.APP` 就绪（页面可能变 about:blank 或标签被回收）。
3. 改真实协作文档：每步用 `OpenAPI.canUndo()`（false=没误改）核查，误触单元格立刻 `keys Escape`。
4. **open 一律加 `--window background`**（默认 foreground 会抢用户桌面焦点，用户明确抱怨过），详见 opencli-canvas-gotchas.md。
