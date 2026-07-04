const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');
const { spawn } = require('child_process');

const HOST = '127.0.0.1';
const PORT = 18321;
const BASE_CONSOLE_LOG = console.log.bind(console);
const BASE_CONSOLE_ERROR = console.error.bind(console);
const SOURCE_DIR = __dirname;
const IS_ELECTRON = !!(process.versions && process.versions.electron);
const RUNTIME_DIR = process.env.LANDWU_RUNTIME_DIR || (process.pkg ? path.dirname(process.execPath) : SOURCE_DIR);
const PUBLIC_DIR = path.join(SOURCE_DIR, 'ui');
const STEP1_SCRIPT = process.pkg ? '__internal_step1__' : path.join(SOURCE_DIR, 'step1-gallery-upload-api-v1.js');
const STEP2_SCRIPT = process.pkg ? '__internal_step2__' : path.join(SOURCE_DIR, 'step2-batch-design-api-v1.js');
const STEP3_SCRIPT = process.pkg ? '__internal_step3__' : path.join(SOURCE_DIR, 'step3-temu-export-api-v1.js');
const AUTH_FILE = path.join(RUNTIME_DIR, 'auth-state-v1.json');
const REPORTS_DIR = path.join(RUNTIME_DIR, 'reports');

const state = {
  appName: '领物TEMU上传器',
  version: 'v2.1.7',
  running: false,
  stopRequested: false,
  currentTask: null,
  logs: [],
  lastResult: null,
  child: null,
  auth: loadAuth(),
};

function loadAuth() {
  try {
    if (!fs.existsSync(AUTH_FILE)) return null;
    return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveAuth(auth) {
  fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2), 'utf8');
}

function clearAuthFile() {
  if (fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE);
}

function log(message, extra = null) {
  const item = {
    time: new Date().toLocaleString('zh-CN', { hour12: false }),
    message,
    extra,
  };
  state.logs.push(item);
  if (state.logs.length > 300) state.logs.shift();
  const prefix = `[${item.time}] ${message}`;
  if (extra == null) {
    BASE_CONSOLE_LOG(prefix);
  } else {
    BASE_CONSOLE_LOG(prefix, extra);
  }
  return item;
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const typeMap = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
  };
  const contentType = typeMap[ext] || 'application/octet-stream';
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    res.writeHead(404);
    res.end('Not Found');
  });
  res.writeHead(200, { 'Content-Type': contentType });
  stream.pipe(res);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) {
        reject(new Error('请求体过大'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('JSON 解析失败'));
      }
    });
    req.on('error', reject);
  });
}

function countImages(folderPath) {
  const files = fs.readdirSync(folderPath, { withFileTypes: true });
  return files.filter((entry) => entry.isFile() && /\.(png|jpe?g|svg)$/i.test(entry.name)).length;
}

