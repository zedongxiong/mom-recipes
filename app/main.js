const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

// 项目根目录（app 的上一级）
const ROOT = path.resolve(__dirname, "..");
const RECIPES_DIR = path.join(ROOT, "菜谱");
const VIDEO_DIR = path.join(ROOT, "视频素材");
const TEMPLATE_FILE = path.join(ROOT, "菜谱模板.md");
const README_FILE = path.join(ROOT, "README.md");

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

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});

// ========== 工具函数 ==========

// 统一路径分隔符为正斜杠（避免 Windows 反斜杠在 IPC 中出问题）
function normalizePath(p) {
  return p.replace(/\\/g, "/");
}

function getDayNumber(dateStr) {
  const [month, day] = dateStr.split("-").map(Number);
  if (month === 7) return day;
  if (month === 8) return 31 + day;
  return 1;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 扫描所有菜谱文件
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

      // 解析基本信息
      const difficultyMatch = content.match(
        /-\s*\*\*难度\*\*：(⭐+)/
      );
      const dateMatch = content.match(
        /-\s*\*学会日期\*\*：([\d-]+)/
      );
      const timeMatch = content.match(
        /-\s*\*\*用时\*\*：(\d+)\s*分钟/
      );

      // 从 README 读取状态
      const readmeContent = fs.readFileSync(README_FILE, "utf-8");
      let status = "📝";
      const statusRegex = new RegExp(
        `\\|\\s*\\d*\\s*\\|\\s*${name.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )}\\s*\\|[^|]*\\|[^|]*\\|\\s*(✅|🔄|📝)\\s*\\|`
      );
      const statusMatch = readmeContent.match(statusRegex);
      if (statusMatch) status = statusMatch[1];

      recipes.push({
        name,
        category,
        difficulty: difficultyMatch ? difficultyMatch[1] : "⭐",
        date: dateMatch ? dateMatch[1] : "",
        cookTime: timeMatch ? parseInt(timeMatch[1]) : null,
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
  const { name, category, difficulty, date, servings, cookTime } = data;

  const dateStr = date || new Date().toISOString().slice(5, 10);
  const dayNum = getDayNumber(dateStr);
  const fullDate = `2026-${dateStr}`;

  // 1. 创建视频文件夹
  const videoFolderName = `Day${String(dayNum).padStart(2, "0")}-${name}`;
  const videoFolderPath = path.join(VIDEO_DIR, videoFolderName);
  ensureDir(videoFolderPath);

  // 2. 创建菜谱文件
  const recipeDir = path.join(RECIPES_DIR, category);
  ensureDir(recipeDir);
  const recipeFile = path.join(recipeDir, `${name}.md`);

  if (fs.existsSync(recipeFile)) {
    return { success: false, error: "菜谱已存在" };
  }

  let template = fs.readFileSync(TEMPLATE_FILE, "utf-8");
  const difficultyStars = DIFFICULTY[difficulty] || "⭐";
  const timeStr = cookTime ? `${cookTime} 分钟` : "___ 分钟";

  template = template
    .replace("[菜名]", name)
    .replace(
      "肉类 / 海鲜 / 蔬菜 / 汤品 / 主食 / 凉菜 / 节日菜",
      category
    )
    .replace("⭐ / ⭐⭐ / ⭐⭐⭐", difficultyStars)
    .replace("___ 分钟", timeStr)
    .replace("___ 人份", `${servings || 2} 人份`)
    .replace("____-__-__", fullDate)
    .replace(
      "视频素材/DayXX-菜名/",
      `视频素材/${videoFolderName}/`
    );

  fs.writeFileSync(recipeFile, template, "utf-8");

  // 3. 更新 README
  updateReadme(name, category, difficulty, dateStr);

  return {
    success: true,
    videoFolder: videoFolderName,
    recipePath: normalizePath(path.relative(ROOT, recipeFile)),
  };
});

// 更新 README
function updateReadme(name, category, difficulty, dateStr) {
  let content = fs.readFileSync(README_FILE, "utf-8");
  const difficultyStars = DIFFICULTY[difficulty] || "⭐";
  const emoji = CATEGORIES[category];
  const header = `### ${emoji} ${category}`;

  const lines = content.split("\n");
  const newLines = [];
  let inTarget = false;
  let foundTable = false;
  let rowCount = 0;
  let inserted = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === header) {
      inTarget = true;
      foundTable = false;
      rowCount = 0;
      newLines.push(line);
      continue;
    }

    if (inTarget && line.includes("| # |")) {
      foundTable = true;
      newLines.push(line);
      continue;
    }

    if (inTarget && foundTable && line.includes("|---")) {
      newLines.push(line);
      continue;
    }

    if (
      inTarget &&
      foundTable &&
      line.startsWith("|") &&
      !inserted
    ) {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      if (cells.some((c) => c)) {
        rowCount++;
        newLines.push(line);
      } else {
        // 空行，插入
        newLines.push(
          `| ${rowCount + 1} | ${name} | ${difficultyStars} | ${dateStr} | ✅ |`
        );
        inserted = true;
        newLines.push(line);
      }
      continue;
    }

    if (
      inTarget &&
      line.startsWith("### ") &&
      line.trim() !== header &&
      !inserted
    ) {
      newLines.push(
        `| ${rowCount + 1} | ${name} | ${difficultyStars} | ${dateStr} | ✅ |`
      );
      inserted = true;
      inTarget = false;
    }

    newLines.push(line);
  }

  let result = newLines.join("\n");

  // 更新统计
  const match = result.match(/- \*\*已学会\*\*：(\d+) 道/);
  if (match) {
    const oldCount = parseInt(match[1]);
    result = result.replace(
      `- **已学会**：${oldCount} 道`,
      `- **已学会**：${oldCount + 1} 道`
    );
  }

  fs.writeFileSync(README_FILE, result, "utf-8");
}

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
  fs.writeFileSync(fullPath, content, "utf-8");
  return { success: true };
});

