const fs = require('fs');
const path = require('path');
const ObsClient = require('esdk-obs-nodejs');

const RUNTIME_DIR = process.env.LANDWU_RUNTIME_DIR || (process.pkg ? path.dirname(process.execPath) : __dirname);
const OBS_CONFIG_FILE = path.join(RUNTIME_DIR, 'obs-config.json');
const MAX_UPLOAD_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1500;

function loadObsSecretAccessKey() {
  const envValue = String(process.env.LANDWU_OBS_SECRET_ACCESS_KEY || '').trim();
  if (envValue) return envValue;

  if (fs.existsSync(OBS_CONFIG_FILE)) {
    const config = JSON.parse(fs.readFileSync(OBS_CONFIG_FILE, 'utf8'));
    const fileValue = String(config.secret_access_key || config.secretAccessKey || '').trim();
    if (fileValue) return fileValue;
  }

  throw new Error(`缺少 OBS secret_access_key，请在 ${OBS_CONFIG_FILE} 配置或设置 LANDWU_OBS_SECRET_ACCESS_KEY`);
}

function parseArgs(argv) {
  const args = {
    dir: '',
    tag: '',
    token: '',
    session: '',
    factoryId: '',
    masterFactoryId: '',
    dryRun: false,
    reportFile: '',
    shopName: '',
    shopNames: '',
    designTemplateName: '',
    exportTemplateName: '',
  };

  for (const arg of argv) {
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg.startsWith('--dir=')) args.dir = arg.slice('--dir='.length);
    else if (arg.startsWith('--tag=')) args.tag = arg.slice('--tag='.length);
    else if (arg.startsWith('--token=')) args.token = arg.slice('--token='.length);
    else if (arg.startsWith('--session=')) args.session = arg.slice('--session='.length);
    else if (arg.startsWith('--factory-id=')) args.factoryId = arg.slice('--factory-id='.length);
    else if (arg.startsWith('--master-factory-id=')) args.masterFactoryId = arg.slice('--master-factory-id='.length);
    else if (arg.startsWith('--report-file=')) args.reportFile = arg.slice('--report-file='.length);
    else if (arg.startsWith('--shop-name=')) args.shopName = arg.slice('--shop-name='.length);
    else if (arg.startsWith('--shop-names=')) args.shopNames = arg.slice('--shop-names='.length);
    else if (arg.startsWith('--design-template-name=')) args.designTemplateName = arg.slice('--design-template-name='.length);
    else if (arg.startsWith('--export-template-name=')) args.exportTemplateName = arg.slice('--export-template-name='.length);
  }

  if (!args.tag) {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    args.tag = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  }
  return args;
}

function log(message, extra) {
  if (typeof extra === 'undefined') {
    console.log(`[STEP1-API] ${message}`);
    return;
  }
  console.log(`[STEP1-API] ${message}`, extra);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureAuth(args) {
  if (!args.token) throw new Error('缺少 token，请先同步网页登录态');
  if (!args.factoryId) throw new Error('缺少 factoryId，请先同步网页登录态');
  if (!args.masterFactoryId) args.masterFactoryId = `6${args.factoryId}`;
}

function loadReport(reportFile) {
  if (!reportFile || !fs.existsSync(reportFile)) {
    return { successes: [], failures: [], summary: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  } catch {
    return { successes: [], failures: [], summary: {} };
  }
}

function saveReport(reportFile, data) {
  if (!reportFile) return;
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, JSON.stringify(data, null, 2), 'utf8');
}

function sanitizePathPart(value, fallback) {
  const text = String(value || '').trim() || fallback;
  return text
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .slice(0, 60) || fallback;
}

function getFailureContext(args) {
  const shopName = args.shopName || '未设置店铺';
  const designTemplateName = args.designTemplateName || '未设置公版';
  const exportTemplateName = args.exportTemplateName || '';
  const shopNames = String(args.shopNames || shopName)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    tag: args.tag,
    shopName,
    shopNames,
    designTemplateName,
    exportTemplateName,
  };
}

function getFailureDir(args) {
  const context = getFailureContext(args);
  const folderName = [
    '上传失败',
    sanitizePathPart(context.tag, '未设置标签'),
    sanitizePathPart(context.shopName, '未设置店铺'),
    sanitizePathPart(context.designTemplateName, '未设置公版'),
  ].join('_').slice(0, 180);
  return path.join(args.dir, folderName);
}