function normalizeFolderPath(value) {
  let text = String(value || '').trim();
  if (!text) return '';
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

function buildTag() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function buildTimestampMinute() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function sanitizeName(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

function buildReportFile(stepKey, payload) {
  const hash = crypto.createHash('md5').update(JSON.stringify(payload)).digest('hex').slice(0, 10);
  const parts = [
    stepKey,
    sanitizeName(payload.tag),
    sanitizeName(payload.folderPath || payload.shopName || payload.templateName || 'task'),
    hash,
  ].filter(Boolean);
  return path.join(REPORTS_DIR, `${parts.join('-')}.json`);
}

function readJsonFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonFile(filePath, data) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function buildUploadedMarkedPath(folderPath) {
  const marker = '（已上传图库）';
  const parentDir = path.dirname(folderPath);
  const baseName = path.basename(folderPath);
  if (baseName.includes('（已上传图库')) {
    return { targetPath: folderPath, alreadyMarked: true };
  }

  const targetBaseName = `${baseName}${marker}`;
  let targetPath = path.join(parentDir, targetBaseName);
  if (!fs.existsSync(targetPath)) {
    return { targetPath, alreadyMarked: false };
  }

  const timestamp = buildTimestampMinute();
  targetPath = path.join(parentDir, `${baseName}（已上传图库_${timestamp}）`);
  let index = 1;
  while (fs.existsSync(targetPath)) {
    targetPath = path.join(parentDir, `${baseName}（已上传图库_${timestamp}_${index}）`);
    index += 1;
  }
  return { targetPath, alreadyMarked: false };
}

function buildAuthSummary(auth) {
  if (!auth || !auth.token) {
    return {
      ready: false,
      source: '',
      username: '',
      companyName: '',
      factoryId: '',
      masterFactoryId: '',
      syncedAt: '',
    };
  }
  return {
    ready: true,
    source: auth.source || 'manual',
    username: auth.username || '',
    companyName: auth.companyName || '',
    factoryId: auth.factoryId || '',
    masterFactoryId: auth.masterFactoryId || '',
    syncedAt: auth.syncedAt || '',
  };
}

function normalizeAuthPayload(payload) {
  const token = String(payload.token || '').trim();
  const factoryId = String(payload.factoryId || '').trim();
  const masterFactoryId = String(payload.masterFactoryId || '').trim() || (factoryId ? `6${factoryId}` : '');
  const session = String(payload.session || '').trim();

  if (!token) throw new Error('缺少 token');
  if (!factoryId) throw new Error('缺少 factoryId');

  return {
    token,
    session,
    factoryId,
    masterFactoryId,
    username: String(payload.username || '').trim(),
    companyName: String(payload.companyName || '').trim(),
    source: String(payload.source || 'manual').trim(),
    syncedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  };
}

function ensureAuthReady() {
  if (!state.auth || !state.auth.token) {
    throw new Error('请先同步网页登录态或手动保存鉴权');
  }
}

function validateTaskInput(payload) {
  const folderPath = normalizeFolderPath(payload.folderPath);
  const tag = String(payload.tag || '').trim() || buildTag();
  let shopName = String(payload.shopName || '').trim();
  const designTemplateName = String(payload.designTemplateName || payload.templateName || '').trim();
  const exportTemplateName = String(payload.exportTemplateName || '').trim();
  const shopNames = Array.isArray(payload.shopNames)
    ? payload.shopNames.map((item) => String(item || '').trim()).filter(Boolean)
    : String(payload.shopNames || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
  if (!shopName && shopNames.length) {
    shopName = shopNames[0];
  }

  if (!folderPath) throw new Error('请先选择图片文件夹');
  if (!fs.existsSync(folderPath)) throw new Error('图片文件夹不存在');
  if (!fs.statSync(folderPath).isDirectory()) throw new Error('填写的路径不是文件夹');
  ensureAuthReady();

  const imageCount = countImages(folderPath);
  if (imageCount <= 0) throw new Error('文件夹里没有可上传图片');

  return { folderPath, tag, imageCount, shopName, shopNames, designTemplateName, exportTemplateName };
}

function validateStep2Input(payload) {
  const tag = String(payload.tag || '').trim();
  const templateName = String(payload.templateName || '').trim();
  const autoAssociation = Number(payload.autoAssociation) || 1;
  const maximizeDesign = payload.maximizeDesign === true || String(payload.maximizeDesign || '') === 'true';
  if (!tag) throw new Error('请先填写第二步标签');
  if (!templateName) throw new Error('请先填写公版名称');
  ensureAuthReady();
  return { tag, templateName, autoAssociation, maximizeDesign };
}

function validateStep3Input(payload) {
  const tag = String(payload.tag || '').trim();
  const shopName = String(payload.shopName || '').trim();
  const templateName = String(payload.templateName || '').trim();
  const skc = String(payload.skc || '').trim();
  if (!tag) throw new Error('请先填写第三步标签');
  if (!shopName) throw new Error('请先选择店铺');
  if (!templateName) throw new Error('请先选择模板');
  ensureAuthReady();
  return { tag, shopName, templateName, skc };
}

function validatePipelineInput(payload) {
  const steps = Array.isArray(payload.steps) ? payload.steps.map((item) => String(item)) : [];
  if (!steps.length) throw new Error('请至少选择一个步骤');

  const uniqueSteps = [...new Set(steps)].filter((item) => ['step1', 'step2', 'step3'].includes(item));
  if (!uniqueSteps.length) throw new Error('步骤参数无效');

  const task = {
    stepsSelected: uniqueSteps,
    steps: {
      step1: 'pending',
      step2: 'pending',
      step3: 'pending',
    },
  };

  let generatedTag = String(payload.tag || '').trim();

  if (uniqueSteps.includes('step1')) {
    const step1Task = validateTaskInput(payload);
    Object.assign(task, step1Task);
    generatedTag = step1Task.tag;
  }

  if (uniqueSteps.includes('step2')) {
    const step2Task = validateStep2Input({
      tag: generatedTag || payload.tag,
      templateName: payload.designTemplateName || payload.templateName,
      autoAssociation: 1,
      maximizeDesign: payload.maximizeDesign,
    });
    task.tag = step2Task.tag;
    task.designTemplateName = step2Task.templateName;
    task.maximizeDesign = step2Task.maximizeDesign;
  }

  if (uniqueSteps.includes('step3')) {
    const step3Task = validateStep3Input({
      tag: generatedTag || payload.tag,
      shopName: payload.shopName,
      templateName: payload.exportTemplateName || payload.templateName,
      skc: payload.skc,
    });
    task.tag = step3Task.tag;
    task.shopName = step3Task.shopName;
    task.exportTemplateName = step3Task.templateName;
    task.skc = step3Task.skc;
  }

  if (!task.tag) {
    task.tag = generatedTag || buildTag();
  }

  const exportTargets = Array.isArray(payload.exportTargets)
    ? payload.exportTargets
        .map((item) => ({
          shopName: String(item?.shopName || '').trim(),
          exportTemplateName: String(item?.exportTemplateName || '').trim(),
          skc: String(item?.skc || '').trim(),
        }))
        .filter((item) => item.shopName)
    : [];
  const payloadShopNames = Array.isArray(payload.shopNames)
    ? payload.shopNames.map((item) => String(item || '').trim()).filter(Boolean)
    : String(payload.shopNames || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
  const shopNames = payloadShopNames.length
    ? payloadShopNames
    : exportTargets.length
      ? exportTargets.map((item) => item.shopName)
      : (task.shopName ? [task.shopName] : []);

  task.shopName = String(task.shopName || payload.shopName || exportTargets[0]?.shopName || '').trim();
  task.shopNames = shopNames;
  task.designTemplateName = String(task.designTemplateName || payload.designTemplateName || '').trim();
  task.exportTemplateName = String(task.exportTemplateName || payload.exportTemplateName || '').trim();

  return task;
}

function setTaskProgress(stage, progress) {
  if (!state.currentTask) return;
  state.currentTask.stage = stage;
  state.currentTask.progress = progress;
}

function setTaskMetrics(patch = {}) {
  if (!state.currentTask) return;
  state.currentTask.metrics = {
    total: 0,
    current: 0,
    completed: 0,
    unit: '项',
    action: '',
    ...state.currentTask.metrics,
    ...patch,
  };
}

function setTaskSteps(steps) {
  if (!state.currentTask) return;
  state.currentTask.steps = steps;
}

function finishTaskSuccess(result, message = '任务完成') {
  state.running = false;
  state.stopRequested = false;
  state.child = null;
  setTaskProgress(message, 100);
  state.lastResult = {
    status: 'success',
    finishedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    result,
  };
  log(message, result || null);
}

function finishTaskError(message, result = null) {
  state.running = false;
  state.stopRequested = false;
  state.child = null;
  if (state.currentTask) state.currentTask.stage = '执行失败';
  state.lastResult = {
    status: 'error',
    finishedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    message,
    ...(result ? { result } : {}),
  };
  log('任务失败', { message });
}

function markStep1UploadedFolder(task, reportFile, result = {}) {
  const report = readJsonFile(reportFile) || {};
  const summary = report.summary || {};
  const successCount = Number(summary.successCount ?? result.successCount ?? result.count ?? 0);
  const failureCount = Number(summary.failureCount ?? result.failureCount ?? 0);
  const folderPath = normalizeFolderPath(report.dir || result.dir || task.folderPath);
  const patch = {
    folderMarked: false,
    folderAlreadyMarked: false,
    folderMarkedPath: '',
    folderMarkError: '',
  };

  if (!folderPath || successCount <= 0 || failureCount > 0) {
    const skippedResult = { ...result, ...patch };
    if (reportFile && report) {
      writeJsonFile(reportFile, {
        ...report,
        folderMark: patch,
        updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      });
    }
    return skippedResult;
  }

  try {
    if (!fs.existsSync(folderPath)) {
      throw new Error(`图片文件夹不存在，无法标记: ${folderPath}`);
    }
    if (!fs.statSync(folderPath).isDirectory()) {
      throw new Error(`当前路径不是文件夹，无法标记: ${folderPath}`);
    }

    const target = buildUploadedMarkedPath(folderPath);
    if (!target.alreadyMarked) {
      fs.renameSync(folderPath, target.targetPath);
    }

    patch.folderMarked = true;
    patch.folderAlreadyMarked = target.alreadyMarked;
    patch.folderMarkedPath = target.targetPath;
    if (state.currentTask && state.currentTask.folderPath === folderPath) {
      state.currentTask.folderPath = target.targetPath;
    }
    log(target.alreadyMarked ? '图片文件夹已是上传标记状态' : '图片文件夹已标记为上传图库', {
      from: folderPath,
      to: target.targetPath,
    });
  } catch (error) {
    patch.folderMarkError = error.message || String(error);
    log('图片文件夹上传标记失败', { folderPath, error: patch.folderMarkError });
  }

  if (reportFile && report) {
    writeJsonFile(reportFile, {
      ...report,
      dir: patch.folderMarkedPath || report.dir || folderPath,
      folderMark: patch,
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    });
  }

  return {
    ...result,
    dir: patch.folderMarkedPath || result.dir || folderPath,
    ...patch,
  };
}

function createLineParser(stepKey, onMessage, successMessage) {
  return (line, options = {}) => {
    const text = String(line || '').trim();
    if (!text) return null;

    if (text.startsWith('__RESULT__')) {
      try {
        const result = JSON.parse(text.replace('__RESULT__', ''));
        if (result.ok) {
          if (options.finalize === false) return result;
          finishTaskSuccess(result, successMessage);
        }
      } catch {
        log(`${stepKey} 结果解析失败`, { text });
      }
      return null;
    }

    const prefix = `[${stepKey}]`;
    if (text.startsWith(prefix)) {
      const message = text.replace(prefix, '').trim();
      onMessage(message);
      log(message);
      return null;
    }

    log(text);
    return null;
  };
}

const parseStep1Line = createLineParser('STEP1-API', (message) => {
  if (message.includes('开始批量上传')) {
    setTaskProgress('准备上传', 10);
    setTaskMetrics({ action: '正在准备上传图片', unit: '张' });
  } else if (message.includes('图片数量')) {
    const match = message.match(/图片数量:\s*(\d+)/);
    const total = match ? Number(match[1]) : 0;
    setTaskProgress('读取图片完成', 20);
    setTaskMetrics({ total, current: 0, completed: 0, action: '正在准备上传图片', unit: '张' });
  }
  else if (message.includes('上传第')) {
    const match = message.match(/上传第\s*(\d+)\/(\d+)/);
    if (match) {
      const current = Number(match[1]);
      const total = Number(match[2]) || 1;
      const progress = Math.min(95, 20 + Math.floor((current / total) * 70));
      setTaskProgress(`第一步上传 ${current}/${total}`, progress);
      setTaskMetrics({
        total,
        current,
        completed: Math.max(0, current - 1),
        action: `正在上传第 ${current}/${total} 张图片`,
        unit: '张',
      });
    }
  } else if (message.includes('上传完成')) {
    setTaskProgress('第一步上传完成', 100);
    const total = state.currentTask?.metrics?.total || state.currentTask?.imageCount || 0;
    setTaskMetrics({
      total,
      current: total,
      completed: total,
      action: '图片上传完成',
      unit: '张',
    });
  }
}, '第一步上传完成');

const parseStep2Line = createLineParser('STEP2-API', (message) => {
  if (message.includes('开始第二步')) {
    setTaskProgress('准备第二步', 10);
    setTaskMetrics({ action: '正在准备批量设计', unit: '张' });
  } else if (message.includes('主题图数量')) {
    const match = message.match(/主题图数量:\s*(\d+)/);
    const total = match ? Number(match[1]) : 0;
    setTaskProgress('已找到主题图', 25);
    setTaskMetrics({ total, current: 0, completed: 0, action: '正在准备批量设计', unit: '张' });
  } else if (message.includes('已找到公版')) {
    setTaskProgress('已找到公版', 40);
    setTaskMetrics({ action: '正在批量设计', unit: '张' });
  }
  else if (message.includes('合成第')) {
    const match = message.match(/合成第\s*(\d+)\/(\d+)/);
    if (match) {
      const current = Number(match[1]);
      const total = Number(match[2]) || 1;
      const progress = Math.min(95, 40 + Math.floor((current / total) * 50));
      setTaskProgress(`第二步合成 ${current}/${total}`, progress);
      setTaskMetrics({
        total,
        current,
        completed: Math.max(0, current - 1),
        action: `正在设计第 ${current}/${total} 个产品`,
        unit: '个',
      });
    }
  } else if (message.includes('第二步完成')) {
    setTaskProgress('第二步完成', 100);
    const total = state.currentTask?.metrics?.total || 0;
    setTaskMetrics({
      total,
      current: total,
      completed: total,
      action: '批量设计完成',
      unit: '个',
    });
  }
}, '第二步批量设计完成');

const parseStep3Line = createLineParser('STEP3-API', (message) => {
  if (message.includes('开始第三步')) {
    setTaskProgress('准备第三步', 10);
    setTaskMetrics({ action: '正在准备汇出产品', unit: '个' });
  } else if (message.includes('已找到成品')) {
    const match = message.match(/已找到成品\s*(\d+)\s*个/);
    const total = match ? Number(match[1]) : 0;
    setTaskProgress('已找到成品', 25);
    setTaskMetrics({ total, current: 0, completed: 0, action: '正在准备汇出产品', unit: '个' });
  } else if (message.includes('已找到店铺')) {
    setTaskProgress('已找到店铺', 40);
    setTaskMetrics({ action: '正在准备汇出产品', unit: '个' });
  } else if (message.includes('已找到模板')) {
    setTaskProgress('已找到模板', 60);
    setTaskMetrics({ action: '正在准备汇出产品', unit: '个' });
  } else if (message.includes('模板记录已保存')) {
    setTaskProgress('模板记录已保存', 80);
    const total = state.currentTask?.metrics?.total || 0;
    setTaskMetrics({
      total,
      current: total ? 1 : 0,
      completed: 0,
      action: total ? `正在汇出 ${total} 个产品` : '正在汇出产品',
      unit: '个',
    });
  } else if (message.includes('第三步完成')) {
    setTaskProgress('第三步完成', 100);
    const total = state.currentTask?.metrics?.total || 0;
    setTaskMetrics({
      total,
      current: total,
      completed: total,
      action: '产品汇出完成',
      unit: '个',
    });
  }
}, '第三步 TEMU 汇出完成');

function parseChildResult(parseLine, stdoutBuffer) {
  if (!stdoutBuffer.trim()) return null;
  return parseLine(stdoutBuffer.trim(), { finalize: false });
}

function extractMeaningfulError(...chunks) {
  const lines = chunks
    .filter(Boolean)
    .flatMap((text) => String(text).split(/\r?\n/))
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line.startsWith('[STEP') && line.includes('失败:')) {
      return line.replace(/^\[STEP\d-API\]\s*失败:\s*/i, '').trim();
    }
    if (line.includes('未找到标签为') || line.includes('请求失败') || line.includes('登录态无效')) {
      return line;
    }
  }

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!/^at\s/i.test(line)) return line;
  }

  return '';
}

