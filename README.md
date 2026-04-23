# 记账 PWA · 完整版

iPhone / iPad 专属的本地记账应用。所有数据存在浏览器 IndexedDB 中，不上传任何服务器。

**视觉风格**：浅木色背景 + 森林绿主调 + 跟随系统深浅切换

---

## 模块清单（全部完成）

| 模块 | 功能 |
|------|------|
| 模块一 | 项目骨架 + PWA 基础（可添加到主屏幕、离线运行）|
| 模块二 | IndexedDB 数据层（账户/分类/账单/预算/汇率）|
| 模块三 | 日历视图（月视图 + 年视图 + 周色块）|
| 模块四 | 账单录入表单（多币种 X+ 方案 + 智能记忆）|
| 模块五 | 分类管理（增删改 + 自定义图标颜色）|
| 模块六 | 统计报表（饼图 + 柱图 + 排行）|
| 模块七 | 预算管理（日/周/月/大额）|
| 模块八 | 账单明细页（搜索 + 筛选 + 详情）|
| 模块九 | 设置页（账户管理 + 数据导入导出）|

---

## 核心特性

### 视觉
- **浅木色背景**：原色松木质感（`#f0e6d2`），暖而不刺眼
- **森林绿主调**：`#3d6b35`，按钮、FAB、选中态
- **柔和语义色**：陶土红（支出）、苹果绿（收入）、琥珀橙（接近超支）
- **深色模式**：黑檀木 + 苔藓绿，跟随系统自动切换

### 数据安全
- **完全本地存储**：所有数据在浏览器 IndexedDB
- **离线可用**：装 Service Worker 缓存，无网络可记账查看
- **JSON 导出/导入**：可备份、可在不同设备间迁移

### 多币种（X+ 方案）
- 支持 USD（可扩展）
- 自动从 frankfurter.app 拉汇率
- 离线时用本地缓存
- **可手动覆盖 ¥ 金额**（应对充值卡卡商加价等场景）
- 每笔账单存"原币种 + 汇率快照 + ¥ 金额"，历史不会随汇率波动

### 你的核心设计："日常 vs 大额"
- 每笔支出有"计入日预算"开关
- 默认计入：影响日历每日颜色
- 关掉则成为大额：单独有"月大额预算"
- 日历看日常消费、月度看大额，两套预算独立判定颜色

---

## 怎么用（首次上手）

1. **打开应用**：默认在日历页
2. **点右下角 + 按钮**：弹出记账表单
3. **输入金额、选分类、选账户、保存**
4. **进设置 → 预算管理**：设置日/周/月预算，日历会按消费状态变色
5. **设置 → 分类管理**：增删自定义分类
6. **设置 → 账户管理**：增删账户、设置余额、归档不用的
7. **设置 → 导出数据**：定期备份 JSON 文件

---

## 在 Windows 上启动

VS Code 装 **Live Server** 插件 → 右键 `index.html` → Open with Live Server  
（用 Edge 打开完全没问题，Edge 内核就是 Chromium）

或者：

```powershell
cd ledger-pwa-final
python -m http.server 8080
```

浏览器访问 `http://localhost:8080`，F12 → 设备模拟选 iPhone Pro Max 或 iPad Pro。

> 升级版本后第一次打开**Ctrl+Shift+R 硬刷新**清旧 Service Worker 缓存。

---

## 在 iPhone / iPad 上测试

### 局域网测试（开发期间）
1. PowerShell 运行 `ipconfig`，找 IPv4 地址（如 `192.168.1.100`）
2. 启动服务器
3. iPhone Safari 访问 `http://192.168.1.100:8080`
4. 注意 HTTP 模式下 Service Worker 不可用（其它功能正常）

### 添加到主屏幕（像 App 一样用）
1. Safari 打开应用
2. 点底部分享按钮
3. 选择"添加到主屏幕"
4. 之后就有图标，点击直接进入全屏 App 模式

### 完整 PWA 体验（含离线）
部署到 GitHub Pages / Vercel / Netlify 等支持 HTTPS 的平台即可。

---

## 文件结构

