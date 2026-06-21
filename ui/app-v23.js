const folderPathInput = document.getElementById('folderPath');
const tagInput = document.getElementById('tagInput');
const refreshTagBtn = document.getElementById('refreshTagBtn');
const step2TagPreview = document.getElementById('step2TagPreview');
const step2MaximizeInput = document.getElementById('step2MaximizeInput');
const designTemplateSearchInput = document.getElementById('designTemplateSearchInput');
const designTemplateInput = document.getElementById('designTemplateInput');
const shopSelectInput = document.getElementById('shopSelectInput');
const exportTemplateInput = document.getElementById('exportTemplateInput');
const skcInput = document.getElementById('skcInput');
const step1Enabled = document.getElementById('step1Enabled');
const step2Enabled = document.getElementById('step2Enabled');
const step3Enabled = document.getElementById('step3Enabled');
const pickFolderBtn = document.getElementById('pickFolderBtn');
const addQueueBtn = document.getElementById('addQueueBtn');
const addMultiShopBtn = document.getElementById('addMultiShopBtn');
const runQueueBtn = document.getElementById('runQueueBtn');
const clearQueueBtn = document.getElementById('clearQueueBtn');
const startPipelineBtn = document.getElementById('startPipelineBtn');
const runStep1Btn = document.getElementById('runStep1Btn');
const runStep2Btn = document.getElementById('runStep2Btn');
const runStep3Btn = document.getElementById('runStep3Btn');
const stopBtn = document.getElementById('stopBtn');
const saveAuthBtn = document.getElementById('saveAuthBtn');
const clearAuthBtn = document.getElementById('clearAuthBtn');
const tokenInput = document.getElementById('tokenInput');
const factoryIdInput = document.getElementById('factoryIdInput');
const masterFactoryIdInput = document.getElementById('masterFactoryIdInput');
const sessionInput = document.getElementById('sessionInput');
const authReadyText = document.getElementById('authReadyText');
const authSourceText = document.getElementById('authSourceText');
const authUserText = document.getElementById('authUserText');
const authFactoryText = document.getElementById('authFactoryText');
const authTimeText = document.getElementById('authTimeText');
const authHintBox = document.getElementById('authHintBox');
const step1Badge = document.getElementById('step1Badge');
const step2Badge = document.getElementById('step2Badge');
const step3Badge = document.getElementById('step3Badge');
const queueSummary = document.getElementById('queueSummary');
const queueList = document.getElementById('queueList');
const multiShopList = document.getElementById('multiShopList');
const messageBox = document.getElementById('message');
const runningText = document.getElementById('runningText');
const stageText = document.getElementById('stageText');
const imageCountText = document.getElementById('imageCountText');
const currentIndexText = document.getElementById('currentIndexText');
const completedCountText = document.getElementById('completedCountText');
const versionText = document.getElementById('versionText');
const statusHintText = document.getElementById('statusHintText');
const progressText = document.getElementById('progressText');
const progressBar = document.getElementById('progressBar');
const resultPanel = document.getElementById('resultPanel');
const resultPanelTitle = document.getElementById('resultPanelTitle');
const resultPanelStatus = document.getElementById('resultPanelStatus');
const resultPanelSummary = document.getElementById('resultPanelSummary');
const failurePanel = document.getElementById('failurePanel');
const failureSummary = document.getElementById('failureSummary');
const failureMeta = document.getElementById('failureMeta');
const failureList = document.getElementById('failureList');
const logList = document.getElementById('logList');
const historyList = document.getElementById('historyList');
const runStateDot = document.getElementById('runStateDot');

const QUEUE_STORAGE_KEY = 'landwu-uploader-queue-v1';
const HISTORY_STORAGE_KEY = 'landwu-uploader-history-v1';

let designTemplates = [];
let shops = [];
let exportTemplates = [];
let queue = loadQueue();
let taskHistory = loadTaskHistory();
let multiExportTargets = [];
let queueRunning = false;
let currentQueueJobId = '';
let lastTaskFinishedAt = '';
let invalidFieldIds = new Set();

function hasQueueWork() {
  return queue.some((item) => item.status === 'queued' || item.status === 'running');
}