function withPatchedConsole(parseLine, taskFn) {
  return new Promise((resolve, reject) => {
    const originalLog = BASE_CONSOLE_LOG;
    const originalError = BASE_CONSOLE_ERROR;
    let result = null;

    const handleLine = (line, isError = false) => {
      const text = String(line || '');
      for (const part of text.split(/\r?\n/)) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        if (!isError) {
          const parsed = parseLine(trimmed, { finalize: false });
          if (parsed && parsed.ok) result = parsed;
        } else {
          log(trimmed);
        }
      }
    };

    console.log = (...args) => {
      originalLog.apply(console, args);
      handleLine(args.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(' '), false);
    };

    console.error = (...args) => {
      originalError.apply(console, args);
      handleLine(args.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(' '), true);
    };

    Promise.resolve()
      .then(taskFn)
      .then(() => resolve(result || { ok: true }))
      .catch(reject)
      .finally(() => {
        console.log = originalLog;
        console.error = originalError;
      });
  });
}

function runScript(script, args, parseLine) {
  if (process.pkg || IS_ELECTRON || process.env.LANDWU_RUN_INLINE_STEPS === '1') {
    return withPatchedConsole(parseLine, async () => {
      const originalArgv = process.argv.slice();
      try {
        process.argv = [process.execPath, script, ...args];
        if (script === STEP1_SCRIPT) {
          await require('./step1-gallery-upload-api-v1.js').main();
          return;
        }
        if (script === STEP2_SCRIPT) {
          await require('./step2-batch-design-api-v1.js').main();
          return;
        }
        if (script === STEP3_SCRIPT) {
          await require('./step3-temu-export-api-v1.js').main();
          return;
        }
        throw new Error(`未知内部任务: ${script}`);
      } finally {
        process.argv = originalArgv;
      }
    });
  }

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: RUNTIME_DIR,
      windowsHide: true,
      env: process.env,
    });
    state.child = child;

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let result = null;

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || '';
      for (const line of lines) {
        const parsed = parseLine(line, { finalize: false });
        if (parsed && parsed.ok) result = parsed;
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderrBuffer += chunk;
      const lines = stderrBuffer.split(/\r?\n/);
      stderrBuffer = lines.pop() || '';
      for (const line of lines) {
        if (line.trim()) log(line.trim());
      }
    });

    child.on('error', reject);
    child.on('close', (code) => {
      state.child = null;
      const parsed = parseChildResult(parseLine, stdoutBuffer);
      if (parsed && parsed.ok) result = parsed;
      if (stderrBuffer.trim()) log(stderrBuffer.trim());
      if (state.stopRequested) {
        reject(new Error('任务已停止'));
        return;
      }
      if (code === 0) {
        resolve(result || { ok: true });
        return;
      }
      reject(new Error(extractMeaningfulError(stderrBuffer, stdoutBuffer) || `子进程退出码: ${code}`));
    });
  });
}

