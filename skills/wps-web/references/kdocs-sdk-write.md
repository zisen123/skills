# 金山文档多维表格：用 window.APP.OpenAPI 读写

在办公电脑登录态 Chrome 打开的金山多维表格（ksheet / `xlEtDataBaseSheet`）页面里，
`window.APP.OpenAPI` 就是网页自己在用的完整增删改查 API。经 `opencli browser <sess> eval '...'`
注入 JS 调用，比逆向二进制、比模拟点单元格都干净。

## 目录
- [一句话最大坑](#一句话最大坑)
- [怎么拿到 API 对象](#怎么拿到-api-对象)
- [eval 的两条硬约束](#eval-的两条硬约束)
- [新建子表：必须模拟点击，API 直调会挂起](#新建子表必须模拟点击api-直调会挂起)
- [插入新记录：insertRecord 也是挂起的，走底层 position.insert](#插入新记录insertrecord-也是挂起的走底层-positioninsert)
- [写单元格](#写单元格)
- [读表结构：字段名、字段类型、单选选项（写入前的侦察）](#读表结构字段名字段类型单选选项写入前的侦察)
- [删除子表](#删除子表)
- [数据安全自查](#数据安全自查)
- [OpenAPI 常用方法清单](#openapi-常用方法清单)

## 一句话最大坑

**建子表只能走"原生点击 UI"，不能调内部 API `getWorksheets().add()`——后者 Promise 永远 pending。
`OpenAPI.insertRecord()` 插新记录是同一种病（Promise 永久 pending，`getRecordCount()` 不变），
插记录得走底层 `getActiveView().createPosition().insert(1)`；写/删单元格/删表则用 `OpenAPI` 方法，干净可靠。
setCellValue 虽不挂起但返回 Promise，连续同步批量调会静默丢写，必须逐格写一格验一格。**
即：建表靠点击，插记录靠底层 position，改数据靠 API 且一格一验。

## 怎么拿到 API 对象

```js
// eval 里
window.APP                 // 多维表格实例（在线表格页面才有；普通文档/about:blank 没有）
window.APP.OpenAPI         // 增删改查 API（object，方法在原型链上，Object.keys 只看到 serverApi）
window.APP.getWorksheets() // 工作簿，.count() / .item(i) / .item(i).getName()/getStId()/getSheetType()
window.WPSOpenApi.Application  // 官方 WebOffice SDK 代理（异步 Proxy，用 await；本任务没用到，OpenAPI 就够）
```

判断 APP 是否就绪（重开页面后必须等）：
```bash
opencli browser <sess> eval '(()=>({ok:!!(window.APP&&window.APP.getWorksheets), n:(window.APP&&window.APP.getWorksheets)?window.APP.getWorksheets().count():null}))()'
# 轮询到 "ok":true 再操作
```

## eval 的两条硬约束

1. **不能顶层 `await`**：`eval` 是同步上下文，写 `await x` 直接 `SyntaxError`。
   要异步就包 async IIFE 返回 Promise：`(async()=>{ ... return r })()` —— opencli 会等这个 Promise resolve。
2. **绝不 await 可能挂起的 Promise**：CDP `Runtime.evaluate` 默认约 115s 超时。若 await 一个永不 resolve 的 Promise（如建表命令），eval 干等到超时报
   `cdp_timeout ... page may be blocked by a native dialog`。
   **正解：fire-and-poll** —— 不 await，把结果丢到 `window.__x`，另起 eval 轮询：
   ```js
   // 触发（立即返回）
   (()=>{ window.__r="pending"; Promise.resolve(某命令()).then(x=>window.__r="ok:"+x).catch(e=>window.__r="err:"+e); return "fired" })()
   // 另一次 eval 轮询 window.__r 与状态量（如 getSheetCount()）
   ```

## 新建子表：必须模拟点击，API 直调会挂起

`window.APP.getWorksheets().add(before,after,end,count,{type,name,fields,values,...})` 看似能建库表，
**实测 Promise 永远 pending、`getSheetCount()` 不变**（有未满足的隐藏前置条件）。别用。

可靠做法 = 模拟人点底部标签栏的"+"，走 App 完整 UI 流程：
```bash
# ① 原生点击 "+"（class 是 .sheets-add-btn-wrapper）—— 必须用 opencli click（真实 CDP 鼠标事件）
#    注意：JS 的 el.click() 触发不了该框架的指针事件，菜单不弹！
opencli browser <sess> click '.sheets-add-btn-wrapper'
# ② 弹出菜单项：工作表 / 数据表 / 仪表盘 / 应用 / 从模板中新建 / 导入 / AI 快速建表
opencli browser <sess> click --text '数据表'      # 建多维库表
# ③ 轮询确认（不要 await 任何东西）
opencli browser <sess> eval '(()=>{const wb=window.APP.getWorksheets();const c=wb.count();const n=[];for(let i=0;i<c;i++)n.push(wb.item(i).getName());return JSON.stringify({count:c,names:n})})()'
```
新建的「数据表1」默认 6 字段（文本/数字/日期/单选项/图片和附件/等级）× 6 空记录。

## 插入新记录：insertRecord 也是挂起的，走底层 position.insert

`OpenAPI.insertRecord(x)` 无论传数组还是别的形式，**Promise 永久 pending、记录数不变**（2026-09 bf01 表实测）。
看源码它内部是 `getActiveView().createPosition().setEndOfRow()` 后 `position.insert(e)`——但经它包装后就是挂起，
直接调底层 position 反而立即成功：

```bash
opencli browser <sess> eval '(()=>{const o=window.APP.OpenAPI;window.__ins="pending";const t=o.getActiveView();const p=t.createPosition();p.setEndOfRow();Promise.resolve(p.insert(1)).then(r=>{window.__ins="ok:"+JSON.stringify(r)}).catch(e=>{window.__ins="err:"+e.message});return "fired"})()'
# 轮询：window.__ins 变 ok:{"cmdName":"dbSheet.insertRecords","ids":["y"]} 且 getRecordCount() +1
```

插入的是**全空记录**（自动字段如 编号/AutoNumber/最后修改时间 由表自动填）。
新记录落在**当前视图的行尾**，其视图行号 = 插入前的 `getRecordCount()`（0 基），
插入后用 `getRecordId(行号)` 拿到 id（如 `"y"`），再用 setCellValue 逐列填值。

## 写单元格

```js
window.APP.OpenAPI.setCellValue(row, col, value)   // 行、列均 0 基，基于当前激活视图
```
```bash
opencli browser <sess> eval '(()=>{const o=window.APP.OpenAPI; if(o.getActiveSheetIndex()!==2) return "ABORT:不在目标表"; o.setCellValue(0,0,"文本"); return "ok"})()'
```
- **字段类型校验**：往数字列写字符串会被拒并弹「只允许输入数字」——写入前认清列类型。
- setCellValue 是纯前端命令，不像建表那样挂起，可直接调。
- **写前务必 `getActiveSheetIndex()` 断言在目标表**，避免误写到别的子表。
- ⚠️ **返回的是 Promise，连续同步批量调会静默丢写**（2026-09 bf01 表实测：一次 eval 里连写 3 列，
  只落了第 1 列，后 2 列既不报错也没写上）。可靠做法是**一格一验**：
  ```bash
  # fire 写一格 → 轮询 __w 变 ok → getRecord(id) 确认该列值在 → 再写下一格
  opencli browser <sess> eval '(()=>{const o=window.APP.OpenAPI;window.__w="pending";Promise.resolve(o.setCellValue(1,8,"一聪")).then(()=>{window.__w="ok"}).catch(e=>{window.__w="err:"+e.message});return "fired"})()'
  ```
  单选字段直接写字符串即可（值必须在已有选项里，新值可能被拒或建新选项——写入前先查选项，见下节）。

## 读表结构：字段名、字段类型、单选选项（写入前的侦察）

写入前先摸清目标表有哪些列、什么类型、单选有哪些可选值，避免瞎写被拒：

```bash
# 字段名 + 类型（getField(i) 返回的字段对象方法在原型链上，getName() 可用；类型在 getBaseInfo().data.private.type）
opencli browser <sess> eval '(()=>{const o=window.APP.OpenAPI;const out=[];for(let i=0;i<o.getFieldCount();i++){const f=o.getField(i);let t=null;try{t=f.getBaseInfo().data.private.type}catch(e){}out.push([i,f.getName(),t])}return JSON.stringify(out)})()'
# 输出示例：[0,"编号","AutoNumber"],[1,"优先级","SingleSelect"],[3,"任务、问题介绍","MultiLineText"],[8,"处理人","SingleSelect"]...

# 单选字段的已有选项（queryFieldSelectValues 返回 Promise，要 fire-and-poll；返回 {result:{valuesList:[...]}}）
opencli browser <sess> eval '(()=>{window.__sel=null;const o=window.APP.OpenAPI;const f=o.getField(8);Promise.resolve(f.queryFieldSelectValues()).then(v=>{window.__sel=JSON.parse(JSON.stringify(v))});return "fired"})()'
# 稍后轮询 window.__sel.result.valuesList → ["一聪"]
```

坑：
- `getAllFieldsList()` 的元素 JSON.stringify 会 **circular structure**（内嵌 application 引用），别直接序列化整表；
  逐字段 `getBaseInfo()` 后删掉 `numfmtHandle` 再 stringify 也可，但输出很大（每字段几 KB），不如上面只取 name+type。
- `getField(i)` 对象 `Object.keys` 只有 `info/id/worksheet/view`，**取名用 `getName()`**（原型链方法）。
- 记录值直接 `getRecord(id)` 再 stringify 是安全的（返回纯数组，如 `["000049","P0","BSP",...]`），
  这是**读记录内容最省事的口子**（kdocs-read.md 方式3 的具体化）。

## 记录定位 + 看板任务更新（标记完成 / 填进展 / 填日期）

更新"任务看板"（问题汇总表、任务追踪表这类，含 状态/任务进展/结束时间 列）的完整套路。本文的"写单元格"原则（逐格一验、单选值先查、断言激活表）全部适用，这里补充三个本文此前没写的断点。

### 断点1：从"记录 id"反解视图行号

写单元格用的是**视图行号**（0 基），但识别目标记录往往靠**记录 id**（`getRecordId(i)` 返回的字符串，如 `"3"`）或**编号列**。文档前面只写了"行号→id"，**反向"id→行号"**是定位目标的关键：

```bash
# 已知目标记录的 id（从 getRecord 读到的，或编号列对应的 id），求它在当前视图的行号
opencli browser <sess> eval '(()=>{const o=window.APP.OpenAPI;const ids=[];for(let i=0;i<o.getRecordCount();i++)ids.push(o.getRecordId(i));const row=ids.indexOf("3");return JSON.stringify({row, ids})})()'
# 输出：{"row":1,"ids":["0","3","x","z","2","y","1"]}  →  id "3" 在行号 1
```

判据：`indexOf(id)` 返回 `-1` = 该 id 不在当前视图（过滤/排序/改了视图会变），此时别用 write，先排查视图或换用编号列定位。

### 断点2：写日期字段的格式

`Date` 类型字段用 `setCellValue(r,c, "YYYY/MM/DD")`，**斜杠格式**（如 `2026/09/07`，别用 `-` 或 `YYYY年MM月DD日`）。写入前先读一条已有记录的该列（`getRecord(id)` 返回数组里对应列的值），照抄其格式最稳：

```bash
# 读已有记录对照日期格式
opencli browser <sess> eval '(()=>{const o=window.APP.OpenAPI;const ids=[];for(let i=0;i<o.getRecordCount();i++)ids.push(o.getRecordId(i));const res=ids.map(id=>{const r=o.getRecord(id);return {id, c7:r[7]}});return JSON.stringify(res)})()'
# 输出示例：[{"id":"x","c7":"2026/06/04"},{"id":"z","c7":"2026/08/07"}] → 斜杠格式
```

### 断点2.5：改已有记录前必须重读现值（并发覆盖风险）

**合并/追加/清空已有记录的格子时，绝不能用早前会话或几分钟前读到的缓存值拼新值写回。**
2026-09 bf01 表实测：同事在 14:26 更新了记录 000049 的介绍列，而我们是 14:20 读的旧值——
若拿旧值拼接写回，**同事的修改会被静默覆盖**（setCellValue 是整格替换，没有 merge）。

正确姿势：**同一次 eval 里现读现拼现写**（读-改-写原子性至少收窄到一条命令内）：
```bash
# 读当前值 → 拼接追加 → 写回，一气呵成
opencli browser <sess> eval '(()=>{const o=window.APP.OpenAPI;const r=o.getRecord("x");const cur=r[3]||"";window.__w="pending";Promise.resolve(o.setCellValue(0,3,cur+"\n3、新增内容")).then(()=>{window.__w="ok"}).catch(e=>{window.__w="err:"+e.message});return "fired"})()'
```
判据：写回前后各读一次 `getRecord(id)`，确认写回值包含了"上一次读到的现值 + 追加内容"，
且未被覆盖的**其他列**也没变（对照最后修改时间列，若它比预期新，说明有人刚改过，重读再写）。

### 断点3：标记任务完成的完整套路

以"把某任务标为已完成 + 更新进展 + 填结束时间"为例：

```bash
# ① 侦察：读字段结构，确认状态/进展/结束时间列的索引与类型
opencli browser <sess> eval '(()=>{const o=window.APP.OpenAPI;const out=[];for(let i=0;i<o.getFieldCount();i++){const f=o.getField(i);let t=null;try{t=f.getBaseInfo().data.private.type}catch(e){}out.push([i,f.getName(),t])}return JSON.stringify(out)})()'
# 若有状态列(SingleSelect)，查其可选值——只能填 valuesList 里的值，否则被拒或新建选项
opencli browser <sess> eval '(()=>{window.__sel=null;const o=window.APP.OpenAPI;const f=o.getField(5);Promise.resolve(f.queryFieldSelectValues()).then(v=>{window.__sel=JSON.parse(JSON.stringify(v))});return "fired"})()'
# 轮询 window.__sel.result.valuesList → ["CLOSE","OPEN"]，知道"完成"该填 CLOSE

# ② 定位目标记录 id 与其行号（见断点1），先断言激活表在目标子表
opencli browser <sess> eval '(()=>{const o=window.APP.OpenAPI;if(o.getActiveSheetIndex()!==0)return "ABORT:不在目标表"; return "OK"})()'

# ③ 逐格写（一格一验）：状态 → 进展 → 结束时间
# 写状态（列5 = 单选，值必须来自 valuesList）
opencli browser <sess> eval '(()=>{const o=window.APP.OpenAPI;window.__w="pending";Promise.resolve(o.setCellValue(1,5,"CLOSE")).then(()=>{window.__w="ok"}).catch(e=>{window.__w="err:"+e.message});return "fired"})()'
# 写进展（列4 = 多行文本，读出现值拼接换行 + 追加，换行用真实的 \n，跨行 stringify 会显示 \n）
opencli browser <sess> eval '(async()=>{const o=window.APP.OpenAPI;window.__w="pending";Promise.resolve(o.setCellValue(1,4,String.raw`9.4：已创建\nhttps://gerrit-ai.sophgo.vip:8443/168553`)).then(()=>{window.__w="ok"}).catch(e=>{window.__w="err:"+e.message});return "fired"})()'
# 写结束时间（列7 = 日期，斜杠格式，见断点2）
opencli browser <sess> eval '(()=>{const o=window.APP.OpenAPI;window.__w="pending";Promise.resolve(o.setCellValue(1,7,"2026/09/07")).then(()=>{window.__w="ok"}).catch(e=>{window.__w="err:"+e.message});return "fired"})()'

# ④ 逐格验证 + 数据安全自查
opencli browser <sess> eval '(()=>{const o=window.APP.OpenAPI;const id=o.getRecordId(1);const r=o.getRecord(id);return JSON.stringify({id, 状态:r[5], 进展:(r[4]||"").slice(0,40), 结束:r[7]})})()'
opencli browser <sess> eval '(()=>{const o=window.APP.OpenAPI;return JSON.stringify({canUndo:o.canUndo(), isSaved:window.APP._isSaved})})()'
```

判据（成功 vs 失败）：
- 每格写入后 `getRecord(id)` 里该列值在 → 成功；列值缺失/报错 → 该格没写上，重写。
- `canUndo()===true` 且 `_isSaved===true` → 改动已提交；误触单元格用 `keys Escape` 还原。
- 状态列写不进（报"只允许..."或没变化）→ 值不在 options 里，先查 `queryFieldSelectValues`。

## 删除子表

```js
window.APP.OpenAPI.deleteSheetByIndex(idx)   // = item(idx).delSheet(true)，true 跳过确认框
window.APP.OpenAPI.deleteSheet(idx)          // 删当前活动表里的第 idx 个，返回 Promise
```
删前**先按名字断言索引**（别写死 index，子表顺序可能变）：
```bash
opencli browser <sess> eval '(()=>{const wb=window.APP.getWorksheets(); if(wb.item(2).getName()!=="数据表1")return "ABORT:index2非目标"; window.__d="pending"; Promise.resolve(window.APP.OpenAPI.deleteSheetByIndex(2)).then(r=>window.__d="ok:"+r).catch(e=>window.__d="err:"+e); return "fired"})()'
# 再轮询 count 由 N 变 N-1
```

## 数据安全自查

改真实协作文档时，每步用这几个只读量确认无误伤（本次会话靠它们证明零损坏）：
```js
window.APP.OpenAPI.canUndo()   // false = 本次会话没产生任何可撤销改动（只打开过文档时最有力的"未改动"证明）
window.APP.OpenAPI.canRedo()
window.APP._isSaved            // true = 已保存态
window.APP.isOfflineMode()     // ⚠️ 是函数！必须带括号调用。写成 !window.APP.isOfflineMode 恒 false，会误判"离线"
```
误触真实单元格进入编辑/选中态时，立刻 `opencli browser <sess> keys Escape`（连按两次更稳）还原，
再查 `canUndo()===false` 确认没提交。

## OpenAPI 常用方法清单

`getSheetCount / getActiveSheetIndex / getActiveSheetStId / getSheetName(idx) / renameSheet(idx,name) /
addSheet(不可靠) / getAllFieldsList / getFieldId(name) / getFieldCount / getField(i) / getRecordCount / getRecordId(i) /
getRecord(id) / insertRecord(同样不可靠) / setCellValue(r,c,v) / clearValues / addSingleLineTextField / export / undo / redo`
（完整方法名见 session 里对 `APP.OpenAPI` 的枚举；方法在原型链上，用遍历原型的方式枚举，别用 Object.keys。）

**`export("xlsx")`**：服务端导出，Promise resolve 出 ks3 临时下载 URL（无需登录态，服务器可直接 curl）。
整表下载流程与常用表格链接见 `references/kdocs-batch-download.md`。