function isQueueLocked() {
  return queueRunning && hasQueueWork();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatPathTail(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const parts = text.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : text;
}

function formatFailureReason(value) {
  return String(value || '').trim() || '未返回失败原因';
}

function buildDefaultTag() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function ensureDefaultTag() {
  if (!tagInput.value.trim()) {
    tagInput.value = buildDefaultTag();
  }
  syncTagPreview();
}

function refreshTaskTag() {
  tagInput.value = buildDefaultTag();
  syncTagPreview();
  clearFieldErrors();
  setMessage(`已生成任务标签：${tagInput.value}`);
}

function clearSubmittedTaskForm() {
  folderPathInput.value = '';
  tagInput.value = '';
  skcInput.value = '';
  skcInput.dataset.touched = '0';
  multiExportTargets = [];
  renderMultiShopList();
  syncTagPreview();
  clearFieldErrors();
}

function setMessage(text, isError = false) {
  messageBox.textContent = text || '';
  messageBox.style.color = isError ? '#f87171' : '#fbbf24';
}

function applyFieldErrorStyles() {
  const fields = [
    folderPathInput,
    tagInput,
    designTemplateInput,
    shopSelectInput,
    exportTemplateInput,
  ];
  for (const field of fields) {
    if (!field) continue;
    field.classList.toggle('input-error', invalidFieldIds.has(field.id));
  }
}

function clearFieldErrors() {
  invalidFieldIds = new Set();
  applyFieldErrorStyles();
}

function normalizeFolderPath(value) {
  let text = String(value || '').trim();
  if (!text) return '';
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

function markInvalidField(field) {
  if (!field?.id) return;
  invalidFieldIds.add(field.id);
}

function renderSelectOptions(select, items, placeholder, selectedValue = '') {
  select.innerHTML = '';
  const first = document.createElement('option');
  first.value = '';
  first.textContent = placeholder;
  select.appendChild(first);
  for (const item of items) {
    const option = document.createElement('option');
    option.value = item.name;
    option.textContent = item.name;
    option.dataset.id = item.id;
    if (selectedValue && selectedValue === item.name) option.selected = true;
    select.appendChild(option);
  }
}

function renderLogs(logs = []) {
  const shouldStickToBottom =
    logList.scrollHeight - logList.scrollTop - logList.clientHeight <= 24;
  if (!logs.length) {
    logList.innerHTML = '<div class="log-item"><div class="log-message">暂无日志</div></div>';
    return;
  }
  logList.innerHTML = logs.map((item, index) => {
    const extra = item.extra ? `<div class="log-extra">${escapeHtml(JSON.stringify(item.extra, null, 2))}</div>` : '';
    return `<div class="log-item"><div class="log-index">${index + 1}</div><div class="log-time">${escapeHtml(item.time)}</div><div class="log-message">${escapeHtml(item.message)}</div>${extra}</div>`;
  }).join('');
  if (shouldStickToBottom) {
    logList.scrollTop = logList.scrollHeight;
  }
}

function renderAuth(auth = {}) {
  authReadyText.textContent = auth.ready ? '已同步' : '未同步';
  authSourceText.textContent = auth.source || '-';
  authUserText.textContent = auth.username || auth.companyName || '-';
  authFactoryText.textContent = auth.factoryId || '-';
  authTimeText.textContent = auth.syncedAt || '-';
  authHintBox.classList.toggle('is-visible', !auth.ready);
}

function renderBadge(element, status) {
  element.className = 'step-badge';
  if (status === 'completed') {
    element.classList.add('is-done');
    element.textContent = '已完成';
  } else if (status === 'in_progress') {
    element.classList.add('is-active');
    element.textContent = '进行中';
  } else if (status === 'skipped') {
    element.classList.add('is-skip');
    element.textContent = '未选择';
  } else {
    element.classList.add('is-pending');
    element.textContent = '待执行';
  }
}

function renderSteps(currentTask) {
  const steps = currentTask?.steps || {
    step1: step1Enabled.checked ? 'pending' : 'skipped',
    step2: step2Enabled.checked ? 'pending' : 'skipped',
    step3: step3Enabled.checked ? 'pending' : 'skipped',
  };
  renderBadge(step1Badge, steps.step1);
  renderBadge(step2Badge, steps.step2);
  renderBadge(step3Badge, steps.step3);
}

function getUserStageText(stage, currentTask) {
  const text = String(stage || '').trim();
  if (!text) return '未开始';

  const mappings = [
    [/准备上传|读取图片完成/, '正在准备上传图片'],
    [/第一步上传完成|第一步完成/, '图片上传完成'],
    [/执行第一步：上传图库/, '正在上传图片'],
    [/第一步上传\s*(\d+)\/(\d+)/, '正在上传图片'],
    [/准备第二步|已找到主题图|已找到公版/, '正在准备批量设计'],
    [/执行第二步：批量设计/, '正在批量设计'],
    [/第二步合成\s*(\d+)\/(\d+)/, '正在批量设计'],
    [/第二步批量设计完成|第二步完成/, '批量设计完成'],
    [/准备第三步|已找到成品|已找到店铺|已找到模板|模板记录已保存/, '正在准备汇出'],
    [/执行第三步：TEMU汇出/, '正在汇出产品'],
    [/第三步 TEMU 汇出完成|第三步完成/, '汇出完成'],
    [/所选步骤执行完成/, '任务完成'],
    [/已完成但有失败/, '任务完成但有失败'],
    [/已停止/, '任务已停止'],
    [/执行失败/, '任务失败'],
  ];

  for (const [pattern, label] of mappings) {
    if (pattern.test(text)) return label;
  }

  if (currentTask?.mode === 'step1') return '正在上传图片';
  if (currentTask?.mode === 'step2') return '正在批量设计';
  if (currentTask?.mode === 'step3') return '正在汇出产品';
  return text;
}

function formatCount(value, unit) {
  const count = Number(value || 0);
  if (!count) return '-';
  return `${count}${unit || '项'}`;
}

function formatCurrentProgress(metrics = {}) {
  const total = Number(metrics.total || 0);
  const current = Number(metrics.current || 0);
  const unit = metrics.unit || '项';
  if (!total) return '-';
  if (!current) return `0/${total}${unit}`;
  return `${current}/${total}${unit}`;
}

function updateActionButtons(running, queueHasItems) {
  const queueLocked = isQueueLocked();
  const hasQueued = queue.some((item) => item.status === 'queued');
  const hasRunning = queue.some((item) => item.status === 'running');
  startPipelineBtn.disabled = !!running || queueLocked;
  runStep1Btn.disabled = !!running || queueLocked;
  runStep2Btn.disabled = !!running || queueLocked;
  runStep3Btn.disabled = !!running || queueLocked;
  pickFolderBtn.disabled = !!running;
  stopBtn.disabled = !running;
  runQueueBtn.disabled = (!hasQueued && !hasRunning) || !!running || queueLocked;
  clearQueueBtn.disabled = !queueHasItems || !!running || queueLocked;
  runQueueBtn.textContent = hasRunning && !running ? '继续队列' : '开始队列';
}

function findResultReportFile(lastResult, currentTask) {
  const result = lastResult?.result;
  if (result?.reportFile) return result.reportFile;
  if (result?.reportFiles) {
    return Object.values(result.reportFiles).filter(Boolean).join(' | ');
  }
  if (currentTask?.reportFiles) {
    return Object.values(currentTask.reportFiles).filter(Boolean).join(' | ');
  }
  return '';
}

function formatStepResultLine(label, result) {
  if (!result) return '';
  const successCount = Number(result.successCount || result.count || 0);
  const failureCount = Number(result.failureCount || 0);
  return `${label}：成功 ${successCount}，失败 ${failureCount}`;
}

function getEntryStatus(status, result) {
  if (status === 'success' && Number(result?.failureCount || 0) > 0) return 'partial';
  return status;
}

function hasResultFailures(lastResult) {
  const result = lastResult?.result || {};
  if (result.stepResults) {
    return Object.values(result.stepResults).some((item) => Number(item?.failureCount || 0) > 0);
  }
  return Number(result.failureCount || 0) > 0;
}

function getLastResultStatus(lastResult) {
  if (!lastResult) return 'idle';
  if (lastResult.status === 'success' && hasResultFailures(lastResult)) return 'partial';
  return lastResult.status || 'idle';
}

function getResultStatusText(status) {
  if (status === 'success') return '已完成';
  if (status === 'partial') return '已完成但有失败';
  if (status === 'error') return '失败';
  if (status === 'stopped') return '已停止';
  if (status === 'idle') return '等待任务完成';
  return '未知';
}

function buildHistoryLine(stepKey, result, context = {}, status = 'success') {
  const successCount = Number(result?.successCount || result?.count || 0);
  const failureCount = Number(result?.failureCount || 0);
  const totalCount = Math.max(
    Number(result?.totalCount || 0),
    Number(result?.count || 0),
    successCount + failureCount,
    Number(context.imageCount || 0),
  );
  const tag = String(result?.tag || context.tag || '').trim();
  const shopName = String(result?.shopName || context.shopName || '').trim();
  const folderName = String(context.folderName || '').trim();
  const baseStatus = status === 'error'
    ? `成功 ${successCount}，失败 ${failureCount || 1}`
    : `成功 ${successCount}，失败 ${failureCount}`;

  if (stepKey === 'step1') {
    const folderText = folderName ? `（文件夹：${folderName}）` : '';
    return `把任务标签为 ${tag || '-'} 的 ${totalCount} 张图${folderText}上传到图库了，${baseStatus}`;
  }
  if (stepKey === 'step2') {
    return `把任务标签为 ${tag || '-'} 的 ${totalCount} 张图设计为成品了，${baseStatus}`;
  }
  if (stepKey === 'step3') {
    return `把任务标签为 ${tag || '-'} 的成品 ${totalCount} 个汇出到 ${shopName || '-'} 店铺了，${baseStatus}`;
  }
  return `任务完成，${baseStatus}`;
}

function buildHistoryMeta(stepKey, result, context = {}) {
  const parts = [`标签：${context.tag || result?.tag || '-'}`];
  if (stepKey === 'step3') {
    parts.push(`店铺：${result?.shopName || context.shopName || '-'}`);
  }
  if (stepKey === 'step1' && result?.failureDir) {
    parts.push(`失败目录：${result.failureDir}`);
  }
  return parts.join(' | ');
}

function createHistoryEntries(lastResult, currentTask) {
  const result = lastResult?.result || {};
  const status = String(lastResult?.status || 'success');
  const finishedAt = String(lastResult?.finishedAt || '').trim();
  const baseContext = {
    tag: currentTask?.tag || result.tag || '',
    shopName: currentTask?.shopName || result.shopName || '',
    imageCount: currentTask?.imageCount || 0,
    folderName: String(currentTask?.folderPath || '')
      .split(/[\\/]/)
      .filter(Boolean)
      .pop() || '',
  };

  if (status === 'success' && result.stepResults) {
    const entries = [];
    if (result.stepResults.step1) {
      const entryStatus = getEntryStatus(status, result.stepResults.step1);
      entries.push({
        id: `${finishedAt}-step1-${baseContext.tag}`,
        time: finishedAt,
        status: entryStatus,
        statusText: getResultStatusText(entryStatus),
        text: buildHistoryLine('step1', result.stepResults.step1, baseContext, entryStatus),
        meta: buildHistoryMeta('step1', result.stepResults.step1, baseContext),
      });
    }
    if (result.stepResults.step2) {
      const entryStatus = getEntryStatus(status, result.stepResults.step2);
      entries.push({
        id: `${finishedAt}-step2-${baseContext.tag}`,
        time: finishedAt,
        status: entryStatus,
        statusText: getResultStatusText(entryStatus),
        text: buildHistoryLine('step2', result.stepResults.step2, baseContext, entryStatus),
        meta: buildHistoryMeta('step2', result.stepResults.step2, baseContext),
      });
    }
    if (result.stepResults.step3) {
      const finalShopName = result.stepResults.step3.shopName || baseContext.shopName || '';
      const entryStatus = getEntryStatus(status, result.stepResults.step3);
      entries.push({
        id: `${finishedAt}-step3-${baseContext.tag}-${finalShopName}`,
        time: finishedAt,
        status: entryStatus,
        statusText: getResultStatusText(entryStatus),
        text: buildHistoryLine('step3', result.stepResults.step3, { ...baseContext, shopName: finalShopName }, entryStatus),
        meta: buildHistoryMeta('step3', result.stepResults.step3, { ...baseContext, shopName: finalShopName }),
      });
    }
    return entries;
  }

  let stepKey = 'step1';
  if (result.shopName || currentTask?.mode === 'step3') stepKey = 'step3';
  else if (result.templateId || currentTask?.mode === 'step2') stepKey = 'step2';

  const entryStatus = getEntryStatus(status, result);
  return [{
    id: `${finishedAt}-${stepKey}-${baseContext.tag}-${baseContext.shopName}`,
    time: finishedAt,
    status: entryStatus,
    statusText: getResultStatusText(entryStatus),
    text: buildHistoryLine(stepKey, result, baseContext, entryStatus),
    meta: buildHistoryMeta(stepKey, result, baseContext),
  }];
}

function pushTaskHistory(lastResult, currentTask) {
  const entries = createHistoryEntries(lastResult, currentTask);
  let changed = false;
  for (const entry of entries) {
    if (!entry?.id) continue;
    if (taskHistory.some((item) => item.id === entry.id)) continue;
    taskHistory.push(entry);
    changed = true;
  }
  if (!changed) return;
  taskHistory = taskHistory.slice(-50);
  saveTaskHistory();
  renderTaskHistory();
}

function formatFriendlyResultText(type, result) {
  if (!result) return '';
  const successCount = Number(result.successCount || result.count || 0);
  const failureCount = Number(result.failureCount || 0);

  if (type === 'step1') {
    return failureCount
      ? `上传 ${successCount} 张图片，失败 ${failureCount} 张`
      : `上传 ${successCount} 张图片`;
  }

  if (type === 'step2') {
    return failureCount
      ? `设计 ${successCount} 个成品，失败 ${failureCount} 个`
      : `设计 ${successCount} 个成品`;
  }

  if (type === 'step3') {
    const shopName = String(result.shopName || '').trim();
    const targetText = shopName ? `到 ${shopName}` : '';
    return failureCount
      ? `汇出 ${successCount} 个产品${targetText}，失败 ${failureCount} 个`
      : `汇出 ${successCount} 个产品${targetText}`;
  }

  return failureCount
    ? `成功 ${successCount}，失败 ${failureCount}`
    : `成功 ${successCount}`;
}

function buildResultSummary(lastResult) {
  const result = lastResult?.result || {};
  const stepResults = result.stepResults || null;

  if (stepResults) {
    const lines = [];
    if (stepResults.step1) lines.push(formatFriendlyResultText('step1', stepResults.step1));
    if (stepResults.step2) lines.push(formatFriendlyResultText('step2', stepResults.step2));
    if (stepResults.step3) lines.push(formatFriendlyResultText('step3', stepResults.step3));
    return lines.filter(Boolean).join(' | ');
  }

  if (result.shopName) return formatFriendlyResultText('step3', result);
  if (result.templateId || result.templateName) return formatFriendlyResultText('step2', result);
  if (result.tag && (result.dir || result.results)) return formatFriendlyResultText('step1', result);

  const successCount = Number(result.successCount || result.count || 0);
  const failureCount = Number(result.failureCount || 0);
  if (!successCount && !failureCount) return '';
  return failureCount ? `成功 ${successCount}，失败 ${failureCount}` : `成功 ${successCount}`;
}

function getFailureSections(lastResult, currentTask) {
  const result = lastResult?.result || {};
  const baseContext = {
    tag: currentTask?.tag || result.tag || '',
    shopName: currentTask?.shopName || result.shopName || '',
    shopNames: Array.isArray(result.shopNames) ? result.shopNames : (Array.isArray(currentTask?.shopNames) ? currentTask.shopNames : []),
    designTemplateName: currentTask?.designTemplateName || result.designTemplateName || '',
    exportTemplateName: currentTask?.exportTemplateName || result.exportTemplateName || '',
  };
  const sections = [];
  const pushSection = (stepKey, stepResult, context = baseContext) => {
    if (!stepResult || Number(stepResult.failureCount || 0) <= 0) return;
    sections.push({
      stepKey,
      stepLabel: getStepLabel(stepKey),
      tag: stepResult.tag || context.tag || '',
      shopName: stepResult.shopName || context.shopName || '',
      shopNames: Array.isArray(stepResult.shopNames) && stepResult.shopNames.length ? stepResult.shopNames : context.shopNames,
      designTemplateName: stepResult.designTemplateName || context.designTemplateName || '',
      exportTemplateName: stepResult.exportTemplateName || context.exportTemplateName || '',
      failureCount: Number(stepResult.failureCount || 0),
      totalCount: Math.max(
        Number(stepResult.totalCount || 0),
        Number(stepResult.count || 0),
        Number(stepResult.successCount || 0) + Number(stepResult.failureCount || 0),
      ),
      failureDir: String(stepResult.failureDir || '').trim(),
      failures: Array.isArray(stepResult.failures) ? stepResult.failures : [],
    });
  };

  if (result.stepResults) {
    pushSection('step1', result.stepResults.step1);
    pushSection('step2', result.stepResults.step2);
    pushSection('step3', result.stepResults.step3);
    return sections;
  }

  let stepKey = 'step1';
  if (result.shopName || currentTask?.mode === 'step3') stepKey = 'step3';
  else if (result.templateId || result.templateName || currentTask?.mode === 'step2') stepKey = 'step2';
  pushSection(stepKey, result);
  return sections;
}

function renderResultPanel(lastResult, currentTask, logs = []) {
  const status = getLastResultStatus(lastResult);
  resultPanel.className = 'result-panel';
  resultPanel.classList.add(`is-${status}`);
  resultPanelTitle.textContent = status === 'partial' ? '本次结果（有失败）' : '本次结果';
  resultPanelStatus.textContent = getResultStatusText(status);

  if (!lastResult) {
    resultPanelSummary.textContent = '暂无结果';
    failurePanel.classList.add('is-hidden');
    failureSummary.textContent = '';
    failureMeta.textContent = '';
    failureList.innerHTML = '';
    return;
  }

  if (status === 'error') {
    resultPanelSummary.textContent = getRealErrorMessage(lastResult.message, logs) || lastResult.message || '任务失败';
  } else if (status === 'stopped') {
    resultPanelSummary.textContent = '任务已手动停止';
  } else {
    resultPanelSummary.textContent = buildResultSummary(lastResult) || lastResult.result?.message || '任务完成';
  }

  const sections = getFailureSections(lastResult, currentTask);
  if (!sections.length) {
    failurePanel.classList.add('is-hidden');
    failureSummary.textContent = '';
    failureMeta.textContent = '';
    failureList.innerHTML = '';
    return;
  }

  const totalFailures = sections.reduce((sum, item) => sum + Number(item.failureCount || 0), 0);
  failurePanel.classList.remove('is-hidden');
  failureSummary.textContent = `发现 ${totalFailures} 个失败项，已写入报告；第一步失败图片会自动复制到失败目录。`;
  failureMeta.textContent = sections.map((section) => {
    const parts = [
      `${section.stepLabel}失败 ${section.failureCount} 个`,
      `标签：${section.tag || '-'}`,
    ];
    if (section.shopNames?.length) parts.push(`店铺：${section.shopNames.join('、')}`);
    if (section.designTemplateName) parts.push(`公版：${section.designTemplateName}`);
    if (section.failureDir) parts.push(`失败目录：${section.failureDir}`);
    return parts.join(' | ');
  }).join(' ｜ ');

  let remaining = 100;
  failureList.innerHTML = sections.map((section) => {
    const items = [];
    for (const item of section.failures) {
      if (remaining <= 0) break;
      items.push(item);
      remaining -= 1;
    }
    const hiddenCount = Math.max(0, section.failures.length - items.length);
    const rows = items.map((item) => {
      const title = item.title || item.imageTitle || item.productId || item.filePath || '未命名';
      const parts = [
        `<div class="failure-item-name">${escapeHtml(String(title))}</div>`,
        `<div class="failure-item-reason">${escapeHtml(formatFailureReason(item.error))}</div>`,
      ];
      if (item.copiedTo) {
        parts.push(`<div class="failure-item-meta">已复制到：${escapeHtml(item.copiedTo)}</div>`);
      } else if (item.copyError) {
        parts.push(`<div class="failure-item-meta is-error">复制失败：${escapeHtml(item.copyError)}</div>`);
      }
      return `<div class="failure-item">${parts.join('')}</div>`;
    }).join('');
    const more = hiddenCount > 0
      ? `<div class="failure-more">其余 ${hiddenCount} 条未展开，完整内容请看报告 JSON。</div>`
      : '';
    return `
      <div class="failure-section">
        <div class="failure-section-title">${escapeHtml(section.stepLabel)}：失败 ${section.failureCount} 个 / 总数 ${section.totalCount || '-'}</div>
        ${rows || '<div class="failure-empty-line">本步骤没有可展示的失败明细。</div>'}
        ${more}
      </div>
    `;
  }).join('');
}

function buildFailureDigest(lastResult, currentTask) {
  const sections = getFailureSections(lastResult, currentTask);
  if (!sections.length) return '';
  const firstSection = sections[0];
  const names = firstSection.failures
    .slice(0, 5)
    .map((item) => item.title || item.imageTitle || item.productId || formatPathTail(item.filePath))
    .filter(Boolean);
  const parts = [];
  if (firstSection.failureDir) parts.push(`失败目录：${firstSection.failureDir}`);
  if (names.length) parts.push(`失败文件：${names.join('、')}${firstSection.failures.length > names.length ? ' 等' : ''}`);
  return parts.join(' | ');
}

function renderStatus(payload) {
  const { running, currentTask, logs, version, lastResult, auth } = payload;
  const metrics = currentTask?.metrics || {};
  const resultStatus = getLastResultStatus(lastResult);
  runningText.textContent = running ? '运行中' : (resultStatus === 'partial' ? '部分失败' : '空闲');
  if (runStateDot) {
    runStateDot.classList.toggle('active', !!running);
  }
  const fallbackStage = resultStatus === 'partial'
    ? '已完成但有失败'
    : (lastResult?.status === 'error' ? '执行失败' : (lastResult?.status === 'stopped' ? '已停止' : '未开始'));
  const stageSource = running ? (currentTask?.stage || '未开始') : fallbackStage;
  stageText.textContent = getUserStageText(stageSource, currentTask);
  imageCountText.textContent = formatCount(metrics.total || currentTask?.imageCount || 0, metrics.unit || '项');
  currentIndexText.textContent = formatCurrentProgress(metrics);
  completedCountText.textContent = formatCount(metrics.completed || 0, metrics.unit || '项');
  versionText.textContent = version || 'v1';
  statusHintText.textContent = (!running && resultStatus === 'partial')
    ? '本次任务有失败项，请查看下方失败明细'
    : (metrics.action || '等待开始');
  const progress = currentTask?.progress || 0;
  progressText.textContent = `${progress}%`;
  progressBar.style.width = `${progress}%`;
  renderLogs(logs);
  renderTaskHistory();
  renderResultPanel(lastResult, currentTask, logs);
  renderAuth(auth);
  renderSteps(currentTask);
  updateActionButtons(running, queue.length > 0);

  if (!running && lastResult?.finishedAt && lastResult.finishedAt !== lastTaskFinishedAt) {
    lastTaskFinishedAt = lastResult.finishedAt;
    pushTaskHistory(lastResult, currentTask);
    const reportText = findResultReportFile(lastResult, currentTask);
    const summaryText = buildResultSummary(lastResult);
    if (lastResult.status === 'success') {
      const base = lastResult.result?.message || '任务完成';
      const parts = [base];
      if (summaryText) parts.push(summaryText);
      const failureDigest = buildFailureDigest(lastResult, currentTask);
      if (failureDigest) parts.push(failureDigest);
      if (reportText) parts.push(`报告：${reportText}`);
      setMessage(parts.join(' | '));
    } else if (lastResult.status === 'error') {
      const realError = getRealErrorMessage(lastResult.message, logs);
      const parts = [realError || lastResult.message || '任务失败'];
      if (summaryText) parts.push(summaryText);
      if (reportText) parts.push(`报告：${reportText}`);
      setMessage(parts.join(' | '), true);
    } else if (lastResult.status === 'stopped') {
      setMessage('任务已停止', true);
    }
  }
}

function getRealErrorMessage(message, logs = []) {
  const rawMessage = String(message || '').trim();
  if (rawMessage && !/^子进程退出码:/i.test(rawMessage)) {
    return rawMessage;
  }

  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const item = logs[index] || {};
    const text = String(item.message || '').trim();
    if (!text) continue;
    if (text === '任务失败') continue;
    if (text.startsWith('[STEP') && text.includes('失败:')) {
      return text.replace(/^\[STEP\d-API\]\s*失败:\s*/i, '').trim();
    }
    if (text.includes('未找到标签为') || text.includes('请求失败') || text.includes('登录态无效')) {
      return text;
    }
  }

  return rawMessage;
}

function buildAutoSkc(shopName) {
  const match = String(shopName || '').match(/^(\d*)TEMU(.+)$/i);
  if (!match) {
    const cleaned = String(shopName || '')
      .replace(/TEMU/gi, '')
      .replace(/[\u4e00-\u9fa5]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 4);
    if (!cleaned) return '';
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${cleaned}${y}${m}${d}`;
  }
  const prefix = match[1] || '';
  const suffix = match[2] || '';
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${prefix}TE${suffix}${y}${m}${d}`;
}

function syncTagPreview() {
  step2TagPreview.value = tagInput.value.trim();
}

function getSelectedSteps() {
  const steps = [];
  if (step1Enabled.checked) steps.push('step1');
  if (step2Enabled.checked) steps.push('step2');
  if (step3Enabled.checked) steps.push('step3');
  return steps;
}

function buildCommonPayload() {
  const normalizedFolderPath = normalizeFolderPath(folderPathInput.value);
  if (folderPathInput.value !== normalizedFolderPath) {
    folderPathInput.value = normalizedFolderPath;
  }
  const exportTargets = multiExportTargets.map((target) => ({ ...target }));
  const shopNames = exportTargets.length
    ? exportTargets.map((target) => target.shopName).filter(Boolean)
    : [shopSelectInput.value.trim()].filter(Boolean);
  const primaryTarget = exportTargets[0] || null;
  return {
    folderPath: normalizedFolderPath,
    tag: tagInput.value.trim(),
    designTemplateName: designTemplateInput.value.trim(),
    maximizeDesign: step2MaximizeInput.checked,
    shopName: shopSelectInput.value.trim() || primaryTarget?.shopName || '',
    shopNames,
    exportTemplateName: exportTemplateInput.value.trim() || primaryTarget?.exportTemplateName || '',
    skc: skcInput.value.trim() || primaryTarget?.skc || '',
    exportTargets,
  };
}

function getPayloadExportTargets(payload) {
  const targets = Array.isArray(payload.exportTargets) ? payload.exportTargets.filter((item) => item.shopName) : [];
  if (targets.length) return targets;
  if (!payload.shopName && !payload.exportTemplateName && !payload.skc) return [];
  return [{
    shopName: payload.shopName,
    exportTemplateName: payload.exportTemplateName,
    skc: payload.skc,
  }];
}

function validatePayloadForSteps(payload, steps) {
  clearFieldErrors();
  if (!Array.isArray(steps) || !steps.length) {
    throw new Error('请至少勾选一个步骤');
  }

  if (steps.includes('step1')) {
    if (!payload.folderPath) {
      markInvalidField(folderPathInput);
      applyFieldErrorStyles();
      throw new Error('请先填写或选择图片文件夹');
    }
  }

  if (steps.includes('step2')) {
    if (!payload.tag) {
      markInvalidField(tagInput);
      applyFieldErrorStyles();
      throw new Error('请先填写统一标签');
    }
    if (!payload.designTemplateName) {
      markInvalidField(designTemplateInput);
      applyFieldErrorStyles();
      throw new Error('请先选择设计公版');
    }
  }

  if (steps.includes('step3')) {
    const exportTargets = getPayloadExportTargets(payload);
    if (!payload.tag) {
      markInvalidField(tagInput);
      applyFieldErrorStyles();
      throw new Error('请先填写统一标签');
    }
    if (!exportTargets.length || exportTargets.some((target) => !target.shopName)) {
      markInvalidField(shopSelectInput);
      applyFieldErrorStyles();
      throw new Error('请先选择汇出店铺');
    }
    if (exportTargets.some((target) => !target.exportTemplateName)) {
      markInvalidField(exportTemplateInput);
      applyFieldErrorStyles();
      throw new Error('请先选择汇出模板');
    }
  }

  applyFieldErrorStyles();
}

function loadQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function loadTaskHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getQueueStatusText(status) {
  const mapping = {
    queued: '待执行',
    running: '运行中',
    done: '已完成',
    failed: '失败',
  };
  return mapping[status] || status;
}

function saveQueue() {
  localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
}

function saveTaskHistory() {
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(taskHistory.slice(-50)));
}

function getTaskTitle(task) {
  const folderName = String(task.folderPath || '')
    .split(/[\\/]/)
    .filter(Boolean)
    .pop();
  const folderText = folderName ? `文件夹：${folderName}` : '文件夹：未设置';
  const tagText = `标签：${task.tag || '自动标签'}`;
  return `${folderText} | ${tagText}`;
}

function getStepLabel(step) {
  const map = {
    step1: '上传图库',
    step2: '批量设计',
    step3: '成品汇出',
  };
  return map[step] || step;
}

function renderQueue() {
  const waiting = queue.filter((item) => item.status === 'queued').length;
  const doing = queue.filter((item) => item.status === 'running').length;
  const done = queue.filter((item) => item.status === 'done').length;
  const failed = queue.filter((item) => item.status === 'failed').length;
  if (!queue.length) {
    queueSummary.textContent = '空队列';
  } else if (queueRunning && hasQueueWork()) {
    queueSummary.textContent = `运行中：待执行 ${waiting} ｜ 进行中 ${doing} ｜ 完成 ${done} ｜ 失败 ${failed}`;
  } else {
    queueSummary.textContent = `未启动：待执行 ${waiting} ｜ 完成 ${done} ｜ 失败 ${failed}`;
  }

  if (!queue.length) {
    queueList.innerHTML = '<div class="queue-empty">暂无排队任务。需要批量跑时，先把当前表单加入队列。</div>';
    updateActionButtons(runningText.textContent === '运行中', false);
    return;
  }

  queueList.innerHTML = queue.map((item) => {
    const stepsText = item.steps.map(getStepLabel).join(' → ');
    const errorText = item.error ? `<div class="queue-meta queue-error">${escapeHtml(item.error)}</div>` : '';
    const canDelete = item.status !== 'running';
    const deleteButton = canDelete
      ? `<button class="queue-delete-btn" type="button" data-id="${escapeHtml(item.id)}">删除</button>`
      : '';
    return `
      <div class="queue-item">
        <div class="queue-item-top">
          <div class="queue-title">${escapeHtml(getTaskTitle(item))}</div>
            <div class="queue-item-actions">
            <div class="queue-status is-${escapeHtml(item.status)}">${escapeHtml(getQueueStatusText(item.status))}</div>
            ${deleteButton}
          </div>
        </div>
        <div class="queue-meta">步骤：${escapeHtml(stepsText)}</div>
        <div class="queue-meta">公版：${escapeHtml(item.designTemplateName || '-')} | 店铺：${escapeHtml(item.shopName || '-')}</div>
        ${errorText}
      </div>
    `;
  }).join('');
  updateActionButtons(runningText.textContent === '运行中', true);
}

function renderMultiShopList() {
  if (!multiExportTargets.length) {
    multiShopList.innerHTML = '<div class="multi-shop-empty">未加入多店铺时，默认使用当前选择的店铺。</div>';
    return;
  }

  multiShopList.innerHTML = multiExportTargets.map((target) => `
    <div class="multi-shop-item">
      <div class="multi-shop-main">
        <div class="multi-shop-name">${escapeHtml(target.shopName || '-')}</div>
        <div class="multi-shop-meta">模板：${escapeHtml(target.exportTemplateName || '-')}</div>
        <div class="multi-shop-meta">SKC：${escapeHtml(target.skc || buildAutoSkc(target.shopName) || '-')}</div>
      </div>
      <button class="multi-shop-remove" type="button" data-shop="${escapeHtml(target.shopName || '')}">删除</button>
    </div>
  `).join('');
}

function addCurrentShopToMultiTargets() {
  const shopName = shopSelectInput.value.trim();
  const exportTemplateName = exportTemplateInput.value.trim();
  const skc = skcInput.value.trim() || buildAutoSkc(shopName);
  if (!shopName) throw new Error('请先选择要加入的店铺');
  if (!exportTemplateName) throw new Error('请先选择该店铺的汇出模板');

  const nextTarget = { shopName, exportTemplateName, skc };
  const existingIndex = multiExportTargets.findIndex((item) => item.shopName === shopName);
  if (existingIndex >= 0) {
    multiExportTargets[existingIndex] = nextTarget;
    setMessage(`已更新多店铺：${shopName}`);
  } else {
    multiExportTargets.push(nextTarget);
    setMessage(`已加入多店铺：${shopName}`);
  }
  renderMultiShopList();
}

function removeMultiShopTarget(shopName) {
  multiExportTargets = multiExportTargets.filter((item) => item.shopName !== shopName);
  renderMultiShopList();
  setMessage(`已删除多店铺：${shopName}`);
}

function renderTaskHistory() {
  if (!taskHistory.length) {
    historyList.innerHTML = '<div class="history-empty">暂无历史任务。任务完成后会自动记录在这里。</div>';
    return;
  }

  const visibleHistory = taskHistory
    .map((item, originalIndex) => ({ item, originalIndex }))
    .sort((left, right) => {
      const timeDelta = parseHistoryTime(right.item.time) - parseHistoryTime(left.item.time);
      if (timeDelta) return timeDelta;
      return right.originalIndex - left.originalIndex;
    })
    .map((entry) => entry.item);

  historyList.innerHTML = visibleHistory.map((item, index) => `
    <div class="history-item is-${escapeHtml(item.status)}">
      <div class="history-top">
        <div class="history-top-left">
          <div class="history-index">${index + 1}</div>
          <div class="history-time">${escapeHtml(item.time || '-')}</div>
        </div>
        <div class="history-status">${escapeHtml(item.statusText || '-')}</div>
      </div>
      <div class="history-text">${escapeHtml(item.text || '')}</div>
      ${item.meta ? `<div class="history-meta">${escapeHtml(item.meta)}</div>` : ''}
    </div>
  `).join('');
}

function parseHistoryTime(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
  if (match) {
    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6]),
    ).getTime();
  }
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function removeQueueItem(id) {
  const target = queue.find((item) => item.id === id);
  if (!target) return;
  if (target.status === 'running') {
    setMessage('运行中的任务不能直接删除，请先停止', true);
    return;
  }
  queue = queue.filter((item) => item.id !== id);
  saveQueue();
  renderQueue();
  setMessage('已删除队列任务');
}