function startSingleTask(task, mode, parseLine, script, args, successMessage, finalizeResult = null) {
  state.running = true;
  state.stopRequested = false;
  state.lastResult = null;
  state.currentTask = {
    ...task,
    mode,
    progress: 0,
    stage: '准备启动',
    metrics: {
      total: task.imageCount || 0,
      current: 0,
      completed: 0,
      unit: '项',
      action: '等待开始',
    },
    startedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  };

  runScript(script, args, parseLine)
    .then((result) => finishTaskSuccess(finalizeResult ? finalizeResult(result) : result, successMessage))
    .catch((error) => {
      if (state.stopRequested) {
        stopTask();
        return;
      }
      finishTaskError(error.message || String(error));
    });
}

function startStep1Task(task) {
  const reportFile = buildReportFile('step1', {
    tag: task.tag,
    folderPath: task.folderPath,
  });
  log('开始第一步上传', task);
  startSingleTask(
    { ...task, reportFiles: { step1: reportFile } },
    'step1',
    parseStep1Line,
    STEP1_SCRIPT,
    [
      `--dir=${task.folderPath}`,
      `--tag=${task.tag}`,
      `--token=${state.auth.token}`,
      `--factory-id=${state.auth.factoryId}`,
      `--master-factory-id=${state.auth.masterFactoryId}`,
      `--report-file=${reportFile}`,
      ...(task.shopName ? [`--shop-name=${task.shopName}`] : []),
      ...(Array.isArray(task.shopNames) && task.shopNames.length ? [`--shop-names=${task.shopNames.join(',')}`] : []),
      ...(task.designTemplateName ? [`--design-template-name=${task.designTemplateName}`] : []),
      ...(task.exportTemplateName ? [`--export-template-name=${task.exportTemplateName}`] : []),
      ...(state.auth.session ? [`--session=${state.auth.session}`] : []),
    ],
    '第一步上传完成',
    (result) => markStep1UploadedFolder(task, reportFile, result),
  );
}

