# 妈妈的菜谱

> 暑假跟妈妈学做菜的完整记录。每道菜都有结构化菜谱 + 剪辑视频。

## 架构说明

**代码与数据分离**：
- 本项目（`mom-recipes/`）— Electron 桌面应用，纯代码
- Obsidian Vault（`E:\obsidian\生活笔记\`）— 全部数据

应用只是 CRUD 界面，所有菜谱数据存放在 Obsidian Vault 中，方便在 Obsidian 中使用 Dataview 插件进行动态查询。

## 功能

| 功能 | 说明 |
|------|------|
| 📖 菜谱管理 | 新建、编辑、删除菜谱 |
| 📝 做饭日志 | 记录每次做菜的评分、问题、改进 |
| 🎲 今天吃啥 | 按"上次做"日期推荐很久没做的菜 |
| 🔄 索引同步 | 自动生成 `菜谱索引.md`（含 Dataview 查询） |
| 🎬 视频管理 | 导入、查看做菜视频 |

## 启动方式

```bash
cd app
npm install  # 首次运行
npm start
```

或双击 `启动菜谱.bat`

## 数据存储

所有数据存放在 Obsidian Vault：

```
E:\obsidian\生活笔记\
├── 菜谱/          ← 按烹饪方式分类
├── 做饭日志.md    ← 做饭流水记录
├── 菜谱索引.md    ← 自动生成的总表
└── 食材库.md      ← 常用食材知识
```

## 菜谱文件格式

每个菜谱 .md 文件顶部有 YAML frontmatter：

```yaml
---
状态: 已学会
难度: ⭐
分类: 炒
学会日期: 2026-07-01
用时: 15
份量: 2
上次做: 2026-01-25
评分: 8
---
```

## Obsidian 端配置

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

## 项目结构

```
mom-recipes/
├── CLAUDE.md              ← 项目详细说明
├── README.md              ← 本文件
├── 菜谱模板.md            ← 菜谱模板（留在项目内）
├── 启动菜谱.bat           ← 启动脚本
├── app/                   ← Electron 应用
│   ├── main.js            ← 主进程
│   ├── preload.js         ← IPC 桥接
│   └── renderer/          ← 前端界面
└── 视频素材/              ← 做菜视频（.gitignore 忽略）
```
