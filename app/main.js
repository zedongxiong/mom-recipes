const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

// ========== 路径配置 ==========
const ROOT = path.resolve(__dirname, "..");
const OBSIDIAN_VAULT = "E:\\obsidian\\生活笔记";
const RECIPES_DIR = path.join(OBSIDIAN_VAULT, "菜谱");
const COOK_LOG_FILE = path.join(OBSIDIAN_VAULT, "做饭日志.md");
const INDEX_FILE = path.join(OBSIDIAN_VAULT, "菜谱索引.md");
const TEMPLATE_FILE = path.join(ROOT, "菜谱模板.md");
const VIDEO_DIR = path.join(ROOT, "视频素材");

// 分类映射（按烹饪方式）
const CATEGORIES = {
  炒: "🍳",
  炖煮: "🍲",
  蒸: "♨️",
  煎炸: "🫕",
  凉拌: "🥗",
  汤: "🥣",
  烤: "🔥",
  腌卤: "🧂",
  主食: "🍚",
};

const DIFFICULTY = { 1: "⭐", 2: "⭐⭐", 3: "⭐⭐⭐" };

// ========== 初始化 ==========
function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    title: "妈妈的菜谱",
    icon: path.join(__dirname, "..", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  ensureVaultExists();
  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});

// ========== 工具函数 ==========

function normalizePath(p) {
  return p.replace(/\\/g, "/");
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 确保 Obsidian Vault 目录结构存在
function ensureVaultExists() {
  ensureDir(OBSIDIAN_VAULT);
  ensureDir(RECIPES_DIR);
  for (const cat of Object.keys(CATEGORIES)) {
    ensureDir(path.join(RECIPES_DIR, cat));
  }
  // 确保初始文件存在
  if (!fs.existsSync(COOK_LOG_FILE)) {
    fs.writeFileSync(COOK_LOG_FILE, "# 做饭日志\n\n> 每次做菜的记录。格式：日期 → 菜名（第N次）→ 评分 → 问题 → 改进\n\n---\n", "utf-8");
  }
  if (!fs.existsSync(INDEX_FILE)) {
    fs.writeFileSync(INDEX_FILE, "# 菜谱索引\n\n> 自动生成，勿手动编辑。运行应用的\"同步索引\"功能更新。\n\n---\n", "utf-8");
  }
}

// ========== Frontmatter 解析 ==========

// 解析 YAML frontmatter（简单 key-value，不引入 yaml 库）
function parseFrontmatter(content) {
  const result = {};
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return result;

  const lines = match[1].split("\n");
  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();
    // 处理空值和引号
    if (value === '""' || value === "''" || value === "null") value = "";
    result[key] = value;
  }
  return result;
}

// 更新 frontmatter 中的指定字段
function updateFrontmatter(content, updates) {
  const match = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
  if (!match) {
    // 没有 frontmatter，创建一个
    let fm = "---\n";
    for (const [key, value] of Object.entries(updates)) {
      fm += `${key}: ${value}\n`;
    }
    fm += "---\n";
    return fm + content;
  }

  let fmContent = match[2];
  for (const [key, value] of Object.entries(updates)) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`^(${escapedKey}:).*$`, "m");
    if (regex.test(fmContent)) {
      fmContent = fmContent.replace(regex, `$1 ${value}`);
    } else {
      // 字段不存在，添加
      fmContent += `\n${key}: ${value}`;
    }
  }

  return content.replace(match[0], `${match[1]}${fmContent}${match[3]}`);
}

// ========== 扫描菜谱 ==========

