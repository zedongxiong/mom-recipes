# 妈妈的菜谱 — 重构方案：数据迁移到 Obsidian

> 目标：代码与数据分离。Electron 应用只负责 CRUD，全部数据存放在 Obsidian 生活笔记 Vault 中。

---

## 一、目标架构

```
H:\claude\projects\mom-recipes\          ← 纯代码，零数据
├── app/
│   ├── main.js                          ← 重构：所有路径指向 Obsidian
│   ├── preload.js                       ← 新增 IPC 接口
│   └── renderer/
│       ├── index.html                   ← 新增做饭日志、今天吃啥页面
│       ├── app.js                       ← 新增日志/推荐逻辑
│       └── style.css                    ← 新增样式
├── 菜谱模板.md                          ← 保留（模板不放 Obsidian）
├── CLAUDE.md
└── README.md

E:\obsidian\生活笔记\                    ← 新建 Vault，全部数据
├── .obsidian/                           ← Obsidian 配置（自动创建）
├── 菜谱/
│   ├── 炒/
│   │   └── 番茄炒蛋.md
│   ├── 炖煮/
│   ├── 蒸/
│   ├── 煎炸/
│   ├── 凉拌/
│   ├── 汤/
│   ├── 烤/
│   ├── 腌卤/
│   └── 主食/
├── 做饭日志.md                          ← 每次做饭的流水记录
├── 菜谱索引.md                          ← 自动生成的总表
└── 食材库.md                            ← 常用食材知识
```

## 二、数据流

```
Electron 应用 (CRUD)  ──读写──▶  Obsidian Vault (数据)
       │                              │
       │  新建菜谱 → 写 .md 到分类目录
       │  编辑菜谱 → 覆写 .md
       │  删除菜谱 → 删 .md + 更新索引
       │  记做饭日志 → 追加到 做饭日志.md
       │  同步索引 → 扫描全部菜谱 → 重写 菜谱索引.md
       │                              │
       └── 今天吃啥 ← 读索引 → 按上次做排序推荐
```

## 三、需要改动的文件

| 文件 | 改动内容 |
|------|---------|
| `main.js` | 所有路径从 `ROOT/菜谱/` 改为 `Obsidian/菜谱/`；删除 README 状态管理；新增做饭日志、索引同步、今天吃啥的 IPC |
| `preload.js` | 新增 `addCookLog`、`syncIndex`、`getRecommendation`、`getCookLogs` 接口 |
| `index.html` | 侧边栏新增「做饭日志」「今天吃啥」；新增对应页面 |
| `app.js` | 新增日志页面逻辑、推荐逻辑、索引同步逻辑 |
| `style.css` | 新增日志和推荐页面样式 |

## 四、实施步骤

### 阶段 1：创建 Obsidian Vault + 迁移数据

1. 创建 `E:\obsidian\生活笔记\` 目录
2. 创建 9 个菜谱分类子目录（炒、炖煮、蒸、煎炸、凉拌、汤、烤、腌卤、主食）
3. 创建以下初始文件：

**做饭日志.md**：
```markdown
# 做饭日志

> 每次做菜的记录。格式：日期 → 菜名（第N次）→ 评分 → 问题 → 改进

---
```

**菜谱索引.md**：
```markdown
# 菜谱索引

> 自动生成，勿手动编辑。运行应用的"同步索引"功能更新。

## Dataview 查询

```dataview
TABLE 难度, 用时, 上次做 AS "上次做", 评分, 状态
FROM "菜谱"
WHERE 状态 = "已学会"
SORT 上次做 ASC
```

---
```

**食材库.md**：
```markdown
# 食材库

> 常用食材的挑选标准、保存方法、品牌推荐。

---

## 鸡蛋

- **挑选**：壳表面粗糙、摇晃无声响
- **保存**：冰箱冷藏，大头朝上

