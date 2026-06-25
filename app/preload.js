const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // 新建菜谱
  createRecipe: (data) => ipcRenderer.invoke("create-recipe", data),

  // 获取所有菜谱列表
  listRecipes: () => ipcRenderer.invoke("list-recipes"),

  // 读取单个菜谱
  readRecipe: (filePath) => ipcRenderer.invoke("read-recipe", filePath),

  // 保存菜谱内容
  saveRecipe: (filePath, content) =>
    ipcRenderer.invoke("save-recipe", filePath, content),

  // 更新菜谱状态
  updateStatus: (category, name, status) =>
    ipcRenderer.invoke("update-status", category, name, status),

  // 删除菜谱
  deleteRecipe: (category, name) =>
    ipcRenderer.invoke("delete-recipe", category, name),

  // 获取统计信息
  getStats: () => ipcRenderer.invoke("get-stats"),

  // 打开菜谱文件
  openRecipeFile: (filePath) =>
    ipcRenderer.invoke("open-recipe-file", filePath),

  // 视频相关
  getVideoFolder: (recipeName) =>
    ipcRenderer.invoke("get-video-folder", recipeName),

  listVideos: (folderName) =>
    ipcRenderer.invoke("list-videos", folderName),

  importVideos: (recipeName, fileNames) =>
    ipcRenderer.invoke("import-videos", recipeName, fileNames),

  openVideoFolderForRecipe: (recipeName) =>
    ipcRenderer.invoke("open-video-folder-for-recipe", recipeName),

  // 打开文件对话框（返回选中的文件路径列表）
  openFileDialog: () => ipcRenderer.invoke("open-file-dialog"),

  // 做饭日志
  addCookLog: (data) => ipcRenderer.invoke("add-cook-log", data),
  getCookLogs: (limit) => ipcRenderer.invoke("get-cook-logs", limit),

  // 索引同步
  syncIndex: () => ipcRenderer.invoke("sync-index"),

  // 今天吃啥推荐
  getRecommendation: () => ipcRenderer.invoke("get-recommendation"),
});
