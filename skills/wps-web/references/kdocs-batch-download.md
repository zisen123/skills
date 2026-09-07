# 批量下载金山在线表格为 xlsx（OpenAPI.export 法）

整表下载成真 xlsx 再本地解析，零识图误差、不用逆向二进制。2026-08 实测 9 个表全通，
`/l/` 短链与 `/office/k/` 链接均适用（页面都是 kdocs 多维表格实例，有 `window.APP`）。

## 核心发现

`window.APP.OpenAPI.export("xlsx")` 是**服务端导出**：POST `/api/v3/office/file/<fileId>/export/xlsx/preload`
→ 轮询 result → Promise resolve 出 **ks3 临时下载 URL**（带 Expires/Signature，约 1 小时有效）。
该 URL 无需登录态，**服务器直接 `curl -sL` 即得真 xlsx**（`file` 验证为 Microsoft Excel 2007+）。
比 kdocs-read.md 三法都干净：不截图、不啃私有二进制、不依赖办公电脑下载目录回传。

## 单表流程

```bash
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
export OPENCLI_BROWSER_COMMAND_TIMEOUT=90
opencli browser <sess> open '<kdocs链接>'
# 轮询就绪（最多 60s）：
opencli browser <sess> eval '(()=>!!(window.APP&&window.APP.getWorksheets))()'   # true 才继续
# fire-and-poll 触发导出（不 await，防 cdp_timeout，见 opencli-canvas-gotchas.md）：
opencli browser <sess> eval '(()=>{window.__exp="pending";const p=window.APP.OpenAPI.export("xlsx");const t=new Promise((_,rej)=>setTimeout(()=>rej("timeout90s"),90000));Promise.race([p,t]).then(u=>{window.__exp="url:"+u}).catch(e=>{window.__exp="err:"+e});return "fired"})()'
# 每 5s 轮询 window.__exp 直到 url: 开头（一般 5-10s 出）
curl -sL -o '<本地名>.xlsx' "${__exp#url:}"
```

## 批量注意

- 同一 session 顺序处理即可（open 新链接会切页）；并行才需要多 session 名。
- 每个表 open 后先轮询 `window.APP` 就绪再 export，否则页面还在加载。
- 导出 URL 的 `response-content-disposition` 里带原文件名（UTF-8 编码），本地命名可参考。
- 下完 `opencli browser <sess> close` 释放标签租约。

## 常用表格链接（2026-08-27 用户给定，月度工作汇总数据源）

| 项目 | 链接 |
|---|---|
| 有道Y18 | https://www.kdocs.cn/l/csTqhVG1MU9V?R=L1MvNA== |
| 有道Y15 | https://www.kdocs.cn/l/ctGHFbVN8om0?R=L1MvNA== |
| 硬十 | https://www.kdocs.cn/l/ciDhxCMWBeWP?R=L1MvNA== |
| 竞业达 | https://www.kdocs.cn/l/co6kwPuTwjZU?R=L1MvNQ== |
| 芯宿 | https://www.kdocs.cn/l/caQg9BmEWfFx?R=L1MvNA== |
| 卓豪DC100 | https://www.kdocs.cn/office/k/478530367809?R=L0MvNC9x |
| 卓豪DC309 | https://www.kdocs.cn/office/k/401854894115?R=L0MvNy9DTA== |
| 安之眼 | https://www.kdocs.cn/l/cb2rwArC6j3N?R=L1MvNA== |
| aifae | https://www.kdocs.cn/l/cevGl48wZx5a?R=L1MvNw== |
| 卓豪bf01 | https://www.kdocs.cn/l/caDdmpuGpURH?R=L1MvNA== |

部门月度汇总表（填写目标，ET 表，读写见 [[weboffice-et-write.md]]）：
https://docs.sophgo.com/weboffice/l/sFf928Y8fm6p3
周报文档（ET 表，读写同见 [[weboffice-et-write.md]]）：
https://docs.sophgo.com/weboffice/l/s9wfDs3UmsRK8

Appia IM（cn.appia.im，考勤签到等办公自动化目标站，见 checkin skill）：
https://sophgo.appia.cn/home