// 更新状态
ipcMain.handle("update-status", (event, category, name, status) => {
  let content = fs.readFileSync(README_FILE, "utf-8");
  const statusMap = { learned: "✅", review: "🔄", recorded: "📝" };
  const newStatus = statusMap[status] || status;

  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `(\\|\\s*\\d*\\s*\\|\\s*${escapedName}\\s*\\|[^|]*\\|[^|]*\\|)\\s*(✅|🔄|📝)\\s*(\\|)`
  );
  content = content.replace(regex, `$1 ${newStatus} $3`);

  fs.writeFileSync(README_FILE, content, "utf-8");
  return { success: true };
});

// 删除菜谱
ipcMain.handle("delete-recipe", (event, category, name) => {
  const recipeFile = path.join(RECIPES_DIR, category, `${name}.md`);
  if (fs.existsSync(recipeFile)) {
    fs.unlinkSync(recipeFile);
  }

  // 从 README 移除
  let content = fs.readFileSync(README_FILE, "utf-8");
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `\\|\\s*\\d+\\s*\\|\\s*${escapedName}\\s*\\|[^|]*\\|[^|]*\\|[^|]*\\|\\s*\n?`
  );
  content = content.replace(regex, "");

  // 更新统计
  const match = content.match(/- \*\*已学会\*\*：(\d+) 道/);
  if (match) {
    const oldCount = parseInt(match[1]);
    content = content.replace(
      `- **已学会**：${oldCount} 道`,
      `- **已学会**：${Math.max(0, oldCount - 1)} 道`
    );
  }

  fs.writeFileSync(README_FILE, content, "utf-8");
  return { success: true };
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

// 打开视频文件夹
ipcMain.handle("open-video-folder", (event, folderName) => {
  const folderPath = path.join(VIDEO_DIR, folderName);
  if (fs.existsSync(folderPath)) {
    shell.openPath(folderPath);
  }
});

// 打开菜谱文件
ipcMain.handle("open-recipe-file", (event, filePath) => {
  const fullPath = path.join(ROOT, filePath);
  if (fs.existsSync(fullPath)) {
    shell.openPath(fullPath);
  }
});

// 获取视频文件夹路径（根据菜谱名查找）
ipcMain.handle("get-video-folder", (event, recipeName) => {
  if (!fs.existsSync(VIDEO_DIR)) return null;
  const dirs = fs.readdirSync(VIDEO_DIR);
  const match = dirs.find((d) => d.endsWith(`-${recipeName}`));
  return match || null;
});

// 列出视频文件夹中的文件
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

// 导入视频文件到菜谱文件夹（移动，不是复制）
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

    // 规范化命名：DayXX-菜名-N.mp4
    const existingFiles = fs.readdirSync(destDir).filter((f) => /\.(mp4|mov|avi|mkv|webm)$/i.test(f));
    const num = existingFiles.length + 1;
    const newName = `${folder}-${num}${ext}`;
    const destPath = path.join(destDir, newName);

    // 移动文件（跨盘符时 fallback 到复制+删除）
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

// 打开文件选择对话框，返回文件信息（路径、名字、大小）
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

// 打开视频文件夹
ipcMain.handle("open-video-folder-for-recipe", (event, recipeName) => {
  if (!fs.existsSync(VIDEO_DIR)) return;
  const dirs = fs.readdirSync(VIDEO_DIR);
  const folder = dirs.find((d) => d.endsWith(`-${recipeName}`));
  if (folder) {
    shell.openPath(path.join(VIDEO_DIR, folder));
  }
});