function startStep2Task(task) {
  const reportFile = buildReportFile('step2', {
    tag: task.tag,
    templateName: task.templateName,
  });
  log('开始第二步批量设计', task);
  startSingleTask(
    { ...task, reportFiles: { step2: reportFile } },
    'step2',
    parseStep2Line,
    STEP2_SCRIPT,
    [
      `--tag=${task.tag}`,
      `--template-name=${task.templateName}`,
      `--auto-association=${task.autoAssociation}`,
      ...(task.maximizeDesign ? ['--maximize-design'] : []),
      `--report-file=${reportFile}`,
    ],
    '第二步批量设计完成',
  );
}

function startStep3Task(task) {
  const reportFile = buildReportFile('step3', {
    tag: task.tag,
    shopName: task.shopName,
    templateName: task.templateName,
    skc: task.skc,
  });
  log('开始第三步 TEMU 汇出', task);
  startSingleTask(
    { ...task, reportFiles: { step3: reportFile } },
    'step3',
    parseStep3Line,
    STEP3_SCRIPT,
    [
      `--tag=${task.tag}`,
      `--shop-name=${task.shopName}`,
      `--template-name=${task.templateName}`,
      `--report-file=${reportFile}`,
      ...(task.skc ? [`--skc=${task.skc}`] : []),
    ],
    '第三步 TEMU 汇出完成',
  );
}