---
```

4. 将现有 `mom-recipes/菜谱/` 下的菜谱文件（如果有）迁移到 Obsidian 对应目录

### 阶段 2：重构 main.js — 路径切换 + Frontmatter

**路径变更**：
```javascript
// 旧
const RECIPES_DIR = path.join(ROOT, "菜谱");
const README_FILE = path.join(ROOT, "README.md");

// 新
const OBSIDIAN_VAULT = "E:\\obsidian\\生活笔记";
const RECIPES_DIR = path.join(OBSIDIAN_VAULT, "菜谱");
const COOK_LOG_FILE = path.join(OBSIDIAN_VAULT, "做饭日志.md");
const INDEX_FILE = path.join(OBSIDIAN_VAULT, "菜谱索引.md");
const TEMPLATE_FILE = path.join(ROOT, "菜谱模板.md"); // 模板留在项目内
const VIDEO_DIR = path.join(ROOT, "视频素材"); // 视频留在项目内
```

**Frontmatter 替代 README 状态管理**：

菜谱文件顶部增加 YAML frontmatter：
```yaml
---
状态: 已学会
难度: ⭐
分类: 炒
学会日期: 2026-01-20
用时: 10
份量: 2
上次做: 2026-01-25
评分: 8
---
```

**scanRecipes() 改造**：
- 不再读 README 获取状态
- 解析每个 .md 文件的 frontmatter 获取全部元数据
- 用正则或简单的 YAML 解析（不需要引入 yaml 库，用正则即可）

**删除的代码**：
- `updateReadme()` 函数
- `update-status` IPC 中操作 README 的逻辑
- `create-recipe` 中调用 `updateReadme` 的部分
- `delete-recipe` 中操作 README 的部分

**新增的 IPC**：
- `add-cook-log`：记录做饭日志
- `get-cook-logs`：读取做饭日志
- `sync-index`：同步生成菜谱索引
- `get-recommendation`：今天吃啥推荐
- `update-frontmatter`：更新菜谱 frontmatter 字段

### 阶段 3：新增做饭日志功能

**main.js — add-cook-log IPC**：
```javascript
ipcMain.handle("add-cook-log", (event, data) => {
  // data: { recipeName, category, rating, issues, improvements, time, feedback, cookCount }
  // 1. 格式化为 markdown 块
  // 2. 追加到 COOK_LOG_FILE
  // 3. 更新对应菜谱的 frontmatter（上次做、评分）
});
```

**日志格式**：
```markdown
## 2026-01-20

### 🍳 番茄炒蛋（第 1 次）
- **评分**：7/10
- **问题**：蛋炒老了
- **改进**：下次蛋液加水
- **耗时**：15 分钟
- **家人反馈**：味道可以
```

**index.html — 做饭日志页面**：
- 快速记录表单：选菜谱（下拉）→ 评分 → 问题 → 改进 → 保存
- 日志列表展示（最近 20 条）

**preload.js**：
```javascript
addCookLog: (data) => ipcRenderer.invoke("add-cook-log", data),
getCookLogs: (limit) => ipcRenderer.invoke("get-cook-logs", limit),
```

### 阶段 4：新增索引同步功能

**main.js — sync-index IPC**：
```javascript
ipcMain.handle("sync-index", () => {
  // 1. 扫描所有菜谱 frontmatter
  // 2. 按分类组织
  // 3. 生成 markdown 表格
  // 4. 写入 INDEX_FILE（保留顶部 Dataview 查询块）
});
```

**生成的索引格式**：
```markdown
# 菜谱索引

> 自动生成于 2026-01-20 20:30。勿手动编辑。

## Dataview 查询
（保留 Dataview 代码块）

## 🍳 炒

| # | 菜名 | 难度 | 用时 | 上次做 | 评分 | 状态 |
|---|------|------|------|--------|------|------|
| 1 | 番茄炒蛋 | ⭐ | 10分钟 | 01-25 | 8 | ✅ |