function getUniqueCopyPath(targetDir, sourceFilePath) {
  const ext = path.extname(sourceFilePath);
  const baseName = path.basename(sourceFilePath, ext);
  let targetPath = path.join(targetDir, path.basename(sourceFilePath));
  let index = 1;
  while (fs.existsSync(targetPath)) {
    targetPath = path.join(targetDir, `${baseName}_${index}${ext}`);
    index += 1;
  }
  return targetPath;
}

function copyFailedFile(filePath, args) {
  const failureDir = getFailureDir(args);
  fs.mkdirSync(failureDir, { recursive: true });
  const copiedTo = getUniqueCopyPath(failureDir, filePath);
  fs.copyFileSync(filePath, copiedTo);
  return { failureDir, copiedTo };
}

function writeFailureReadme(args, failures) {
  if (!failures.length) return;
  const failureDir = getFailureDir(args);
  fs.mkdirSync(failureDir, { recursive: true });
  const context = getFailureContext(args);
  const lines = [
    '上传失败说明',
    '',
    `任务标签：${context.tag || '-'}`,
    `计划汇出店铺：${context.shopName || '-'}`,
    `计划汇出店铺列表：${context.shopNames.length ? context.shopNames.join('，') : '-'}`,
    `使用公版：${context.designTemplateName || '-'}`,
    `汇出模板：${context.exportTemplateName || '-'}`,
    `失败数量：${failures.length}`,
    `生成时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    '',
    '失败文件：',
    ...failures.map((item, index) => [
      `${index + 1}. ${item.title || path.basename(item.filePath || '')}`,
      `   原路径：${item.filePath || '-'}`,
      `   复制到：${item.copiedTo || '-'}`,
      `   失败原因：${item.error || '-'}`,
      item.copyError ? `   复制失败：${item.copyError}` : '',
    ].filter(Boolean).join('\n')),
    '',
  ];
  fs.writeFileSync(path.join(failureDir, '失败说明.txt'), lines.join('\n'), 'utf8');
}

function buildStep1Report(args, successes, failures) {
  const totalCount = successes.length + failures.length;
  return {
    step: 'step1',
    tag: args.tag,
    dir: args.dir,
    failureDir: failures.length ? getFailureDir(args) : '',
    context: getFailureContext(args),
    successes,
    failures,
    summary: { successCount: successes.length, failureCount: failures.length, totalCount },
    updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  };
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

function getImageFiles(folderPath) {
  if (!folderPath) throw new Error('缺少图片文件夹路径');
  if (!fs.existsSync(folderPath)) throw new Error(`文件夹不存在: ${folderPath}`);
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(folderPath, entry.name))
    .filter((filePath) => /\.(png|jpe?g|svg)$/i.test(filePath));
  if (!files.length) throw new Error(`文件夹里没有图片: ${folderPath}`);
  return files;
}

function buildHeaders(args, includeCookie = true) {
  const headers = {
    'content-type': 'application/json;charset=UTF-8',
    authorization: `Bearer ${args.token}`,
    'x-csrf-token': `Bearer ${args.token}`,
    'm-master-factory-id': `factory:${args.masterFactoryId}`,
    lange: 'zh',
    origin: 'https://user.landwu.com',
    referer: 'https://user.landwu.com/#/gallery',
    accept: '*/*',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
  };
  if (includeCookie && args.session) headers.cookie = args.session;
  return headers;
}

async function requestJson(url, body, args, includeCookie = true) {
  const response = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(args, includeCookie),
    body: JSON.stringify({ ...body, lange: 'zh', api_token: args.token }),
  });
  const json = await response.json();
  if (!response.ok || json.code !== 1) {
    throw new Error(`${url} 请求失败: ${JSON.stringify(json)}`);
  }
  return json;
}

function normalizeApiBase(raw) {
  if (!raw) return 'https://usersource.landwu.com/api/';
  if (raw.startsWith('//')) return `https:${raw.replace(/\/?$/, '/')}`;
  if (raw.startsWith('http')) return raw.replace(/\/?$/, '/');
  return `https://${raw.replace(/\/?$/, '/')}`;
}

function uploadToObs(client, bucket, key, filePath, mimeType) {
  return new Promise((resolve, reject) => {
    client.putObject({
      Bucket: bucket,
      Key: key,
      SourceFile: filePath,
      Headers: { 'Content-Type': mimeType },
    }, (err, result) => {
      if (err) return reject(err);
      const status = result && result.CommonMsg && result.CommonMsg.Status;
      if (status !== 200) return reject(new Error(`OBS 上传失败: ${status || 'unknown'}`));
      resolve(result);
    });
  });
}

async function uploadOneFile(options) {
  const { args, obsClient, obsInfo, apiBase, filePath, index, total, title, ext } = options;
  const retryErrors = [];

  for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt += 1) {
    const fileKey = `${obsInfo.file_name}/${obsInfo.file_time}/${Date.now()}_${index + 1}_a${attempt}${ext}`;
    const obsUrl = `/${fileKey}`;
    const attemptText = attempt > 1 ? `（重试 ${attempt - 1}/${MAX_UPLOAD_ATTEMPTS - 1}）` : '';
    log(`上传第 ${index + 1}/${total} 张${attemptText}`, { title, obsUrl, attempt });

    try {
      if (!args.dryRun) {
        await requestJson('https://user.landwu.com/api/photo/jsLoadBefore', {}, args);
        await uploadToObs(obsClient, obsInfo.bucket, fileKey, filePath, getMimeType(filePath));
        await requestJson(new URL('photo/jsLoad', apiBase).toString(), {
          title,
          label: args.tag,
          category_id: '',
          category_name: '',
          cur_index: index + 1,
          obs_url: obsUrl,
        }, args, false);
      }
      return { title, label: args.tag, obs_url: obsUrl, filePath, attempts: attempt, retryErrors };
    } catch (error) {
      const message = error.message || String(error);
      retryErrors.push(message);
      if (attempt < MAX_UPLOAD_ATTEMPTS) {
        log(`上传失败，准备重试: ${title}`, { attempt, error: message });
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      error.retryErrors = retryErrors;
      error.attempts = attempt;
      throw error;
    }
  }

  throw new Error(`上传失败: ${title}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureAuth(args);
  const files = getImageFiles(args.dir);
  const successes = [];
  const failures = [];
  log(`开始批量上传，标签: ${args.tag}`);
  log(`图片数量: ${files.length}`);

  const uploadInfo = await requestJson('https://user.landwu.com/api/photo/jsUseUpload', { type: 1 }, args);
  await requestJson('https://user.landwu.com/api/photo/jsLoadBefore', {}, args);
  const urlInfo = await requestJson('https://user.landwu.com/api/photo/getUploadUrl', {}, args);

  const obsInfo = uploadInfo.data || {};
  const apiBase = normalizeApiBase(urlInfo.data && urlInfo.data.url);
  const obsClient = new ObsClient({
    access_key_id: obsInfo.access_key_id || '',
    secret_access_key: loadObsSecretAccessKey(),
    server: obsInfo.server || 'https://obs.cn-south-1.myhuaweicloud.com',
    timeout: 1200000,
  });

  for (let index = 0; index < files.length; index += 1) {
    const filePath = files[index];
    const ext = path.extname(filePath).toLowerCase();
    const title = path.basename(filePath, ext);

    try {
      const item = await uploadOneFile({
        args,
        obsClient,
        obsInfo,
        apiBase,
        filePath,
        index,
        total: files.length,
        title,
        ext,
      });
      successes.push(item);
    } catch (error) {
      const failure = {
        filePath,
        title,
        error: error.message || String(error),
        attempts: error.attempts || MAX_UPLOAD_ATTEMPTS,
        retryErrors: error.retryErrors || [error.message || String(error)],
        copiedTo: '',
        copyError: '',
      };
      try {
        const copied = copyFailedFile(filePath, args);
        failure.failureDir = copied.failureDir;
        failure.copiedTo = copied.copiedTo;
      } catch (copyError) {
        failure.copyError = copyError.message || String(copyError);
      }
      failures.push(failure);
      try {
        writeFailureReadme(args, failures);
      } catch (readmeError) {
        failure.readmeError = readmeError.message || String(readmeError);
      }
      log(`上传失败: ${title}`, {
        error: failure.error,
        copiedTo: failure.copiedTo,
        copyError: failure.copyError,
        readmeError: failure.readmeError,
      });
    }

    saveReport(args.reportFile, buildStep1Report(args, successes, failures));
  }

  const result = {
    ok: true,
    tag: args.tag,
    dir: args.dir,
    failureDir: failures.length ? getFailureDir(args) : '',
    context: getFailureContext(args),
    totalCount: successes.length + failures.length,
    count: successes.length,
    successCount: successes.length,
    failureCount: failures.length,
    results: successes,
    failures,
    reportFile: args.reportFile,
    message: failures.length ? `上传完成，成功 ${successes.length}，失败 ${failures.length}` : `上传完成，成功 ${successes.length}`,
  };
  log(result.message);
  console.log(`__RESULT__${JSON.stringify(result)}`);
}

module.exports = { main };

if (require.main === module) {
  main().catch((error) => {
    console.error('[STEP1-API] 失败:', error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}