function filterDesignTemplates() {
  const keyword = designTemplateSearchInput.value.trim().toLowerCase();
  const selectedValue = designTemplateInput.value;
  const filtered = keyword
    ? designTemplates.filter((item) => String(item.name || '').toLowerCase().includes(keyword))
    : designTemplates;
  renderSelectOptions(designTemplateInput, filtered, filtered.length ? '请选择设计公版' : '未找到匹配公版', selectedValue);
}

async function fetchStatus() {
  const response = await fetch('/api/status');
  const json = await response.json();
  if (json.ok) {
    renderStatus(json.data);
    await tickQueue(json.data);
  }
}

async function pickFolder() {
  setMessage('正在打开文件夹选择器...');
  const response = await fetch('/api/pick-folder', { method: 'POST' });
  const json = await response.json();
  if (!json.ok) return setMessage(json.message || '选择文件夹失败', true);
  folderPathInput.value = json.data?.folderPath || '';
  clearFieldErrors();
  if (folderPathInput.value) {
    setMessage(`已选择文件夹：${folderPathInput.value}`);
  } else {
    setMessage('已选择文件夹');
  }
}

async function saveAuth() {
  const payload = {
    token: tokenInput.value.trim(),
    factoryId: factoryIdInput.value.trim(),
    masterFactoryId: masterFactoryIdInput.value.trim(),
    session: sessionInput.value.trim(),
    source: 'manual',
  };
  const response = await fetch('/api/auth/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await response.json();
  if (!json.ok) return setMessage(json.message || '保存鉴权失败', true);
  setMessage('鉴权已保存');
  await fetchStatus();
  await Promise.allSettled([loadDesignTemplates(), loadShops()]);
}

async function clearAuth() {
  const response = await fetch('/api/auth/clear', { method: 'POST' });
  const json = await response.json();
  if (!json.ok) return setMessage(json.message || '清空鉴权失败', true);
  tokenInput.value = '';
  factoryIdInput.value = '';
  masterFactoryIdInput.value = '';
  sessionInput.value = '';
  renderSelectOptions(designTemplateInput, [], '请先同步登录态');
  renderSelectOptions(shopSelectInput, [], '请先同步登录态');
  renderSelectOptions(exportTemplateInput, [], '请先选择店铺');
  skcInput.value = '';
  multiExportTargets = [];
  renderMultiShopList();
  setMessage('鉴权已清空');
  await fetchStatus();
}

async function loadDesignTemplates() {
  const response = await fetch('/api/step2/templates');
  const json = await response.json();
  if (!json.ok) {
    designTemplates = [];
    filterDesignTemplates();
    return;
  }
  designTemplates = json.data || [];
  filterDesignTemplates();
}

async function loadShops() {
  const response = await fetch('/api/step3/shops');
  const json = await response.json();
  if (!json.ok) {
    renderSelectOptions(shopSelectInput, [], '店铺加载失败');
    renderSelectOptions(exportTemplateInput, [], '请先选择店铺');
    return;
  }
  shops = json.data || [];
  renderSelectOptions(shopSelectInput, shops, '请选择汇出店铺', shopSelectInput.value);
}

async function loadExportTemplates() {
  const selected = shopSelectInput.selectedOptions[0];
  const shopId = selected?.dataset?.id || '';
  if (!shopId) {
    renderSelectOptions(exportTemplateInput, [], '请先选择店铺');
    skcInput.value = '';
    return;
  }
  if (!skcInput.dataset.touched || skcInput.dataset.touched === '0') {
    skcInput.value = buildAutoSkc(shopSelectInput.value);
  }
  renderSelectOptions(exportTemplateInput, [], '模板加载中...');
  const response = await fetch(`/api/step3/templates?shopId=${encodeURIComponent(shopId)}`);
  const json = await response.json();
  if (!json.ok) return renderSelectOptions(exportTemplateInput, [], '模板加载失败');
  exportTemplates = json.data || [];
  renderSelectOptions(exportTemplateInput, exportTemplates, '请选择汇出模板', exportTemplateInput.value);
}

async function postTask(url, payload, successText) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await response.json();
  if (!json.ok) {
    setMessage(json.message || '启动失败', true);
    throw new Error(json.message || '启动失败');
  }
  setMessage(successText);
  await fetchStatus();
  return json;
}

