// ===== 全局状态 =====
let allRecipes = [];
let currentEditFile = null;
let currentRecipeName = null;
let currentFrontmatter = ""; // 保存原始 frontmatter，写回时用
let pendingVideos = []; // 待导入的视频 {path, name, size}

// 模板占位文本，解析时要忽略
const PLACEHOLDER_TEXTS = [
  "写感官信号：油面波动 / 冒烟 / 滋啦响 / 颜色变化",
  "怎么知道这步做好了",
  "没有 XX 可以用 __ 代替",
  "__ 是灵魂，去掉就不是这个味了",
  "加 __ 就变成另一种口味",
  "自己的感受、调整、心得",
  "记录家人吃了之后的评价，方便调整口味",
  "这些是菜谱上不会写、但决定成败的经验",
  "以后自己买菜要用的信息",
  "什么容易错",
  "做砸了怎么救",
  "怎么避免",
  "后果",
];

function isPlaceholder(text) {
  const t = text.trim();
  if (!t) return true;
  // 过滤模板占位文本
  if (PLACEHOLDER_TEXTS.some(p => t.includes(p))) return true;
  // 过滤纯符号/空模板
  if (/^[.\-_～~]+$/.test(t)) return true;
  if (t === "___ 分钟" || t === "____-__-__") return true;
  return false;
}

// ===== 初始化 =====
document.addEventListener("DOMContentLoaded", () => {
  initNav();
  initCreateForm();
  initEditPage();
  initFilters();
  initCookLog();
  initRecommend();
  loadHome();
});

// ===== 工具 =====
function todayStr() {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ===== 导航 =====
function initNav() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
}

function switchView(view) {
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  document.querySelector(`.nav-btn[data-view="${view}"]`)?.classList.add("active");
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById(`view-${view}`)?.classList.add("active");
  if (view === "home") loadHome();
  if (view === "list") loadList();
  if (view === "cook-log") loadCookLogs();
  if (view === "recommend") loadRecommendation();
}

// ===== 首页 =====
async function loadHome() {
  const stats = await window.api.getStats();
  const recipes = await window.api.listRecipes();
  allRecipes = recipes;

  document.getElementById("stats-cards").innerHTML = `
    <div class="stat-card"><div class="stat-number">${stats.total}</div><div class="stat-label">总菜谱</div></div>
    <div class="stat-card"><div class="stat-number">${stats.learned}</div><div class="stat-label">已学会</div></div>
    <div class="stat-card"><div class="stat-number">${stats.review}</div><div class="stat-label">复习中</div></div>
    <div class="stat-card"><div class="stat-number">${stats.recorded}</div><div class="stat-label">已记录</div></div>
  `;

  document.getElementById("stats-mini").innerHTML = `共 ${stats.total} 道菜谱<br>已学会 ${stats.learned} 道`;

  const recent = recipes.slice(-5).reverse();
  const el = document.getElementById("recent-list");

  if (recent.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🍳</div><p>还没有记录，去新建第一道菜谱吧！</p><button class="btn-primary" onclick="switchView('create')">➕ 新建菜谱</button></div>`;
    return;
  }

  el.innerHTML = recent.map(r => `
    <div class="recent-item" onclick="openEdit('${r.filePath}')">
      <span class="item-emoji">${r.emoji}</span>
      <div class="item-info"><div class="item-name">${r.name}</div><div class="item-meta">${r.category} · ${r.difficulty} · ${r.date || "未填写日期"}</div></div>
      <span class="item-status">${r.status}</span>
    </div>
  `).join("");
}

// ===== 菜谱列表 =====
async function loadList() {
  allRecipes = await window.api.listRecipes();
  renderRecipeGrid(allRecipes);
}

function renderRecipeGrid(recipes) {
  const grid = document.getElementById("recipe-grid");
  if (recipes.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📖</div><p>没有找到匹配的菜谱</p></div>`;
    return;
  }

  grid.innerHTML = recipes.map((r) => `
    <div class="recipe-card">
      <div class="card-top">
        <span class="card-emoji">${r.emoji}</span>
        <span class="card-status" data-category="${r.category}" data-name="${r.name}" title="点击切换状态">${r.status}</span>
      </div>
      <div class="card-name">${r.name}</div>
      <div class="card-meta"><span>${r.difficulty}</span><span>${r.cookTime ? r.cookTime + "分钟" : ""}</span><span>${r.date || ""}</span></div>
      <div class="card-actions">
        <button onclick="openEdit('${r.filePath}')">📝 编辑</button>
        <button class="btn-delete" onclick="deleteRecipe('${r.category}','${r.name}')">🗑️ 删除</button>
      </div>
    </div>
  `).join("");

  grid.querySelectorAll(".card-status").forEach(el => {
    el.addEventListener("click", e => { e.stopPropagation(); showStatusMenu(el, el.dataset.category, el.dataset.name); });
  });
}