## 🍲 炖煮
...
```

### 阶段 5：新增「今天吃啥」功能

**main.js — get-recommendation IPC**：
```javascript
ipcMain.handle("get-recommendation", () => {
  // 1. 读取所有状态为"已学会"的菜谱
  // 2. 按"上次做"日期升序排列（很久没做的排前面）
  // 3. 返回前 10 条推荐
  // 4. 如果没有"上次做"记录，排在最前面（还没独立做过）
});
```

**index.html — 今天吃啥页面**：
- 推荐卡片列表（菜名 + 难度 + 上次做 + 评分）
- 每个卡片有「就做这个！」按钮 → 跳转到做饭日志记录
- 刷新按钮重新推荐

**preload.js**：
```javascript
getRecommendation: () => ipcRenderer.invoke("get-recommendation"),
syncIndex: () => ipcRenderer.invoke("sync-index"),
```

### 阶段 6：Frontmatter 读写工具函数

需要在 main.js 中实现：

```javascript
// 读取 frontmatter
function parseFrontmatter(content) {
  // 正则匹配 --- 之间的 YAML
  // 解析为对象 { 状态, 难度, 分类, 学会日期, 用时, 份量, 上次做, 评分 }
}

// 更新 frontmatter 中的指定字段
function updateFrontmatter(content, updates) {
  // 找到 --- 之间的内容
  // 替换指定字段的值
  // 返回完整内容
}
```

### 阶段 7：清理 + 更新文档

- 删除 `main.js` 中所有 `updateReadme` 相关代码
- `README.md` 改为说明新架构：
  - 数据在 Obsidian 生活笔记 Vault
  - 应用只是 CRUD 界面
  - 如何使用
- `CLAUDE.md` 更新项目结构说明
- 侧边栏统计改为从 frontmatter 统计，不再依赖 README

## 五、Obsidian 端配置

### 必装插件
- **Dataview**：动态查询菜谱

### 可选插件
- **Templater**：菜谱模板
- **Calendar**：做饭日志按日历查看

### Dataview 查询示例

**很久没做的菜**：
```dataview
TABLE 难度, 用时, 上次做 AS "上次做", 评分
FROM "菜谱"
WHERE 状态 = "已学会"
SORT 上次做 ASC
```

**按分类统计**：
```dataview
TABLE length(rows) AS "数量"
FROM "菜谱"
GROUP BY 分类
```

**高分菜谱**：
```dataview
TABLE 难度, 用时, 评分
FROM "菜谱"
WHERE 评分 >= 8
SORT 评分 DESC
```

## 六、注意事项

1. **路径硬编码**：`OBSIDIAN_VAULT` 路径建议做成配置项（`config.json`），方便换电脑
2. **视频素材**：留在 `mom-recipes/视频素材/`，不进 Obsidian（大文件）
3. **模板文件**：`菜谱模板.md` 留在项目内，不放 Obsidian
4. **并发安全**：Electron 和 Obsidian 可能同时读写同一个 .md 文件，保存时用原子写入（先写临时文件再 rename）
5. **Frontmatter 解析**：不引入 yaml 库，用正则解析简单 key-value 即可（字段都是简单的字符串/数字）
6. **Vault 初始化**：首次启动时检测 Obsidian Vault 是否存在，不存在则自动创建目录结构

## 七、验收标准

- [ ] Electron 应用能正常启动，读写 Obsidian Vault 中的菜谱
- [ ] 新建菜谱 → Obsidian 对应目录出现 .md 文件（带 frontmatter）
- [ ] 编辑菜谱 → .md 文件内容更新
- [ ] 删除菜谱 → .md 文件删除
- [ ] 做饭日志 → 记录追加到 `做饭日志.md`，菜谱 frontmatter 更新
- [ ] 同步索引 → `菜谱索引.md` 正确生成
- [ ] 今天吃啥 → 按"上次做"排序推荐
- [ ] Obsidian 中 Dataview 查询正常工作
- [ ] 不再依赖 README.md 管理状态