async function startPipelineTask(task) {
  const reportFiles = {};
  const stepResults = {};
  if (task.stepsSelected.includes('step1')) {
    reportFiles.step1 = buildReportFile('step1', {
      tag: task.tag,
      folderPath: task.folderPath,
    });
  }
  if (task.stepsSelected.includes('step2')) {
    reportFiles.step2 = buildReportFile('step2', {
      tag: task.tag,
      templateName: task.designTemplateName,
    });
  }
  if (task.stepsSelected.includes('step3')) {
    reportFiles.step3 = buildReportFile('step3', {
      tag: task.tag,
      shopName: task.shopName,
      templateName: task.exportTemplateName,
      skc: task.skc,
    });
  }
  state.running = true;
  state.stopRequested = false;
  state.lastResult = null;
  state.currentTask = {
    ...task,
    reportFiles,
    mode: 'pipeline',
    progress: 0,
    stage: '准备执行所选步骤',
    metrics: {
      total: task.imageCount || 0,
      current: 0,
      completed: 0,
      unit: '项',
      action: '等待开始',
    },
    startedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    steps: {
      step1: task.stepsSelected.includes('step1') ? 'pending' : 'skipped',
      step2: task.stepsSelected.includes('step2') ? 'pending' : 'skipped',
      step3: task.stepsSelected.includes('step3') ? 'pending' : 'skipped',
    },
  };
  log('开始执行所选步骤', {
    steps: task.stepsSelected,
    tag: task.tag,
    folderPath: task.folderPath || '',
    designTemplateName: task.designTemplateName || '',
    maximizeDesign: !!task.maximizeDesign,
    shopName: task.shopName || '',
    exportTemplateName: task.exportTemplateName || '',
    skc: task.skc || '',
  });

  const orderedSteps = ['step1', 'step2', 'step3'].filter((item) => task.stepsSelected.includes(item));
  const stepCount = orderedSteps.length;
  let activeStepName = '';

  try {
    for (let index = 0; index < orderedSteps.length; index += 1) {
      const stepName = orderedSteps[index];
      activeStepName = stepName;
      const baseProgress = Math.floor((index / stepCount) * 100);
      const nextProgress = Math.floor(((index + 1) / stepCount) * 100);

      if (stepName === 'step1') {
        setTaskSteps({ ...state.currentTask.steps, step1: 'in_progress' });
        setTaskProgress('执行第一步：上传图库', Math.max(baseProgress, 1));
        await runScript(STEP1_SCRIPT, [
          `--dir=${task.folderPath}`,
          `--tag=${task.tag}`,
          `--token=${state.auth.token}`,
          `--factory-id=${state.auth.factoryId}`,
          `--master-factory-id=${state.auth.masterFactoryId}`,
          `--report-file=${reportFiles.step1}`,
          ...(task.shopName ? [`--shop-name=${task.shopName}`] : []),
          ...(Array.isArray(task.shopNames) && task.shopNames.length ? [`--shop-names=${task.shopNames.join(',')}`] : []),
          ...(task.designTemplateName ? [`--design-template-name=${task.designTemplateName}`] : []),
          ...(task.exportTemplateName ? [`--export-template-name=${task.exportTemplateName}`] : []),
          ...(state.auth.session ? [`--session=${state.auth.session}`] : []),
        ], parseStep1Line);
        stepResults.step1 = markStep1UploadedFolder(task, reportFiles.step1, parseReportResult(reportFiles.step1));
        setTaskSteps({ ...state.currentTask.steps, step1: 'completed' });
        setTaskProgress('第一步完成', nextProgress);
      }

      if (stepName === 'step2') {
        setTaskSteps({ ...state.currentTask.steps, step2: 'in_progress' });
        setTaskProgress('执行第二步：批量设计', Math.max(baseProgress, 1));
        await runScript(STEP2_SCRIPT, [
          `--tag=${task.tag}`,
          `--template-name=${task.designTemplateName}`,
          '--auto-association=1',
          ...(task.maximizeDesign ? ['--maximize-design'] : []),
          `--report-file=${reportFiles.step2}`,
        ], parseStep2Line);
        stepResults.step2 = parseReportResult(reportFiles.step2);
        setTaskSteps({ ...state.currentTask.steps, step2: 'completed' });
        setTaskProgress('第二步完成', nextProgress);
      }

      if (stepName === 'step3') {
        setTaskSteps({ ...state.currentTask.steps, step3: 'in_progress' });
        setTaskProgress('执行第三步：TEMU汇出', Math.max(baseProgress, 1));
        const step3Result = await runScript(STEP3_SCRIPT, [
          `--tag=${task.tag}`,
          `--shop-name=${task.shopName}`,
          `--template-name=${task.exportTemplateName}`,
          `--report-file=${reportFiles.step3}`,
          ...(task.skc ? [`--skc=${task.skc}`] : []),
        ], parseStep3Line);
        stepResults.step3 = step3Result && step3Result.ok ? step3Result : parseReportResult(reportFiles.step3);
        setTaskSteps({ ...state.currentTask.steps, step3: 'completed' });
        setTaskProgress('第三步完成', nextProgress);
      }
    }

    finishTaskSuccess({
      ok: true,
      tag: task.tag,
      steps: task.stepsSelected,
      reportFiles,
      stepResults,
      message: '所选步骤执行完成',
    }, '所选步骤执行完成');
  } catch (error) {
    if (state.stopRequested) {
      stopTask();
      return;
    }
    const message = error.message || String(error);
    if (activeStepName) {
      stepResults[activeStepName] = buildFailedStepResult(activeStepName, task, reportFiles[activeStepName], message);
      setTaskSteps({ ...state.currentTask.steps, [activeStepName]: 'failed' });
    }
    finishTaskError(message, {
      ok: false,
      tag: task.tag,
      steps: task.stepsSelected,
      failedStep: activeStepName,
      reportFiles,
      stepResults,
      message,
    });
  }
}