function showStatusMenu(el, category, name) {
  document.querySelectorAll(".status-menu").forEach(m => m.remove());
  const rect = el.getBoundingClientRect();
  const menu = document.createElement("div");
  menu.className = "status-menu";
  menu.style.top = rect.bottom + 4 + "px";
  menu.style.left = rect.left - 60 + "px";

  [{ key: "learned", label: "✅ 已学会" }, { key: "review", label: "🔄 复习中" }, { key: "recorded", label: "📝 已记录" }].forEach(s => {
    const btn = document.createElement("button");
    btn.textContent = s.label;
    btn.addEventListener("click", async () => { await window.api.updateStatus(category, name, s.key); menu.remove(); loadList(); });
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);
  const close = e => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener("click", close); } };
  setTimeout(() => document.addEventListener("click", close), 0);
}

function initFilters() {
  const search = document.getElementById("search-input");
  const cat = document.getElementById("filter-category");
  const status = document.getElementById("filter-status");
  const apply = () => {
    let f = allRecipes;
    if (search.value.trim()) f = f.filter(r => r.name.toLowerCase().includes(search.value.trim().toLowerCase()));
    if (cat.value) f = f.filter(r => r.category === cat.value);
    if (status.value) f = f.filter(r => r.status === status.value);
    renderRecipeGrid(f);
  };
  search.addEventListener("input", apply);
  cat.addEventListener("change", apply);
  status.addEventListener("change", apply);
}

// ===== 新建菜谱 =====
function initCreateForm() {
  // 默认今天日期
  document.getElementById("recipe-date").value = todayStr();

  document.querySelectorAll("#view-create .diff-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      btn.parentElement.querySelectorAll(".diff-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  document.querySelectorAll("#view-create .num-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.target);
      target.value = Math.max(1, Math.min(20, parseInt(target.value) + parseInt(btn.dataset.delta)));
    });
  });

  document.getElementById("create-form").addEventListener("submit", async e => {
    e.preventDefault();
    const name = document.getElementById("recipe-name").value.trim();
    const category = document.getElementById("recipe-category").value;
    if (!name || !category) return;

    const btn = document.getElementById("create-btn");
    btn.disabled = true; btn.textContent = "创建中...";

    const result = await window.api.createRecipe({
      name, category,
      difficulty: parseInt(document.querySelector("#view-create .diff-btn.active").dataset.value),
      date: document.getElementById("recipe-date").value.trim() || todayStr(),
      servings: parseInt(document.getElementById("recipe-servings").value) || 2,
      cookTime: parseInt(document.getElementById("recipe-time").value) || null,
    });

    btn.disabled = false; btn.textContent = "✨ 创建菜谱";

    if (result.success) {
      showCreateResult(true, `菜谱「${name}」创建成功！`, result);
      document.getElementById("recipe-name").value = "";
      document.getElementById("recipe-time").value = "";
      document.getElementById("recipe-date").value = todayStr();
    } else {
      showCreateResult(false, result.error);
    }
  });
}

function showCreateResult(success, message, result) {
  const el = document.getElementById("create-result");
  el.style.display = "block";
  el.className = `create-result ${success ? "success" : "error"}`;
  if (success) {
    el.innerHTML = `
      <h4>✅ ${message}</h4>
      <div class="result-detail">📁 视频文件夹：<code>视频素材/${result.videoFolder}/</code></div>
      <div style="display:flex;gap:10px;">
        <button class="btn-primary" onclick="openEdit('${result.recipePath}')">📝 去编辑菜谱</button>
        <button class="btn-secondary" onclick="switchView('list')">📖 查看列表</button>
      </div>`;
  } else {
    el.innerHTML = `<h4>❌ ${message}</h4>`;
  }
}

// ===== 编辑菜谱 =====