```
ledger-pwa-final/
├── index.html
├── manifest.json                  # 主题色 #3d6b35
├── service-worker.js              # v1.4.0
├── README.md
├── css/
│   ├── style.css                  # 全局变量 + 浅木绿色板 + 深色模式
│   ├── calendar.css               # 日历专用
│   ├── tx-form.css                # 账单表单专用
│   └── modules.css                # 模块 5-9 共享
├── js/
│   ├── register-sw.js
│   │
│   │── 数据层（模块二）
│   ├── db-schema.js
│   ├── db-core.js
│   ├── repo-accounts.js
│   ├── repo-categories.js
│   ├── repo-transactions.js
│   ├── repo-misc.js               # 预算 / 汇率 / 元数据
│   ├── db-seed.js
│   │
│   │── UI 通用（模块三）
│   ├── ui-utils.js
│   ├── ui-sheet.js                # 底部抽屉组件
│   ├── ui-budget-panel.js         # （兼容老接口，已被模块七替换）
│   │
│   │── 日历相关（模块三）
│   ├── calendar-view.js
│   ├── year-view.js
│   ├── day-detail.js
│   │
│   │── 账单表单（模块四）
│   ├── tx-form.js
│   │
│   │── 模块 5-9 页面
│   ├── page-categories.js         # 分类管理
│   ├── page-stats.js              # 统计（纯 SVG 图表）
│   ├── page-budgets.js            # 预算管理
│   ├── page-list.js               # 账单明细
│   ├── page-accounts.js           # 账户管理
│   ├── page-settings.js           # 设置主页（含导入导出）
│   │
│   │── 主控
│   ├── page-calendar.js
│   └── app.js
└── icons/
    ├── icon-192.png               # 森林绿底 + 米色￥
    ├── icon-512.png
    └── apple-touch-icon.png
```

---

## 测试覆盖（已通过）

```
[模块九 - 账户管理]
  ✓ 账户树: 2 顶级, 总 5 个
  ✓ 新增账户 + 余额设置
  ✓ 归档: 可见 2, 全部 3

[模块五 - 分类管理]
  ✓ 分类: 支出 12, 收入 6
  ✓ 新增 + 改名 + 删除
  ✓ 系统分类受保护
  ✓ 自定义分类可删

[模块四 - 账单录入]
  ✓ 写入 8 条混合账单（CNY/USD/大额/收入混合）

[模块七 - 预算]
  ✓ 预算消耗计算正确（含大额排除）

[模块六 - 统计]
  ✓ 本月支出按分类聚合: 5 个分类

[模块八 - 明细页]
  ✓ 类型 + 账户筛选
  ✓ 关键字搜索

[模块九 - 数据导入导出]
  ✓ 导出 JSON
  ✓ 导入恢复
  ✓ 元数据恢复
```

---

## 已知限制 & 后续可加

### 没做的（按你的明确要求）
- **转账功能**：你说"暂不做，先把收支走通"，模块二预留了字段
- **分类拖拽排序**：当前按创建顺序，要拖拽需要 SortableJS

### 可以加但你没要求的
- **账单编辑**：当前只能"删除+重建"。完整编辑要复用 TxForm，工作量约半个模块
- **图片票据**：当前没存图片。如要加，IndexedDB 存 Blob 即可
- **重复账单**：每月固定支出（如订阅）自动生成
- **多设备同步**：当前纯本地。如要同步，需要后端服务

需要任何一项告诉我，单独加。

---

## 关键实现说明

### 多币种 X+ 方案
表单选 USD 后：
1. 自动调 `Repo.ExchangeRates.getSmartRate('USD','CNY')`
2. 在线优先（frankfurter.app），失败用本地缓存
3. 实时算出 ¥ 显示在汇率行
4. 用户可手动改 ¥ 金额，标记 `isManualRate: true`
5. 保存时三件套都存：`amount`(原)、`amountCNY`(折算)、`exchangeRate`(汇率快照)

### "日常 vs 大额"
- 数据：账单的 `countInDailyBudget` 字段
- 表单：录入时一个开关
- 日历：用 `summarize(list, { onlyDailyBudget: true })` 仅算日预算
- 预算：日/周预算只看"计入日预算"的，月大额预算看"不计入日预算"的

### 数据导出格式
```json
{
  "version": 1,
  "exportedAt": "2026-04-22T...",
  "accounts": [...],
  "categories": [...],
  "transactions": [...],
  "meta": { "tempDailyBudget": 50, ... }
}
```

可以直接编辑 JSON 后导回（高级用户）。