function createQueueItemFromPayload(payload, steps, target = null, index = 0) {
  const shopName = target?.shopName || payload.shopName || '';
  const shopNames = Array.isArray(payload.shopNames) && payload.shopNames.length
    ? payload.shopNames
    : [shopName].filter(Boolean);
  return {
    id: `job_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    status: 'queued',
    error: '',
    folderPath: payload.folderPath,
    tag: payload.tag,
    designTemplateName: payload.designTemplateName,
    maximizeDesign: !!payload.maximizeDesign,
    shopName,
    shopNames,
    exportTemplateName: target?.exportTemplateName || payload.exportTemplateName || '',
    skc: target?.skc || payload.skc || buildAutoSkc(shopName),
    steps,
  };
}

function buildQueueItemsForPayload(payload, steps) {
  validatePayloadForSteps(payload, steps);
  if (!steps.includes('step3')) {
    if (getPayloadExportTargets(payload).length > 1) {
      throw new Error('多店铺汇出必须勾选第三步');
    }
    return [createQueueItemFromPayload(payload, steps)];
  }

  const targets = getPayloadExportTargets(payload);
  return targets.map((target, index) => createQueueItemFromPayload(
    payload,
    index === 0 ? steps : ['step3'],
    target,
    index,
  ));
}

function taskPayloadFromQueueItem(item) {
  return {
    folderPath: item.folderPath,
    tag: item.tag,
    designTemplateName: item.designTemplateName,
    maximizeDesign: !!item.maximizeDesign,
    shopName: item.shopName,
    shopNames: item.shopNames,
    exportTemplateName: item.exportTemplateName,
    skc: item.skc,
    steps: item.steps,
  };
}

async function enqueueAndMaybeRun(items, message, shouldRun = false) {
  queue.push(...items);
  if (runningText.textContent === '运行中' || shouldRun) {
    queueRunning = true;
  }
  saveQueue();
  renderQueue();
  setMessage(message);
  if (shouldRun) {
    await fetchStatus();
  }
}

async function runPipeline() {
  if (isQueueLocked()) {
    throw new Error('队列正在运行，请先等待队列完成或停止当前任务');
  }
  const steps = getSelectedSteps();
  const payload = buildCommonPayload();
  const items = buildQueueItemsForPayload(payload, steps);
  if (items.length > 1) {
    await enqueueAndMaybeRun(items, `已生成 ${items.length} 个店铺任务，开始按队列执行`, true);
    clearSubmittedTaskForm();
    return null;
  }
  const result = await postTask('/api/start-pipeline', taskPayloadFromQueueItem(items[0]), '当前任务已开始执行');
  clearSubmittedTaskForm();
  return result;
}

async function runStep1Only() {
  if (isQueueLocked()) {
    throw new Error('队列正在运行，请先等待队列完成或停止当前任务');
  }
  const payload = buildCommonPayload();
  validatePayloadForSteps(payload, ['step1']);
  return postTask('/api/start-step1', payload, '第1步已启动');
}

async function runStep2Only() {
  if (isQueueLocked()) {
    throw new Error('队列正在运行，请先等待队列完成或停止当前任务');
  }
  const payload = buildCommonPayload();
  validatePayloadForSteps(payload, ['step2']);
  return postTask('/api/start-step2', {
    tag: payload.tag,
    templateName: payload.designTemplateName,
    maximizeDesign: payload.maximizeDesign,
  }, '第2步已启动');
}

async function runStep3Only() {
  if (isQueueLocked()) {
    throw new Error('队列正在运行，请先等待队列完成或停止当前任务');
  }
  const payload = buildCommonPayload();
  const items = buildQueueItemsForPayload(payload, ['step3']);
  if (items.length > 1) {
    await enqueueAndMaybeRun(items, `已生成 ${items.length} 个店铺汇出任务，开始按队列执行`, true);
    return null;
  }
  return postTask('/api/start-step3', {
    tag: items[0].tag,
    shopName: items[0].shopName,
    templateName: items[0].exportTemplateName,
    skc: items[0].skc,
  }, '第3步已启动');
}

async function stopTask() {
  const confirmed = window.confirm('确定要停止当前正在执行的任务吗？');
  if (!confirmed) return;
  const response = await fetch('/api/stop', { method: 'POST' });
  const json = await response.json();
  if (!json.ok) return setMessage(json.message || '停止失败', true);
  queueRunning = false;
  setMessage('任务已停止，队列已暂停');
  await fetchStatus();
}

function createQueueItem() {
  const payload = buildCommonPayload();
  const steps = getSelectedSteps();
  return buildQueueItemsForPayload(payload, steps);
}

function addCurrentTaskToQueue() {
  const items = createQueueItem();
  queue.push(...items);
  const isRunning = runningText.textContent === '运行中';
  if (isRunning) queueRunning = true;
  saveQueue();
  renderQueue();
  const firstTitle = getTaskTitle(items[0]);
  clearSubmittedTaskForm();
  if (runningText.textContent === '运行中') {
    setMessage(`已加入队列 ${items.length} 个任务：${firstTitle}；当前任务结束后会自动继续执行队列`);
    return;
  }
  setMessage(`已加入队列 ${items.length} 个任务：${firstTitle}`);
}

async function dispatchQueueItem(item) {
  currentQueueJobId = item.id;
  item.status = 'running';
  item.error = '';
  saveQueue();
  renderQueue();
  await postTask('/api/start-pipeline', {
    ...taskPayloadFromQueueItem(item),
  }, `队列任务已启动：${getTaskTitle(item)}`);
}

async function runQueue() {
  if (runningText.textContent === '运行中') {
    setMessage('当前已有任务在运行，不能启动队列', true);
    return;
  }
  const hasQueued = queue.some((item) => item.status === 'queued');
  const hasRunning = queue.some((item) => item.status === 'running');
  if (!hasQueued && !hasRunning) {
    setMessage('队列里还没有待执行任务，请先点“加入队列”', true);
    renderQueue();
    return;
  }
  if (queueRunning && hasQueueWork()) {
    setMessage('队列已经在运行中');
    return;
  }
  queueRunning = true;
  setMessage(hasRunning ? '队列监控已恢复' : '队列已启动');
  renderQueue();
  await fetchStatus();
}

function clearQueue() {
  queue = queue.filter((item) => item.status === 'running');
  if (!queue.length) {
    queueRunning = false;
  }
  saveQueue();
  renderQueue();
  setMessage('已清空待执行队列');
}

async function tickQueue(statusData) {
  if (!queue.length) {
    queueRunning = false;
    currentQueueJobId = '';
    renderQueue();
    return;
  }

  const runningJob = queue.find((item) => item.status === 'running');
  if (runningJob && !statusData.running) {
    const isSuccess = statusData.lastResult?.status === 'success';
    runningJob.status = isSuccess ? 'done' : 'failed';
    runningJob.error = isSuccess ? '' : (statusData.lastResult?.message || '任务失败');
    currentQueueJobId = '';
    saveQueue();
    renderQueue();
  }

  if (!queueRunning || statusData.running) {
    if (!statusData.running && !queue.some((item) => item.status === 'queued' || item.status === 'running')) {
      queueRunning = false;
      renderQueue();
    }
    return;
  }

  const next = queue.find((item) => item.status === 'queued');
  if (!next) {
    queueRunning = false;
    renderQueue();
    return;
  }

  try {
    await dispatchQueueItem(next);
  } catch (error) {
    next.status = 'failed';
    next.error = error.message || String(error);
    currentQueueJobId = '';
    saveQueue();
    renderQueue();
  }
}

pickFolderBtn.addEventListener('click', () => pickFolder().catch((error) => setMessage(error.message || String(error), true)));
refreshTagBtn.addEventListener('click', refreshTaskTag);
addQueueBtn.addEventListener('click', () => {
  try {
    addCurrentTaskToQueue();
  } catch (error) {
    setMessage(error.message || String(error), true);
  }
});
addMultiShopBtn.addEventListener('click', () => {
  try {
    addCurrentShopToMultiTargets();
  } catch (error) {
    setMessage(error.message || String(error), true);
  }
});
runQueueBtn.addEventListener('click', () => runQueue().catch((error) => setMessage(error.message || String(error), true)));
clearQueueBtn.addEventListener('click', clearQueue);
queueList.addEventListener('click', (event) => {
  const button = event.target.closest('.queue-delete-btn');
  if (!button) return;
  removeQueueItem(button.dataset.id || '');
});
multiShopList.addEventListener('click', (event) => {
  const button = event.target.closest('.multi-shop-remove');
  if (!button) return;
  removeMultiShopTarget(button.dataset.shop || '');
});
saveAuthBtn.addEventListener('click', () => saveAuth().catch((error) => setMessage(error.message || String(error), true)));
clearAuthBtn.addEventListener('click', () => clearAuth().catch((error) => setMessage(error.message || String(error), true)));
startPipelineBtn.addEventListener('click', () => runPipeline().catch((error) => setMessage(error.message || String(error), true)));
runStep1Btn.addEventListener('click', () => runStep1Only().catch((error) => setMessage(error.message || String(error), true)));
runStep2Btn.addEventListener('click', () => runStep2Only().catch((error) => setMessage(error.message || String(error), true)));
runStep3Btn.addEventListener('click', () => runStep3Only().catch((error) => setMessage(error.message || String(error), true)));
stopBtn.addEventListener('click', () => stopTask().catch((error) => setMessage(error.message || String(error), true)));
shopSelectInput.addEventListener('change', () => {
  skcInput.dataset.touched = '0';
  loadExportTemplates().catch((error) => setMessage(error.message || String(error), true));
});
skcInput.addEventListener('input', () => {
  skcInput.dataset.touched = '1';
});
designTemplateSearchInput.addEventListener('input', filterDesignTemplates);
folderPathInput.addEventListener('input', clearFieldErrors);
folderPathInput.addEventListener('blur', () => {
  const normalized = normalizeFolderPath(folderPathInput.value);
  if (folderPathInput.value !== normalized) {
    folderPathInput.value = normalized;
  }
});
tagInput.addEventListener('input', syncTagPreview);
tagInput.addEventListener('input', clearFieldErrors);
designTemplateInput.addEventListener('change', clearFieldErrors);
shopSelectInput.addEventListener('change', clearFieldErrors);
exportTemplateInput.addEventListener('change', clearFieldErrors);
step1Enabled.addEventListener('change', () => renderSteps());
step2Enabled.addEventListener('change', () => renderSteps());
step3Enabled.addEventListener('change', () => renderSteps());

syncTagPreview();
ensureDefaultTag();
renderQueue();
renderTaskHistory();
renderMultiShopList();
fetchStatus().catch(() => {});
Promise.allSettled([loadDesignTemplates(), loadShops()]).catch(() => {});
setInterval(() => {
  fetchStatus().catch(() => {});
}, 1500);