function scanRecipes() {
  const recipes = [];

  for (const category of Object.keys(CATEGORIES)) {
    const catDir = path.join(RECIPES_DIR, category);
    if (!fs.existsSync(catDir)) continue;

    const files = fs.readdirSync(catDir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const filePath = path.join(catDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const name = file.replace(".md", "");

      // 从 frontmatter 读取元数据
      const fm = parseFrontmatter(content);
      const statusMap = { "已学会": "✅", "复习中": "🔄", "已记录": "📝" };
      const status = statusMap[fm["状态"]] || "📝";

      recipes.push({
        name,
        category,
        difficulty: fm["难度"] || "⭐",
        date: fm["学会日期"] || "",
        cookTime: fm["用时"] ? parseInt(fm["用时"]) : null,
        servings: fm["份量"] || "2",
        lastCooked: fm["上次做"] || "",
        rating: fm["评分"] || "",
        status,
        filePath: normalizePath(path.relative(ROOT, filePath)),
        emoji: CATEGORIES[category],
      });
    }
  }

  // 按日期排序
  recipes.sort((a, b) => (a.date > b.date ? 1 : -1));
  return recipes;
}

// ========== IPC 处理 ==========

// 新建菜谱
ipcMain.handle("create-recipe", (event, data) => {
  try {
    const { name, category, difficulty, date, servings, cookTime } = data;

    // 参数校验
    if (!name || !name.trim()) return { success: false, error: "菜名不能为空" };
    if (!category) return { success: false, error: "请选择分类" };
    if (!CATEGORIES[category]) return { success: false, error: `无效分类: ${category}` };
    if (/[\\/]/.test(name) || /\.\./.test(name)) return { success: false, error: "菜名包含非法字符" };

    const dateStr = date || new Date().toISOString().slice(5, 10);
    const fullDate = `2026-${dateStr}`;
    const difficultyStars = DIFFICULTY[difficulty] || "⭐";

    // 1. 创建视频文件夹
    const dayNum = getDayNumber(dateStr);
    const videoFolderName = `Day${String(dayNum).padStart(2, "0")}-${name}`;
    const videoFolderPath = path.join(VIDEO_DIR, videoFolderName);
    ensureDir(videoFolderPath);

    // 2. 创建菜谱文件（带 frontmatter）
    const recipeDir = path.join(RECIPES_DIR, category);
    ensureDir(recipeDir);
    const recipeFile = path.join(recipeDir, `${name}.md`);

    if (fs.existsSync(recipeFile)) {
      return { success: false, error: "菜谱已存在" };
    }

    // 生成 frontmatter
    let frontmatter = "---\n";
    frontmatter += `状态: 已记录\n`;
    frontmatter += `难度: ${difficultyStars}\n`;
    frontmatter += `分类: ${category}\n`;
    frontmatter += `学会日期: ${fullDate}\n`;
    frontmatter += `用时: ${cookTime || ""}\n`;
    frontmatter += `份量: ${servings || 2}\n`;
    frontmatter += `上次做: ""\n`;
    frontmatter += `评分: ""\n`;
    frontmatter += "---\n\n";

    // 读取模板并替换
    let template = fs.readFileSync(TEMPLATE_FILE, "utf-8");
    const timeStr = cookTime ? `${cookTime} 分钟` : "___ 分钟";

    template = template
      .replace("[菜名]", name)
      .replace("肉类 / 海鲜 / 蔬菜 / 汤品 / 主食 / 凉菜 / 节日菜", category)
      .replace("⭐ / ⭐⭐ / ⭐⭐⭐", difficultyStars)
      .replace("___ 分钟", timeStr)
      .replace("___ 人份", `${servings || 2} 人份`)
      .replace("____-__-__", fullDate)
      .replace("视频素材/DayXX-菜名/", `视频素材/${videoFolderName}/`);

    // 写入文件（frontmatter + 模板内容）
    fs.writeFileSync(recipeFile, frontmatter + template, "utf-8");

    return {
      success: true,
      videoFolder: videoFolderName,
      recipePath: normalizePath(path.relative(ROOT, recipeFile)),
    };
  } catch (error) {
    console.error("[create-recipe]", error);
    return { success: false, error: error.message };
  }
});

// 获取菜谱列表
ipcMain.handle("list-recipes", () => {
  return scanRecipes();
});

// 读取菜谱
ipcMain.handle("read-recipe", (event, filePath) => {
  const fullPath = path.join(ROOT, filePath);
  if (!fs.existsSync(fullPath))
    return { success: false, error: `文件不存在: ${fullPath}` };
  const content = fs.readFileSync(fullPath, "utf-8");
  return { success: true, content };
});

// 保存菜谱
ipcMain.handle("save-recipe", (event, filePath, content) => {
  const fullPath = path.join(ROOT, filePath);
  // 原子写入（先写临时文件再 rename）
  const tmpPath = fullPath + ".tmp";
  fs.writeFileSync(tmpPath, content, "utf-8");
  fs.renameSync(tmpPath, fullPath);
  return { success: true };
});

// 更新状态（现在更新 frontmatter）
ipcMain.handle("update-status", (event, category, name, status) => {
  const recipeFile = path.join(RECIPES_DIR, category, `${name}.md`);
  if (!fs.existsSync(recipeFile)) {
    return { success: false, error: "菜谱不存在" };
  }

  const statusMap = { learned: "已学会", review: "复习中", recorded: "已记录" };
  const newStatus = statusMap[status] || status;

  let content = fs.readFileSync(recipeFile, "utf-8");
  content = updateFrontmatter(content, { 状态: newStatus });
  fs.writeFileSync(recipeFile, content, "utf-8");

  return { success: true };
});

// 删除菜谱
ipcMain.handle("delete-recipe", (event, category, name) => {
  try {
    if (!category || !name) return { success: false, error: "参数不完整" };
    if (!CATEGORIES[category]) return { success: false, error: `无效分类: ${category}` };
    if (/[\\/]/.test(name) || /\.\./.test(name)) return { success: false, error: "菜名包含非法字符" };

    const recipeFile = path.join(RECIPES_DIR, category, `${name}.md`);
    if (!fs.existsSync(recipeFile)) {
      return { success: false, error: `菜谱不存在: ${name}` };
    }

    fs.unlinkSync(recipeFile);
    return { success: true };
  } catch (error) {
    console.error("[delete-recipe]", error);
    return { success: false, error: error.message };
  }
});

// 获取统计
ipcMain.handle("get-stats", () => {
  const recipes = scanRecipes();
  const total = recipes.length;
  const learned = recipes.filter((r) => r.status === "✅").length;
  const review = recipes.filter((r) => r.status === "🔄").length;
  const recorded = recipes.filter((r) => r.status === "📝").length;

  const byCategory = {};
  for (const r of recipes) {
    byCategory[r.category] = (byCategory[r.category] || 0) + 1;
  }

  return { total, learned, review, recorded, byCategory };
});

// ========== 做饭日志 ==========

// 记录做饭日志
ipcMain.handle("add-cook-log", (event, data) => {
  try {
    const { recipeName, category, rating, issues, improvements, time, feedback, cookCount } = data;
    const today = new Date().toISOString().slice(0, 10);

    // 格式化日志条目
    let logEntry = `\n## ${today}\n\n`;
    logEntry += `### 🍳 ${recipeName}（第 ${cookCount || 1} 次）\n`;
    logEntry += `- **评分**：${rating || "-"}/10\n`;
    if (issues) logEntry += `- **问题**：${issues}\n`;
    if (improvements) logEntry += `- **改进**：${improvements}\n`;
    if (time) logEntry += `- **耗时**：${time} 分钟\n`;
    if (feedback) logEntry += `- **家人反馈**：${feedback}\n`;
    logEntry += "\n---\n";

    // 追加到做饭日志
    let logContent = fs.readFileSync(COOK_LOG_FILE, "utf-8");
    logContent += logEntry;
    fs.writeFileSync(COOK_LOG_FILE, logContent, "utf-8");

    // 更新菜谱 frontmatter（上次做、评分）
    if (category) {
      const recipeFile = path.join(RECIPES_DIR, category, `${recipeName}.md`);
      if (fs.existsSync(recipeFile)) {
        let content = fs.readFileSync(recipeFile, "utf-8");
        const updates = { 上次做: today };
        if (rating) updates["评分"] = rating;
        content = updateFrontmatter(content, updates);
        fs.writeFileSync(recipeFile, content, "utf-8");
      }
    }

    return { success: true };
  } catch (error) {
    console.error("[add-cook-log]", error);
    return { success: false, error: error.message };
  }
});

// 读取做饭日志
ipcMain.handle("get-cook-logs", (event, limit) => {
  try {
    const content = fs.readFileSync(COOK_LOG_FILE, "utf-8");
    // 解析日志条目
    const entries = [];
    const sections = content.split(/^## /m).slice(1); // 跳过标题

    for (const section of sections) {
      const lines = section.trim().split("\n");
      const date = lines[0].trim();

      // 解析子条目
      const subSections = section.split(/^### /m).slice(1);
      for (const sub of subSections) {
        const subLines = sub.trim().split("\n");
        const titleMatch = subLines[0].match(/🍳\s*(.+)（第\s*(\d+)\s*次）/);
        if (!titleMatch) continue;

        const entry = {
          date,
          recipeName: titleMatch[1],
          cookCount: parseInt(titleMatch[2]),
          rating: "",
          issues: "",
          improvements: "",
          time: "",
          feedback: "",
        };

        for (const line of subLines.slice(1)) {
          if (line.includes("**评分**")) entry.rating = line.split("：")[1]?.trim() || "";
          if (line.includes("**问题**")) entry.issues = line.split("：")[1]?.trim() || "";
          if (line.includes("**改进**")) entry.improvements = line.split("：")[1]?.trim() || "";
          if (line.includes("**耗时**")) entry.time = line.split("：")[1]?.trim() || "";
          if (line.includes("**家人反馈**")) entry.feedback = line.split("：")[1]?.trim() || "";
        }

        entries.push(entry);
      }
    }

    // 按日期倒序，限制数量
    entries.sort((a, b) => (b.date > a.date ? 1 : -1));
    return entries.slice(0, limit || 20);
  } catch (error) {
    console.error("[get-cook-logs]", error);
    return [];
  }
});

// ========== 索引同步 ==========

ipcMain.handle("sync-index", () => {
  try {
    const recipes = scanRecipes();

    // 按分类组织
    const byCategory = {};
    for (const r of recipes) {
      if (!byCategory[r.category]) byCategory[r.category] = [];
      byCategory[r.category].push(r);
    }

    // 生成索引内容
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    let indexContent = `# 菜谱索引\n\n> 自动生成于 ${timestamp}。勿手动编辑。\n\n`;

    // 保留 Dataview 查询块
    indexContent += `## Dataview 查询\n\n\`\`\`dataview\nTABLE 难度, 用时, 上次做 AS "上次做", 评分, 状态\nFROM "菜谱"\nWHERE 状态 = "已学会"\nSORT 上次做 ASC\n\`\`\`\n\n`;

    // 按分类生成表格
    for (const [cat, emoji] of Object.entries(CATEGORIES)) {
      const catRecipes = byCategory[cat] || [];
      if (catRecipes.length === 0) continue;

      indexContent += `## ${emoji} ${cat}\n\n`;
      indexContent += `| # | 菜名 | 难度 | 用时 | 上次做 | 评分 | 状态 |\n`;
      indexContent += `|---|------|------|------|--------|------|------|\n`;

      catRecipes.forEach((r, i) => {
        const time = r.cookTime ? `${r.cookTime}分钟` : "-";
        const lastCooked = r.lastCooked || "-";
        const rating = r.rating ? `${r.rating}/10` : "-";
        indexContent += `| ${i + 1} | ${r.name} | ${r.difficulty} | ${time} | ${lastCooked} | ${rating} | ${r.status} |\n`;
      });

      indexContent += "\n";
    }

    // 原子写入
    const tmpPath = INDEX_FILE + ".tmp";
    fs.writeFileSync(tmpPath, indexContent, "utf-8");
    fs.renameSync(tmpPath, INDEX_FILE);

    return { success: true, count: recipes.length };
  } catch (error) {
    console.error("[sync-index]", error);
    return { success: false, error: error.message };
  }
});

// ========== 今天吃啥 ==========

ipcMain.handle("get-recommendation", () => {
  try {
    const recipes = scanRecipes();

    // 只推荐已学会的菜谱
    const learned = recipes.filter((r) => r.status === "✅");

    // 按"上次做"日期升序排列（很久没做的排前面）
    learned.sort((a, b) => {
      // 没有上次做记录的排最前面
      if (!a.lastCooked && !b.lastCooked) return 0;
      if (!a.lastCooked) return -1;
      if (!b.lastCooked) return 1;
      return a.lastCooked < b.lastCooked ? -1 : 1;
    });

    // 返回前 10 条
    return learned.slice(0, 10);
  } catch (error) {
    console.error("[get-recommendation]", error);
    return [];
  }
});

// ========== 视频相关（保留原有功能）==========

ipcMain.handle("open-video-folder", (event, folderName) => {
  const folderPath = path.join(VIDEO_DIR, folderName);
  if (fs.existsSync(folderPath)) {
    shell.openPath(folderPath);
  }
});

ipcMain.handle("open-recipe-file", (event, filePath) => {
  const fullPath = path.join(ROOT, filePath);
  if (fs.existsSync(fullPath)) {
    shell.openPath(fullPath);
  }
});

ipcMain.handle("get-video-folder", (event, recipeName) => {
  if (!fs.existsSync(VIDEO_DIR)) return null;
  const dirs = fs.readdirSync(VIDEO_DIR);
  const match = dirs.find((d) => d.endsWith(`-${recipeName}`));
  return match || null;
});

ipcMain.handle("list-videos", (event, folderName) => {
  const folderPath = path.join(VIDEO_DIR, folderName);
  if (!fs.existsSync(folderPath)) return [];
  return fs
    .readdirSync(folderPath)
    .filter((f) => /\.(mp4|mov|avi|mkv|webm)$/i.test(f))
    .map((f) => {
      const stat = fs.statSync(path.join(folderPath, f));
      return { name: f, size: stat.size };
    });
});

ipcMain.handle("import-videos", (event, recipeName, fileNames) => {
  if (!fs.existsSync(VIDEO_DIR)) return { success: false, error: "视频素材目录不存在" };
  const dirs = fs.readdirSync(VIDEO_DIR);
  const folder = dirs.find((d) => d.endsWith(`-${recipeName}`));
  if (!folder) return { success: false, error: "未找到对应的视频文件夹" };

  const destDir = path.join(VIDEO_DIR, folder);
  const imported = [];

  for (const filePath of fileNames) {
    if (!fs.existsSync(filePath)) continue;
    const ext = path.extname(filePath);

    const existingFiles = fs.readdirSync(destDir).filter((f) => /\.(mp4|mov|avi|mkv|webm)$/i.test(f));
    const num = existingFiles.length + 1;
    const newName = `${folder}-${num}${ext}`;
    const destPath = path.join(destDir, newName);

    try {
      fs.renameSync(filePath, destPath);
    } catch (e) {
      fs.copyFileSync(filePath, destPath);
      try { fs.unlinkSync(filePath); } catch (_) {}
    }
    imported.push(newName);
  }

  return { success: true, imported, folder };
});

ipcMain.handle("open-file-dialog", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "视频文件", extensions: ["mp4", "mov", "avi", "mkv", "webm"] },
    ],
  });
  if (result.canceled) return [];
  return result.filePaths.map((p) => {
    const stat = fs.statSync(p);
    return { path: p, name: path.basename(p), size: stat.size };
  });
});

ipcMain.handle("open-video-folder-for-recipe", (event, recipeName) => {
  if (!fs.existsSync(VIDEO_DIR)) return;
  const dirs = fs.readdirSync(VIDEO_DIR);
  const folder = dirs.find((d) => d.endsWith(`-${recipeName}`));
  if (folder) {
    shell.openPath(path.join(VIDEO_DIR, folder));
  }
});

// ========== 辅助函数 ==========

function getDayNumber(dateStr) {
  const [month, day] = dateStr.split("-").map(Number);
  if (month === 7) return day;
  if (month === 8) return 31 + day;
  return 1;
}