function initEditPage() {
  document.getElementById("edit-back").addEventListener("click", () => switchView("list"));
  document.getElementById("edit-save").addEventListener("click", saveRecipe);

  // 难度按钮
  document.querySelectorAll("#edit-difficulty .diff-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      btn.parentElement.querySelectorAll(".diff-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  // 添加按钮
  document.querySelectorAll(".btn-add").forEach(btn => {
    btn.addEventListener("click", () => {
      const listId = btn.dataset.list;
      if (listId === "edit-steps") addStep();
      else if (listId === "edit-mistakes") addMistake();
      else addListRow(listId);
    });
  });

  // 视频上传 — 用 Electron 原生对话框选择文件
  document.getElementById("video-upload-btn").addEventListener("click", async () => {
    const files = await window.api.openFileDialog();
    if (!files || !files.length) return;

    for (const f of files) {
      if (pendingVideos.find(v => v.path === f.path)) continue;
      pendingVideos.push({ path: f.path, name: f.name, size: f.size });
    }
    loadVideoList(currentRecipeName);
  });
}

async function openEdit(filePath) {
  currentEditFile = filePath;
  pendingVideos = []; // 清空待导入列表
  const result = await window.api.readRecipe(filePath);
  if (!result.success) { alert("无法读取文件：" + result.error); return; }

  const data = parseMarkdown(result.content);
  currentRecipeName = data.name;

  populateEditForm(data);
  document.getElementById("edit-title").textContent = `${data.emoji} ${data.name}`;

  // 加载视频列表
  loadVideoList(data.name);

  switchView("edit");
}

async function loadVideoList(recipeName) {
  const folder = await window.api.getVideoFolder(recipeName);
  let existingVideos = [];

  if (folder) {
    existingVideos = await window.api.listVideos(folder);
  }

  renderVideoList(existingVideos, folder);
}

function renderVideoList(existingVideos, folder) {
  const listEl = document.getElementById("edit-video-list");
  let html = "";

  // 待保存的视频（橙色标记）
  if (pendingVideos.length) {
    html += pendingVideos.map((v, i) => {
      const sizeMB = (v.size / 1024 / 1024).toFixed(1);
      return `<div class="video-item" style="border-left:3px solid var(--accent);">
        <span class="video-icon">📹</span>
        <span class="video-name">${v.name}</span>
        <span class="video-size">${sizeMB} MB</span>
        <span style="font-size:12px;color:var(--accent);">待保存</span>
        <button class="btn-remove" title="移除" onclick="removePendingVideo(${i})">×</button>
      </div>`;
    }).join("");
  }

  // 已有的视频
  if (existingVideos && existingVideos.length) {
    html += existingVideos.map(v => {
      const sizeMB = (v.size / 1024 / 1024).toFixed(1);
      return `<div class="video-item">
        <span class="video-icon">🎬</span>
        <span class="video-name">${v.name}</span>
        <span class="video-size">${sizeMB} MB</span>
        <button class="btn-remove" title="打开文件夹" onclick="openVideoFolder()">📂</button>
      </div>`;
    }).join("");
  }

  if (!html) {
    html = `<div style="font-size:13px;color:var(--text-light);padding:8px 0;">还没有视频，点击下方选择文件</div>`;
  }

  listEl.innerHTML = html;
}

async function openVideoFolder() {
  if (currentRecipeName) await window.api.openVideoFolderForRecipe(currentRecipeName);
}

function removePendingVideo(index) {
  pendingVideos.splice(index, 1);
  loadVideoList(currentRecipeName);
}

// ===== Markdown 解析 =====

function parseMarkdown(md) {
  const data = {
    name: "", category: "", emoji: "", difficulty: 1, time: "", servings: "2",
    ingredients: [], seasonings: [], steps: [], tips: [], shopping: [],
    mistakes: [], substitute: "", essential: "", variety: "", notes: "", feedback: "",
  };

  // 提取并保存原始 frontmatter
  const fmMatch = md.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  currentFrontmatter = fmMatch ? fmMatch[0] : "";

  // 跳过 frontmatter 解析正文
  const bodyMd = fmMatch ? md.slice(fmMatch[0].length) : md;

  const titleMatch = bodyMd.match(/^#\s+(.+)/m);
  if (titleMatch) data.name = titleMatch[1].trim();

  const catMatch = bodyMd.match(/-\s*\*\*分类\*\*：(.+)/);
  if (catMatch) {
    data.category = catMatch[1].trim();
    const catMap = { 炒: "🍳", 炖煮: "🍲", 蒸: "♨️", 煎炸: "🫕", 凉拌: "🥗", 汤: "🥣", 烤: "🔥", 腌卤: "🧂", 主食: "🍚" };
    data.emoji = catMap[data.category] || "";
  }

  const diffMatch = bodyMd.match(/-\s*\*\*难度\*\*：(⭐+)/);
  if (diffMatch) data.difficulty = diffMatch[1].length <= 1 ? 1 : diffMatch[1].length === 2 ? 2 : 3;

  const timeMatch = bodyMd.match(/-\s*\*\*用时\*\*：(\d+)/);
  if (timeMatch) data.time = timeMatch[1];

  const servMatch = bodyMd.match(/-\s*\*\*份量\*\*：(\d+)/);
  if (servMatch) data.servings = servMatch[1];

  let section = "";
  let stepData = null;

  const lines = bodyMd.split("\n");
  for (const line of lines) {
    const t = line.trim();

    if (t === "## 食材") { section = "ingredients"; continue; }
    if (t === "## 调料") { section = "seasonings"; continue; }
    if (t.startsWith("## 步骤")) { section = "steps"; continue; }
    if (t === "## 妈妈的秘诀") { section = "tips"; continue; }
    if (t === "## 食材选择") { section = "shopping"; continue; }
    if (t.startsWith("## 易错点")) { section = "mistakes"; continue; }
    if (t === "## 灵活空间") { section = "flex"; continue; }
    if (t === "## 我的记录") { section = "notes"; continue; }
    if (t === "## 家人的反馈") { section = "feedback"; continue; }

    if (t.startsWith("## ") && section) {
      if (stepData) { data.steps.push(stepData); stepData = null; }
    }

    if (section === "ingredients" || section === "seasonings") {
      if (t.startsWith("|") && !t.includes("---") && !t.includes("食材") && !t.includes("调料") && !t.includes("用量")) {
        const cells = t.split("|").slice(1, -1).map(c => c.trim());
        if (cells[0]) data[section].push({ name: cells[0], amount: cells[1] || "", note: cells[2] || "" });
      }
    }

    if (section === "steps") {
      if (t.startsWith("### 步骤")) {
        if (stepData) data.steps.push(stepData);
        stepData = { action: "", heat: "", time: "", judge: "" };
      } else if (stepData) {
        if (t.startsWith("- **做什么**：")) {
          const val = t.replace("- **做什么**：", "").trim();
          stepData.action = isPlaceholder(val) ? "" : val;
        } else if (t.startsWith("- **火候**：")) {
          const val = t.replace("- **火候**：", "").trim();
          stepData.heat = isPlaceholder(val) ? "" : val;
        } else if (t.startsWith("- **时长**：")) {
          const val = t.replace("- **时长**：", "").trim();
          stepData.time = isPlaceholder(val) ? "" : val;
        } else if (t.startsWith("- **判断标准**：")) {
          const val = t.replace("- **判断标准**：", "").trim();
          stepData.judge = isPlaceholder(val) ? "" : val;
        }
      }
    }

    if (section === "tips" || section === "shopping") {
      if (t.startsWith("- ") && !t.startsWith("- **")) {
        const val = t.slice(2).trim();
        if (!isPlaceholder(val)) data[section].push(val);
      }
    }

    if (section === "mistakes") {
      if (t.startsWith("|") && !t.includes("---") && !t.includes("易错点") && !t.includes("后果")) {
        const cells = t.split("|").slice(1, -1).map(c => c.trim());
        if (cells[0] && !isPlaceholder(cells[0])) {
          data.mistakes.push({
            what: cells[0],
            result: isPlaceholder(cells[1]) ? "" : cells[1],
            avoid: isPlaceholder(cells[2]) ? "" : cells[2],
            fix: isPlaceholder(cells[3]) ? "" : cells[3],
          });
        }
      }
    }

    if (section === "flex") {
      if (t.startsWith("- **可以替换的**：")) {
        const val = t.replace("- **可以替换的**：", "").trim();
        data.substitute = isPlaceholder(val) ? "" : val;
      }
      if (t.startsWith("- **不能省的**：")) {
        const val = t.replace("- **不能省的**：", "").trim();
        data.essential = isPlaceholder(val) ? "" : val;
      }
      if (t.startsWith("- **可以加的**：")) {
        const val = t.replace("- **可以加的**：", "").trim();
        data.variety = isPlaceholder(val) ? "" : val;
      }
    }

    if (section === "notes" && !t.startsWith("#") && !t.startsWith("|") && !t.startsWith("---") && t) {
      const val = (t.startsWith("- ") ? t.slice(2) : t).trim();
      if (!isPlaceholder(val)) data.notes += val + "\n";
    }

    if (section === "feedback" && !t.startsWith("#") && !t.startsWith("|") && !t.startsWith("---") && t) {
      const val = (t.startsWith("- ") ? t.slice(2) : t).trim();
      if (!isPlaceholder(val)) data.feedback += val + "\n";
    }
  }

  if (stepData) data.steps.push(stepData);
  data.notes = data.notes.trim();
  data.feedback = data.feedback.trim();
  return data;
}

// ===== 填充编辑表单 =====

function populateEditForm(data) {
  document.getElementById("edit-category").value = data.category;
  document.getElementById("edit-time").value = data.time;
  document.getElementById("edit-servings").value = data.servings || "2";

  document.querySelectorAll("#edit-difficulty .diff-btn").forEach(b => {
    b.classList.toggle("active", parseInt(b.dataset.value) === data.difficulty);
  });

  // 食材
  const ingEl = document.getElementById("edit-ingredients");
  ingEl.innerHTML = "";
  const ingredients = data.ingredients.length ? data.ingredients : [{ name: "", amount: "", note: "" }];
  ingredients.forEach(item => addListRow("edit-ingredients", item));

  // 调料
  const seasEl = document.getElementById("edit-seasonings");
  seasEl.innerHTML = "";
  const seasonings = data.seasonings.length ? data.seasonings : [{ name: "", amount: "", note: "" }];
  seasonings.forEach(item => addListRow("edit-seasonings", item));

  // 步骤
  const stepsEl = document.getElementById("edit-steps");
  stepsEl.innerHTML = "";
  const steps = data.steps.length ? data.steps : [{ action: "", heat: "", time: "", judge: "" }];
  steps.forEach(s => addStep(s));

  // 秘诀
  const tipsEl = document.getElementById("edit-tips");
  tipsEl.innerHTML = "";
  if (data.tips.length) data.tips.forEach(t => addListRow("edit-tips", { value: t }));
  else addListRow("edit-tips", { value: "" });

  // 食材选择
  const shopEl = document.getElementById("edit-shopping");
  shopEl.innerHTML = "";
  if (data.shopping.length) data.shopping.forEach(s => addListRow("edit-shopping", { value: s }));
  else addListRow("edit-shopping", { value: "" });

  // 易错点
  const mistEl = document.getElementById("edit-mistakes");
  mistEl.innerHTML = "";
  if (data.mistakes.length) data.mistakes.forEach(m => addMistake(m));
  else addMistake({ what: "", result: "", avoid: "", fix: "" });

  // 灵活空间
  document.getElementById("edit-substitute").value = data.substitute;
  document.getElementById("edit-essential").value = data.essential;
  document.getElementById("edit-variety").value = data.variety;

  // 笔记
  document.getElementById("edit-notes").value = data.notes;
  document.getElementById("edit-feedback").value = data.feedback;
}

// ===== 动态行添加 =====

function addListRow(listId, data = {}) {
  const container = document.getElementById(listId);
  const row = document.createElement("div");
  row.className = "list-row";

  if (listId === "edit-ingredients" || listId === "edit-seasonings") {
    row.innerHTML = `
      <input type="text" placeholder="${listId === 'edit-ingredients' ? '食材名' : '调料名'}" value="${data.name || ""}" />
      <input type="text" placeholder="用量" value="${data.amount || ""}" style="flex:0.5" />
      <input type="text" placeholder="备注" value="${data.note || ""}" style="flex:0.8" />
      <button class="btn-remove" title="删除">×</button>
    `;
  } else {
    // 秘诀 / 食材选择 — data.value 或 data 本身
    const val = typeof data === "string" ? data : (data.value || data.name || "");
    row.innerHTML = `
      <input type="text" placeholder="${listId === 'edit-tips' ? '一条秘诀...' : '买菜要注意...'}" value="${val}" />
      <button class="btn-remove" title="删除">×</button>
    `;
  }

  row.querySelector(".btn-remove").addEventListener("click", () => row.remove());
  container.appendChild(row);
}

function addStep(data = {}) {
  const container = document.getElementById("edit-steps");
  const num = container.children.length + 1;
  const card = document.createElement("div");
  card.className = "step-card";
  card.innerHTML = `
    <div class="step-header">
      <span class="step-number">步骤 ${num}</span>
      <button class="btn-remove" title="删除">×</button>
    </div>
    <textarea placeholder="做什么...">${data.action || ""}</textarea>
    <div class="step-meta">
      <input type="text" placeholder="🔥 火候（如：油面冒烟、滋啦响）" value="${data.heat || ""}" />
      <input type="text" placeholder="⏱️ 时长" value="${data.time || ""}" />
      <input type="text" placeholder="✅ 判断标准（怎么知道做好了）" value="${data.judge || ""}" style="grid-column:1/-1" />
    </div>
  `;

  card.querySelector(".btn-remove").addEventListener("click", () => {
    card.remove();
    document.querySelectorAll("#edit-steps .step-card").forEach((c, i) => {
      c.querySelector(".step-number").textContent = `步骤 ${i + 1}`;
    });
  });

  container.appendChild(card);
}

function addMistake(data = {}) {
  const container = document.getElementById("edit-mistakes");
  const card = document.createElement("div");
  card.className = "mistake-card";
  card.innerHTML = `
    <div class="mistake-header">
      <span style="font-weight:600;font-size:14px;">⚠️ 易错点</span>
      <button class="btn-remove" title="删除">×</button>
    </div>
    <div class="mistake-fields">
      <input type="text" placeholder="什么容易错" value="${data.what || ""}" />
      <input type="text" placeholder="后果" value="${data.result || ""}" />
      <input type="text" placeholder="怎么避免" value="${data.avoid || ""}" />
      <input type="text" placeholder="做砸了怎么救" value="${data.fix || ""}" />
    </div>
  `;
  card.querySelector(".btn-remove").addEventListener("click", () => card.remove());
  container.appendChild(card);
}

// ===== 保存：表单 → Markdown =====

function collectFormData() {
  const data = {
    name: document.getElementById("edit-title").textContent.replace(/^[^\s]+\s/, ""),
    category: document.getElementById("edit-category").value,
    difficulty: parseInt(document.querySelector("#edit-difficulty .diff-btn.active")?.dataset.value || 1),
    time: document.getElementById("edit-time").value,
    servings: document.getElementById("edit-servings").value,
    ingredients: [],
    seasonings: [],
    steps: [],
    tips: [],
    shopping: [],
    mistakes: [],
    substitute: document.getElementById("edit-substitute").value,
    essential: document.getElementById("edit-essential").value,
    variety: document.getElementById("edit-variety").value,
    notes: document.getElementById("edit-notes").value,
    feedback: document.getElementById("edit-feedback").value,
  };

  document.querySelectorAll("#edit-ingredients .list-row").forEach(row => {
    const inputs = row.querySelectorAll("input");
    if (inputs[0].value.trim()) data.ingredients.push({ name: inputs[0].value.trim(), amount: inputs[1].value.trim(), note: inputs[2].value.trim() });
  });

  document.querySelectorAll("#edit-seasonings .list-row").forEach(row => {
    const inputs = row.querySelectorAll("input");
    if (inputs[0].value.trim()) data.seasonings.push({ name: inputs[0].value.trim(), amount: inputs[1].value.trim(), note: inputs[2].value.trim() });
  });

  document.querySelectorAll("#edit-steps .step-card").forEach(card => {
    const ta = card.querySelector("textarea");
    const inputs = card.querySelectorAll(".step-meta input");
    data.steps.push({ action: ta.value.trim(), heat: inputs[0].value.trim(), time: inputs[1].value.trim(), judge: inputs[2].value.trim() });
  });

  document.querySelectorAll("#edit-tips .list-row input").forEach(inp => {
    if (inp.value.trim()) data.tips.push(inp.value.trim());
  });

  document.querySelectorAll("#edit-shopping .list-row input").forEach(inp => {
    if (inp.value.trim()) data.shopping.push(inp.value.trim());
  });

  document.querySelectorAll("#edit-mistakes .mistake-card").forEach(card => {
    const inputs = card.querySelectorAll("input");
    if (inputs[0].value.trim()) data.mistakes.push({ what: inputs[0].value.trim(), result: inputs[1].value.trim(), avoid: inputs[2].value.trim(), fix: inputs[3].value.trim() });
  });

  return data;
}

function toMarkdown(data) {
  const diffStars = { 1: "⭐", 2: "⭐⭐", 3: "⭐⭐⭐" };
  let md = "";

  // 保留原始 frontmatter
  if (currentFrontmatter) {
    md += currentFrontmatter;
    if (!currentFrontmatter.endsWith("\n\n")) {
      if (currentFrontmatter.endsWith("\n")) md += "\n";
      else md += "\n\n";
    }
  }

  md += `# ${data.name}\n\n`;
  md += `## 基本信息\n\n`;
  md += `- **分类**：${data.category}\n`;
  md += `- **难度**：${diffStars[data.difficulty]}\n`;
  md += `- **用时**：${data.time ? data.time + " 分钟" : ""}\n`;
  md += `- **份量**：${data.servings || 2} 人份\n\n`;

  md += `## 食材\n\n`;
  if (data.ingredients.length) {
    md += `| 食材 | 用量 | 备注 |\n|------|------|------|\n`;
    data.ingredients.forEach(i => md += `| ${i.name} | ${i.amount} | ${i.note} |\n`);
  }
  md += "\n";

  md += `## 调料\n\n`;
  if (data.seasonings.length) {
    md += `| 调料 | 用量 | 备注 |\n|------|------|------|\n`;
    data.seasonings.forEach(s => md += `| ${s.name} | ${s.amount} | ${s.note} |\n`);
  }
  md += "\n";

  md += `## 步骤\n\n`;
  data.steps.forEach((s, i) => {
    md += `### 步骤 ${i + 1}\n\n`;
    md += `- **做什么**：${s.action}\n`;
    if (s.heat) md += `- **火候**：${s.heat}\n`;
    if (s.time) md += `- **时长**：${s.time}\n`;
    if (s.judge) md += `- **判断标准**：${s.judge}\n`;
    md += "\n";
  });

  md += `## 妈妈的秘诀\n\n`;
  data.tips.forEach(t => md += `- ${t}\n`);
  md += "\n";

  md += `## 食材选择\n\n`;
  data.shopping.forEach(s => md += `- ${s}\n`);
  md += "\n";

  md += `## 易错点 & 补救\n\n`;
  if (data.mistakes.length) {
    md += `| 易错点 | 后果 | 怎么避免 | 做砸了怎么救 |\n|--------|------|---------|-------------|\n`;
    data.mistakes.forEach(m => md += `| ${m.what} | ${m.result} | ${m.avoid} | ${m.fix} |\n`);
  }
  md += "\n";

  md += `## 灵活空间\n\n`;
  if (data.substitute) md += `- **可以替换的**：${data.substitute}\n`;
  if (data.essential) md += `- **不能省的**：${data.essential}\n`;
  if (data.variety) md += `- **可以加的**：${data.variety}\n`;
  md += "\n";

  md += `## 我的记录\n\n`;
  if (data.notes) data.notes.split("\n").forEach(l => { if (l.trim()) md += `- ${l.trim()}\n`; });
  md += "\n";

  md += `## 家人的反馈\n\n`;
  if (data.feedback) data.feedback.split("\n").forEach(l => { if (l.trim()) md += `- ${l.trim()}\n`; });
  md += "\n";

  return md;
}

async function saveRecipe() {
  if (!currentEditFile) return;
  const data = collectFormData();

  // 同步更新 frontmatter 中的字段
  const diffStars = { 1: "⭐", 2: "⭐⭐", 3: "⭐⭐⭐" };
  if (currentFrontmatter) {
    currentFrontmatter = currentFrontmatter
      .replace(/(难度:).*/, `$1 ${diffStars[data.difficulty]}`)
      .replace(/(分类:).*/, `$1 ${data.category}`)
      .replace(/(用时:).*/, `$1 ${data.time || ""}`)
      .replace(/(份量:).*/, `$1 ${data.servings || 2}`);
  }

  const md = toMarkdown(data);
  const result = await window.api.saveRecipe(currentEditFile, md);

  if (!result.success) return;

  // 有待导入的视频 → 移动并重命名
  if (pendingVideos.length > 0 && currentRecipeName) {
    const paths = pendingVideos.map(v => v.path);
    const importResult = await window.api.importVideos(currentRecipeName, paths);

    if (importResult.success) {
      pendingVideos = [];
      loadVideoList(currentRecipeName);
    } else {
      alert("视频导入失败：" + importResult.error);
    }
  }

  const btn = document.getElementById("edit-save");
  btn.textContent = "✅ 已保存";
  setTimeout(() => { btn.textContent = "💾 保存"; }, 1500);
}

async function deleteRecipe(category, name) {
  if (!confirm(`确定要删除「${name}」吗？`)) return;
  await window.api.deleteRecipe(category, name);
  loadList();
}

document.addEventListener("keydown", e => {
  if (e.ctrlKey && e.key === "s") {
    if (document.getElementById("view-edit").classList.contains("active")) {
      e.preventDefault();
      saveRecipe();
    }
  }
});

// ===== 做饭日志 =====

function initCookLog() {
  // 显示/隐藏记录表单
  document.getElementById("add-log-btn").addEventListener("click", () => {
    const form = document.getElementById("log-form");
    form.style.display = form.style.display === "none" ? "block" : "none";
    if (form.style.display === "block") {
      loadRecipeOptions();
    }
  });

  document.getElementById("cancel-log-btn").addEventListener("click", () => {
    document.getElementById("log-form").style.display = "none";
  });

  // 保存日志
  document.getElementById("save-log-btn").addEventListener("click", saveCookLog);
}

async function loadRecipeOptions() {
  const recipes = await window.api.listRecipes();
  const select = document.getElementById("log-recipe");
  select.innerHTML = '<option value="">选择菜谱</option>';

  // 只显示已学会和复习中的
  const available = recipes.filter(r => r.status === "✅" || r.status === "🔄");
  for (const r of available) {
    const opt = document.createElement("option");
    opt.value = `${r.category}|${r.name}`;
    opt.textContent = `${r.emoji} ${r.name}`;
    select.appendChild(opt);
  }
}

async function saveCookLog() {
  const recipeValue = document.getElementById("log-recipe").value;
  if (!recipeValue) {
    alert("请选择菜谱");
    return;
  }

  const [category, recipeName] = recipeValue.split("|");
  const rating = parseInt(document.getElementById("log-rating").value) || 7;
  const issues = document.getElementById("log-issues").value.trim();
  const improvements = document.getElementById("log-improvements").value.trim();
  const time = document.getElementById("log-time").value.trim();
  const feedback = document.getElementById("log-feedback").value.trim();

  // 计算第几次做
  const logs = await window.api.getCookLogs(100);
  const existingLogs = logs.filter(l => l.recipeName === recipeName);
  const cookCount = existingLogs.length + 1;

  const result = await window.api.addCookLog({
    recipeName, category, rating, issues, improvements, time, feedback, cookCount
  });

  if (result.success) {
    // 清空表单
    document.getElementById("log-recipe").value = "";
    document.getElementById("log-rating").value = "7";
    document.getElementById("log-issues").value = "";
    document.getElementById("log-improvements").value = "";
    document.getElementById("log-time").value = "";
    document.getElementById("log-feedback").value = "";
    document.getElementById("log-form").style.display = "none";

    // 刷新日志列表
    loadCookLogs();
  } else {
    alert("保存失败：" + result.error);
  }
}

async function loadCookLogs() {
  const logs = await window.api.getCookLogs(20);
  const listEl = document.getElementById("log-list");

  if (logs.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <p>还没有做饭记录，点击上方按钮开始记录吧！</p>
      </div>`;
    return;
  }

  listEl.innerHTML = logs.map(log => `
    <div class="log-item">
      <div class="log-date">${log.date}</div>
      <div class="log-content">
        <div class="log-title">🍳 ${log.recipeName}（第 ${log.cookCount} 次）</div>
        <div class="log-details">
          <span class="log-rating">评分：${log.rating}/10</span>
          ${log.issues ? `<span class="log-issues">问题：${log.issues}</span>` : ""}
          ${log.improvements ? `<span class="log-improve">改进：${log.improvements}</span>` : ""}
          ${log.time ? `<span class="log-time">耗时：${log.time}</span>` : ""}
          ${log.feedback ? `<span class="log-feedback">反馈：${log.feedback}</span>` : ""}
        </div>
      </div>
    </div>
  `).join("");
}

// ===== 今天吃啥 =====

function initRecommend() {
  document.getElementById("refresh-recommend").addEventListener("click", loadRecommendation);
}

async function loadRecommendation() {
  const recipes = await window.api.getRecommendation();
  const grid = document.getElementById("recommend-grid");

  if (recipes.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">🎲</div>
        <p>还没有已学会的菜谱，先去学习几道菜吧！</p>
        <button class="btn-primary" onclick="switchView('list')">📖 查看菜谱</button>
      </div>`;
    return;
  }

  grid.innerHTML = recipes.map(r => `
    <div class="recommend-card">
      <div class="card-top">
        <span class="card-emoji">${r.emoji}</span>
        <span class="card-difficulty">${r.difficulty}</span>
      </div>
      <div class="card-name">${r.name}</div>
      <div class="card-meta">
        <span>${r.cookTime ? r.cookTime + "分钟" : "未填用时"}</span>
        <span>${r.lastCooked ? "上次：" + r.lastCooked : "还没做过"}</span>
        <span>${r.rating ? r.rating + "/10" : "未评分"}</span>
      </div>
      <button class="btn-cook" onclick="startCook('${r.category}','${r.name}')">🍳 就做这个！</button>
    </div>
  `).join("");
}

async function startCook(category, name) {
  // 跳转到做饭日志并预选菜谱
  switchView("cook-log");
  document.getElementById("log-form").style.display = "block";
  await loadRecipeOptions();
  document.getElementById("log-recipe").value = `${category}|${name}`;
}
