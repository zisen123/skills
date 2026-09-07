# 读取金山文档（多维表格 / ksheet）内容

## 目录
- [核心限制：数据是 canvas 渲染的](#核心限制数据是-canvas-渲染的)
- [三种读法及取舍](#三种读法及取舍)
- [方式1：截图识图（最快，能读被 canvas 画出来的值）](#方式1截图识图最快能读被-canvas-画出来的值)
- [方式2：抓内部接口 open/ksheet（拿全量原始数据，但是私有二进制）](#方式2抓内部接口-openksheet拿全量原始数据但是私有二进制)
- [方式3：SDK 直读（最干净）](#方式3sdk-直读最干净)
- [network 抓包的坑](#network-抓包的坑)

## 核心限制：数据是 canvas 渲染的

金山多维表格 / 在线表格（ksheet）的**单元格数据画在 `<canvas>` 上，DOM 里没有对应文字节点**。
所以 `opencli browser <sess> extract` / `document.body.innerText` **只能拿到工具栏、子表名、分组标题**，
拿不到任何记录内容。这点决定了必须换招。

## 三种读法及取舍

| 方式 | 准确性 | 完整性 | 成本 | 适用 |
|---|---|---|---|---|
| 截图识图 | 中（OCR 式，数字/链接/人名易错） | 只看得到视口内，超出要滚动 | 低 | 快速看一眼 |
| 抓 `open/ksheet` 接口 | 高（原始数据） | 全量 | 高（私有二进制，要逆向解码） | 不推荐临时啃 |
| SDK 直读 `APP.OpenAPI` | 高 | 全量 | 中（摸内部 API） | 做成适配器的正道 |

## 方式1：截图识图（最快，能读被 canvas 画出来的值）

```bash
opencli browser <sess> screenshot /tmp/x.png     # path 是位置参数，不是 --path！
# 然后 Read /tmp/x.png 让多模态看图
```
读回来的内容要标注"识图可能有误"，链接/编号以原表为准。视口截断的列（如很宽的"任务进展"）
需右滚或全页截；被筛选/分组隐藏的记录截图里也没有。

## 方式2：抓内部接口 open/ksheet（拿全量原始数据，但是私有二进制）

打开表格时的这个 POST 返回初始数据快照（约百 KB，**无 WebSocket**，靠登录态 cookie 即可）：
```
POST www.kdocs.cn/api/v3/office/file/<fileId>/open/ksheet
```
**但它不是 JSON**，是 WPS 私有二进制 op-log：body 以 `base64:` 前缀，解码后开头是 ASCII 字段名字典
（`userid/versions/ops/data/object/newObjs/...`），**单元格文本是 UTF-16LE 编码**。

验证数据确实在里面（能搜到已知中文）：
```python
raw = base64.b64decode(body[len("base64:"):])
"多媒体".encode("utf-16-le") in raw   # True
```
要还原成整齐的行×列需重写 WPS 私有序列化解码器——工程量大，**别临时硬啃**。真要全量数据，走方式3 或导出 Excel。

## 方式3：SDK 直读（最干净）

页面 App 已把上面的 blob 解析成 JS 对象，直接问它要。见 `kdocs-sdk-write.md` 的 OpenAPI：
`getRecordCount / getRecordId(i) / getRecord(id) / getAllFieldsList / getFieldId(name)`。
或点表格自带「导出数据 / 导出为多维表格」下载 Excel/CSV，再在服务器读文件——零识图误差。

## network 抓包的坑

```bash
opencli browser <sess> network --since 60s          # 默认已滤掉 js/css/图片；--all 才含静态资源
opencli browser <sess> network --detail '<key>'      # key 用列表里的 "METHOD host/path"，取完整 body
```
- **抓包缓冲会被读取消耗**：第一次 `network` 拿到 208 条，紧接着第二次可能只剩 1 条。要重抓得**先重新触发加载**。
- **同 URL `open` 不会重新加载**（被判为已打开，count:0）。强制冷加载：**换一个新 session 名** open。
- 噪音多（字节跳动 abtest、埋点 kmon）：过滤 `'kdocs.cn' in url` 且按 body size 降序，大的那个就是数据接口。
