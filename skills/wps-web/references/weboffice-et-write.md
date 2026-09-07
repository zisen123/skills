# docs.sophgo.com WebOffice ET 表读写（研发二处汇总表类）

docs.sophgo.com/weboffice 下的在线表格（如「研发二处工作内容及达成情况汇总表2026」）
是 **ET 电子表格内核**，与 kdocs 多维表格（ksheet）**不是同一套 API**：
`window.APP.OpenAPI` 在这里是 **undefined**，kdocs-sdk-write.md 的方法全用不了。
2026-08-27 实测读+写+保存全通。

## 与 kdocs 的差异速查

| 事项 | kdocs 多维表格 | docs.sophgo.com ET 表 |
|---|---|---|
| API 对象 | `window.APP.OpenAPI` | `window.APP` 本身（ET 内核，execCommand/getCell 等） |
| 切子表 | OpenAPI 方法 | `opencli browser <sess> click --text '<表名>'`（底部标签） |
| 读文本 | OpenAPI getRecord | `createRANGE+createRange+queryRangeValues(cb)` |
| 写单元格 | OpenAPI setCellValue | `range.setValue2(text)` |
| ongoing 标记 | 【ongoing】 | **【doing】**（表内其他人均用 doing，填表时对齐） |

## 读：queryRangeValues（回调式，fire-and-poll）

```js
const it = window.APP.getActiveSheet();          // 或 getWorksheets().item(idx)
const R  = it.createRANGE(0, 80, 0, 3);          // (rowFrom, rowTo, colFrom, colTo)，0 基
const rg = it.createRange(R);
rg.queryRangeValues(function(res){ window.__vals = JSON.stringify(res) });
// res.result.values = [{row, col, text}, ...]，只含有值的格
```

- `getCell(r,c).getValue()` 返回内部 value 对象（`String()` 得 `[object Object]`），**不能直接取文本**；
  `getValueLiteral()` 对空值抛错。读文本一律走 queryRangeValues。
- `getRange()` 无参返回全表 range；`createRANGE` 才是按坐标建 range 的工厂。

## 写：setValue2（同步可靠）

```js
const it = window.APP.getActiveSheet();
if (it.getName().indexOf("<目标表名前缀>") !== 0) throw "ABORT:不在目标表";  // 写前断言活动表
const rg = it.createRange(it.createRANGE(32, 32, 3, 3));   // 单格：行列同值
rg.setValue2("多行文本用\n换行");   // 返回非 Promise（同步），写完 queryRangeValues 回读验证
```

- 写多行内容直接 `\n`，单元格内自动换行显示。
- 写完 `window.APP._isSaved` 几秒后回 true = 协作文档已自动保存。

## 定位/截图坑

- **`opencli browser <sess> scroll` 对 canvas 视口无效**（截图不变）。要跳到某行：
  名称框是 `input.edit-box`（不是 `.etui-name-box-input`，选择器靠 find 别靠猜）：
  `click 'input.edit-box'` → `fill 'input.edit-box' 'D33'` → `keys Enter`。
- **UI 行号 = 0 基 + 1**：queryRangeValues 的 row 32 = 名称框里的 33 行。
- 找某人所在行：queryRangeValues 读姓名列（B 列）全表，按 text 匹配。

## 汇总表填写格式（与表内他人一致）

```
N、【项目名】任务描述【done】；任务描述【doing】
```

同项目多条用中文分号串联，换行分项目。ongoing 记【doing】。
