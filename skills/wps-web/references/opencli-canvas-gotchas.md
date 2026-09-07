# opencli 操作 canvas 类网页的通用坑

（不限金山，任何 canvas 渲染 + 有内部 JS SDK 的 SPA 都适用。前置：opencli 桥接办公电脑登录态 Chrome 已跑通，
`opencli doctor` 全绿。远程连接方式见 SKILL.md 顶部链路说明。）

## 点击：opencli click ≠ JS el.click()

- **`opencli browser <sess> click '<css>'` 发的是真实 CDP 鼠标事件**，能触发框架的指针事件监听（弹菜单、拖拽等）。
- **页面里 `element.click()`（经 eval）触发不了**很多前端框架的指针逻辑——菜单不弹、按钮无反应，还可能把焦点残留在旁边元素上（危险）。
- 结论：**要"像人一样点"就用 opencli click**；eval 里的 `.click()` 只对朴素 DOM 按钮有效。

click 定位语法（target 是位置参数，`--css` 选项不存在）：
```bash
opencli browser <sess> click '.some-class'         # 直接传 CSS
opencli browser <sess> click --text '数据表'        # 按可见文本
opencli browser <sess> click --role button --name '保存'
opencli browser <sess> find --css '<sel>'          # 定位元素；find 用 --css，click 用位置参数（不一致，注意）
```

## open 默认抢桌面焦点，后台打开加 `--window background`

`browser <sess> open <url>` 默认 foreground——**会把用户正在用的桌面焦点抢到 Chrome 窗口**
（办公电脑上人正在干活时很烦）。后台打开：
```bash
opencli browser <sess> open '<url>' --window background
```
实测 background 打开后 eval/screenshot 等一切照常（页面照常加载，`window.APP` 正常就绪）。
**每次 open 都应默认带 `--window background`**，除非确实要看前台效果。
注意：`--window` 是 `browser` 级选项（放 session 名后、open 前），open 子命令自己的 help 里不显示它。

## screenshot：path 是位置参数

```bash
opencli browser <sess> screenshot /tmp/x.png        # ✅
opencli browser <sess> screenshot --path /tmp/x.png # ❌ unknown option '--path'
opencli browser <sess> screenshot /tmp/x.png --full-page   # 全页滚动截图
```

## eval：同步上下文

- 不能顶层 `await`（SyntaxError）。异步用 `(async()=>{...})()` 返回 Promise，opencli 会等它。
- 绝不 await 可能永不 resolve 的 Promise，会吃满 CDP ~115s 超时报 `cdp_timeout`。改用 fire-and-poll。
  （细节与例子见 `kdocs-sdk-write.md`。）

## session / 标签生命周期

- **同 URL `open` 不重新加载**（认为已打开）；要冷加载换新 session 名。
- session 标签可能被回收/变成 `about:blank`（本次 kd3 中途就变空了）。操作前先探
  `location.href` 或 `!!window.APP`，不对就重新 `open` 并轮询就绪。
- owned session 有空闲租约（约 10 分钟）与 `detached_mid_command` 风险；长流程操作前先探活。
- 用不同 session 名隔离并行任务，互不抢占。

## 读运行时对象：方法在原型链上

SPA 的 API 对象（如 `APP.OpenAPI`）方法多在原型上，`Object.keys(o)` 看不到。要遍历原型链：
```js
function methods(o){const s=new Set();let p=o;while(p&&p!==Object.prototype){for(const k of Object.getOwnPropertyNames(p)){try{if(typeof o[k]==="function")s.add(k)}catch(e){}}p=Object.getPrototypeOf(p)}return[...s]}
```
读某方法实现看它到底干嘛（判断参数/是否弹框/是否异步）：`o.someMethod.toString().slice(0,200)`。

## 环境：本机跑 opencli 的固定前缀

本机 node 装在 nvm 下，每个 opencli 命令前要先 source nvm，否则 `opencli: command not found`：
```bash
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
export OPENCLI_BROWSER_COMMAND_TIMEOUT=60   # 复杂/异步命令把超时拉大
```

## 多 profile 连接时 doctor 报 FAIL

办公电脑有多个 Chrome profile 同时连 daemon 时，`opencli doctor` 会
`[FAIL] Connectivity: failed (Multiple Browser Bridge profiles are connected)`——这不是桥接坏了。
注意 **`opencli --profile <name>` 命令行参数在部分子命令上不生效**（doctor 仍报同样的错），
可靠做法是**环境变量**（写进上面前缀一起 export）
```bash
export OPENCLI_PROFILE=cts2tdc8     # 或 opencli profile use <name> 设默认
opencli doctor                       # 全绿
```
profile 名看 `opencli profile list`（显示 connected 的那些）。

**profile 会中途掉线**（2026-09 实测 cts2tdc8 操作中途断开，只剩 9r7hwzv4 在线）：
每次操作前先 `opencli profile list` 看谁 connected，export 在线的那个；
**默认 profile 掉线时 doctor 也会 FAIL**（`not connected`），别误判桥接坏了——换个在线 profile 即恢复。
多台/多 Chrome 配置都装了桥接扩展时，哪个在线用哪个，kdocs 登录态两边一般都有。