function parseReportResult(reportFile) {
  if (!reportFile || !fs.existsSync(reportFile)) return null;
  try {
    const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    return {
      ok: true,
      tag: report.tag || '',
      dir: report.dir || '',
      shopName: report.shopName || report.context?.shopName || '',
      shopNames: Array.isArray(report.context?.shopNames) ? report.context.shopNames : [],
      designTemplateName: report.templateName || report.context?.designTemplateName || '',
      exportTemplateName: report.context?.exportTemplateName || '',
      successCount: Number(report.summary?.successCount || 0),
      failureCount: Number(report.summary?.failureCount || 0),
      totalCount: Number(report.summary?.totalCount || 0),
      count: Number(report.summary?.successCount || 0),
      failureDir: report.failureDir || '',
      failures: Array.isArray(report.failures) ? report.failures : [],
      folderMarked: !!report.folderMark?.folderMarked,
      folderAlreadyMarked: !!report.folderMark?.folderAlreadyMarked,
      folderMarkedPath: report.folderMark?.folderMarkedPath || '',
      folderMarkError: report.folderMark?.folderMarkError || '',
      reportFile,
      step: report.step || '',
    };
  } catch {
    return null;
  }
}

function buildFailedStepResult(stepName, task, reportFile, message) {
  const parsed = parseReportResult(reportFile) || {};
  const successCount = Number(parsed.successCount || 0);
  const parsedFailureCount = Number(parsed.failureCount || 0);
  const failureCount = Math.max(parsedFailureCount, 1);
  const failures = Array.isArray(parsed.failures) && parsed.failures.length
    ? parsed.failures
    : [{ error: message }];
  const detailMessage = parsed.errorMessage
    || failures.find((item) => item && item.error)?.error
    || message;

  return {
    ...parsed,
    ok: false,
    failed: true,
    step: stepName,
    tag: parsed.tag || task.tag || '',
    shopName: parsed.shopName || task.shopName || '',
    shopNames: Array.isArray(parsed.shopNames) && parsed.shopNames.length ? parsed.shopNames : (Array.isArray(task.shopNames) ? task.shopNames : []),
    designTemplateName: parsed.designTemplateName || task.designTemplateName || '',
    exportTemplateName: parsed.exportTemplateName || task.exportTemplateName || '',
    successCount,
    failureCount,
    totalCount: Math.max(Number(parsed.totalCount || 0), successCount + failureCount, Number(task.imageCount || 0)),
    count: successCount,
    failures,
    errorMessage: detailMessage,
    reportFile: reportFile || parsed.reportFile || '',
  };
}

function stopTask() {
  state.stopRequested = true;
  if (state.child && !state.child.killed) {
    state.child.kill();
  }
  state.running = false;
  state.child = null;
  if (state.currentTask) {
    state.currentTask.stage = '已停止';
  }
  state.lastResult = {
    status: 'stopped',
    finishedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  };
  log('任务已手动停止');
}

function pickFolder() {
  if (typeof global.__LANDWU_PICK_FOLDER__ === 'function') {
    return Promise.resolve().then(() => global.__LANDWU_PICK_FOLDER__());
  }

  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      reject(new Error('当前环境不支持系统文件夹选择器，请直接粘贴图片文件夹路径'));
      return;
    }

    const script = [
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      'Add-Type -AssemblyName System.Windows.Forms',
      '$form = New-Object System.Windows.Forms.Form',
      "$form.Text = '选择图片文件夹'",
      '$form.TopMost = $true',
      '$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen',
      '$form.ShowInTaskbar = $false',
      '$form.WindowState = [System.Windows.Forms.FormWindowState]::Minimized',
      '$form.Show()',
      '$form.Activate()',
      "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
      "$dialog.Description = '选择图片文件夹'",
      '$dialog.ShowNewFolderButton = $false',
      'if ($dialog.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK) {',
      '  [Console]::Write($dialog.SelectedPath)',
      '}',
      '$form.Close()',
      '$form.Dispose()',
    ].join('; ');
    const child = spawn('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true });
    let output = '';
    let error = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      error += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      const folderPath = output.trim();
      if (code !== 0) {
        reject(new Error(error.trim() || `选择文件夹失败: ${code}`));
        return;
      }
      if (!folderPath) {
        reject(new Error('未选择文件夹'));
        return;
      }
      resolve(folderPath);
    });
  });
}

async function requestLandwuJson(url, body, auth, referer, includeCookie = true) {
  const headers = {
    'content-type': 'application/json;charset=UTF-8',
    authorization: `Bearer ${auth.token}`,
    'x-csrf-token': `Bearer ${auth.token}`,
    'm-master-factory-id': `factory:${auth.masterFactoryId}`,
    lange: 'zh',
    origin: 'https://user.landwu.com',
    referer,
    accept: '*/*',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
  };
  if (includeCookie && auth.session) headers.cookie = auth.session;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body, lange: 'zh', api_token: auth.token }),
  });
  const text = await response.text();
  const json = JSON.parse(text);
  if (!response.ok || json.code !== 1) {
    throw new Error(`${url} 请求失败`);
  }
  return json;
}

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (req.method === 'GET' && pathname === '/api/status') {
      return sendJson(res, 200, {
        ok: true,
        data: {
          appName: state.appName,
          version: state.version,
          running: state.running,
          currentTask: state.currentTask,
          lastResult: state.lastResult,
          auth: buildAuthSummary(state.auth),
          logs: state.logs.slice(-120),
        },
      });
    }

    if (req.method === 'POST' && pathname === '/api/pick-folder') {
      try {
        const folderPath = await pickFolder();
        return sendJson(res, 200, { ok: true, data: { folderPath } });
      } catch (error) {
        return sendJson(res, 400, { ok: false, message: error.message || '选择文件夹失败' });
      }
    }

    if (req.method === 'POST' && pathname === '/api/auth/sync') {
      try {
        const payload = await readBody(req);
        const auth = normalizeAuthPayload(payload);
        state.auth = auth;
        saveAuth(auth);
        log('网页登录态已同步', { source: auth.source, username: auth.username, factoryId: auth.factoryId });
        return sendJson(res, 200, { ok: true, data: buildAuthSummary(auth) });
      } catch (error) {
        return sendJson(res, 400, { ok: false, message: error.message || '鉴权同步失败' });
      }
    }

    if (req.method === 'POST' && pathname === '/api/auth/clear') {
      state.auth = null;
      clearAuthFile();
      log('鉴权已清空');
      return sendJson(res, 200, { ok: true, message: '鉴权已清空' });
    }

    if (req.method === 'GET' && pathname === '/api/step2/templates') {
      try {
        ensureAuthReady();
        const json = await requestLandwuJson('https://user.landwu.com/api/design/DzDesignProduct/getDesignProduct', {
          page: 1,
          limit: 200,
          defaultPageSize: 200,
          name: '',
          name_zh: '',
          special_subject_id: '',
          category_id: '',
          is_group_template: '-1',
        }, state.auth, 'https://user.landwu.com/#/batchDesign');
        const templates = (json.data?.data || []).map((item) => ({ id: item.id, name: item.name_zh || item.name }));
        return sendJson(res, 200, { ok: true, data: templates });
      } catch (error) {
        return sendJson(res, 400, { ok: false, message: error.message || '获取设计公版失败' });
      }
    }

    if (req.method === 'GET' && pathname === '/api/step3/shops') {
      try {
        ensureAuthReady();
        const json = await requestLandwuJson('https://user.landwu.com/api/shop/index', {
          limit: 1000,
          plat_id: 18,
        }, state.auth, 'https://user.landwu.com/#/Producet/temu');
        const shops = (json.data?.data || []).map((item) => ({ id: item.id, name: item.name }));
        return sendJson(res, 200, { ok: true, data: shops });
      } catch (error) {
        return sendJson(res, 400, { ok: false, message: error.message || '获取店铺失败' });
      }
    }

    if (req.method === 'GET' && pathname === '/api/step3/templates') {
      try {
        ensureAuthReady();
        const shopId = String(url.searchParams.get('shopId') || '').trim();
        if (!shopId) throw new Error('缺少 shopId');
        const json = await requestLandwuJson('https://user.landwu.com/api/teMu/getTemplateList', {
          shop_id: Number(shopId),
          limit: 1000,
        }, state.auth, 'https://user.landwu.com/#/Producet/temu');
        const templates = (json.data?.data || []).map((item) => ({ id: item.id, name: item.template_name }));
        return sendJson(res, 200, { ok: true, data: templates });
      } catch (error) {
        return sendJson(res, 400, { ok: false, message: error.message || '获取模板失败' });
      }
    }

    if (req.method === 'POST' && pathname === '/api/start-step1') {
      try {
        if (state.running) throw new Error('已有任务在运行，请先等待');
        const payload = await readBody(req);
        const task = validateTaskInput(payload);
        startStep1Task(task);
        return sendJson(res, 200, { ok: true, data: state.currentTask });
      } catch (error) {
        return sendJson(res, 400, { ok: false, message: error.message || '启动失败' });
      }
    }

    if (req.method === 'POST' && pathname === '/api/start-step2') {
      try {
        if (state.running) throw new Error('已有任务在运行，请先等待');
        const payload = await readBody(req);
        const task = validateStep2Input(payload);
        startStep2Task(task);
        return sendJson(res, 200, { ok: true, data: state.currentTask });
      } catch (error) {
        return sendJson(res, 400, { ok: false, message: error.message || '启动失败' });
      }
    }

    if (req.method === 'POST' && pathname === '/api/start-step3') {
      try {
        if (state.running) throw new Error('已有任务在运行，请先等待');
        const payload = await readBody(req);
        const task = validateStep3Input(payload);
        startStep3Task(task);
        return sendJson(res, 200, { ok: true, data: state.currentTask });
      } catch (error) {
        return sendJson(res, 400, { ok: false, message: error.message || '启动失败' });
      }
    }

    if (req.method === 'POST' && pathname === '/api/start-pipeline') {
      try {
        if (state.running) throw new Error('已有任务在运行，请先等待');
        const payload = await readBody(req);
        const task = validatePipelineInput(payload);
        startPipelineTask(task);
        return sendJson(res, 200, { ok: true, data: state.currentTask });
      } catch (error) {
        return sendJson(res, 400, { ok: false, message: error.message || '启动失败' });
      }
    }

    if (req.method === 'POST' && pathname === '/api/stop') {
      stopTask();
      return sendJson(res, 200, { ok: true, message: '已停止' });
    }

    const safePath = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      sendFile(res, filePath);
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });
}

let serverInstance = null;

function startServer() {
  if (serverInstance) return serverInstance;
  serverInstance = createServer().listen(PORT, HOST, () => {
    log(`领物TEMU上传器已启动: http://${HOST}:${PORT}`);
    console.log(`领物TEMU上传器已启动: http://${HOST}:${PORT}`);
  });
  return serverInstance;
}

function stopServer() {
  if (!serverInstance) return;
  serverInstance.close();
  serverInstance = null;
}

module.exports = {
  HOST,
  PORT,
  state,
  createServer,
  startServer,
  stopServer,
};

if (require.main === module) {
  startServer();
}
