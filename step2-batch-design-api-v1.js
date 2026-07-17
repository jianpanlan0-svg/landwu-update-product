const fs = require('fs');
const path = require('path');

const RUNTIME_DIR = process.env.LANDWU_RUNTIME_DIR || (process.pkg ? path.dirname(process.execPath) : __dirname);
const AUTH_FILE = path.join(RUNTIME_DIR, 'auth-state-v1.json');
const DESIGN_AREA_WIDTH = 100;
const DESIGN_AREA_HEIGHT = 56.06468400000001;
const PRINT_DPI = 300;
const MM_PER_INCH = 25.4;
const REQUEST_RETRY_COUNT = 1;
const REQUEST_RETRY_DELAY_MS = 1200;

function parseArgs(argv) {
  const args = {
    tag: '',
    templateName: '',
    autoAssociation: 1,
    reportFile: '',
    maximizeDesign: false,
  };
  for (const arg of argv) {
    if (arg.startsWith('--tag=')) args.tag = arg.slice('--tag='.length);
    else if (arg.startsWith('--template-name=')) args.templateName = arg.slice('--template-name='.length);
    else if (arg.startsWith('--auto-association=')) args.autoAssociation = Number(arg.slice('--auto-association='.length)) || 1;
    else if (arg.startsWith('--report-file=')) args.reportFile = arg.slice('--report-file='.length);
    else if (arg === '--maximize-design') args.maximizeDesign = true;
  }
  return args;
}

function log(message, extra) {
  if (typeof extra === 'undefined') {
    console.log(`[STEP2-API] ${message}`);
    return;
  }
  console.log(`[STEP2-API] ${message}`, extra);
}

function loadAuth() {
  if (!fs.existsSync(AUTH_FILE)) {
    throw new Error('未找到 auth-state-v1.json，请先同步登录态');
  }
  const auth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  if (!auth.token || !auth.factoryId) {
    throw new Error('登录态无效，请先重新同步');
  }
  if (!auth.masterFactoryId) {
    auth.masterFactoryId = `6${auth.factoryId}`;
  }
  return auth;
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeUrl(url) {
  return String(url || '').replace(/([?&]api_token=)[^&]+/gi, '$1***');
}

function compactPreview(text, maxLength = 180) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function buildHeaders(auth, includeCookie = true) {
  const headers = {
    'content-type': 'application/json;charset=UTF-8',
    authorization: `Bearer ${auth.token}`,
    'x-csrf-token': `Bearer ${auth.token}`,
    'm-master-factory-id': `factory:${auth.masterFactoryId}`,
    lange: 'zh',
    origin: 'https://user.landwu.com',
    referer: 'https://user.landwu.com/#/batchDesign',
    accept: '*/*',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
  };
  if (includeCookie && auth.session) {
    headers.cookie = auth.session;
  }
  return headers;
}

async function parseJsonResponse(response, url) {
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${safeUrl(url)} 返回非 JSON，HTTP ${response.status}: ${compactPreview(text)}`);
  }
  if (!response.ok || json.code !== 1) {
    throw new Error(`${safeUrl(url)} 请求失败，HTTP ${response.status}: ${compactPreview(JSON.stringify(json))}`);
  }
  return json;
}

async function requestWithRetry(url, fetchOptions, label) {
  let lastError = null;
  for (let attempt = 1; attempt <= REQUEST_RETRY_COUNT + 1; attempt += 1) {
    try {
      const response = await fetch(url, fetchOptions);
      return await parseJsonResponse(response, url);
    } catch (error) {
      lastError = error;
      if (attempt > REQUEST_RETRY_COUNT) break;
      log(`${label || '接口请求'}失败，${REQUEST_RETRY_DELAY_MS}ms 后自动重试 1 次`, {
        url: safeUrl(url),
        error: error.message || String(error),
      });
      await sleep(REQUEST_RETRY_DELAY_MS);
    }
  }
  throw lastError;
}

async function requestJson(url, body, auth, includeCookie = true) {
  return requestWithRetry(url, {
    method: 'POST',
    headers: buildHeaders(auth, includeCookie),
    body: JSON.stringify({
      ...body,
      lange: 'zh',
      api_token: auth.token,
    }),
  }, '第二步接口');
}

async function requestGetJson(url, auth) {
  return requestWithRetry(url, {
    method: 'GET',
    headers: buildHeaders(auth, true),
  }, '第二步接口');
}

function toAbsoluteUrl(value) {
  if (!value) return '';
  if (value.startsWith('//')) return value;
  if (value.startsWith('http')) return value.replace(/^https?:/, '');
  return value;
}

function normalizeTemplateName(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .trim();
}

function imagePixelsToMillimeters(widthPx, heightPx) {
  return {
    width: Number(widthPx) / PRINT_DPI * MM_PER_INCH,
    height: Number(heightPx) / PRINT_DPI * MM_PER_INCH,
  };
}

function fitImage(widthPx, heightPx, maximizeDesign = false) {
  const imageRatio = Number(widthPx) / Number(heightPx);
  const areaRatio = DESIGN_AREA_WIDTH / DESIGN_AREA_HEIGHT;
  let width = DESIGN_AREA_WIDTH;
  let height = DESIGN_AREA_HEIGHT;
  if (imageRatio >= areaRatio) {
    width = DESIGN_AREA_WIDTH;
    height = width / imageRatio;
  } else {
    height = DESIGN_AREA_HEIGHT;
    width = height * imageRatio;
  }
  const offsetX = (DESIGN_AREA_WIDTH - width) / 2;
  const offsetY = (DESIGN_AREA_HEIGHT - height) / 2;
  return { width, height, offsetX, offsetY };
}

function buildMaximizedImageLayout(widthPx, heightPx, printAreaWidth, printAreaHeight) {
  const physical = imagePixelsToMillimeters(widthPx, heightPx);
  const scale = Math.min(
    (Number(printAreaWidth) * 0.98) / physical.width,
    (Number(printAreaHeight) * 0.98) / physical.height,
  );
  const renderedWidth = physical.width * scale;
  const renderedHeight = physical.height * scale;
  const offsetX = (Number(printAreaWidth) - renderedWidth) / 2;
  const offsetY = (Number(printAreaHeight) - renderedHeight) / 2;
  return {
    width: physical.width,
    height: physical.height,
    offsetX,
    offsetY,
    scale,
  };
}

function buildProductConfig(templateId, image, designImageUrl, options = {}) {
  const {
    maximizeDesign = false,
    defaultColorId = 1,
    defaultViewId = 1,
    printAreaWidth = DESIGN_AREA_WIDTH,
    printAreaHeight = DESIGN_AREA_HEIGHT,
  } = options;
  const fit = maximizeDesign
    ? buildMaximizedImageLayout(
        Number(image.imagewidth),
        Number(image.imageheight),
        printAreaWidth,
        printAreaHeight,
      )
    : fitImage(Number(image.imagewidth), Number(image.imageheight), maximizeDesign);
  return {
    color_id: defaultColorId,
    color_img: '',
    view_id: defaultViewId,
    product_type_id: templateId,
    effect_index: defaultViewId,
    is_3d: 2,
    cfgs: [
      {
        image: {
          id: image.id,
          gallery_id: image.id,
          transform: maximizeDesign
            ? `matrix(${fit.scale},0,0,${fit.scale},0,0)`
            : 'matrix(1,0,0,1,0,0)',
          gTransform: `matrix(1,0,0,1,${fit.offsetX},${fit.offsetY})`,
          height: fit.height,
          width: fit.width,
          opacity: 1,
          tileType: '',
          hspacing: '0',
          vspacing: '0',
          isBg: 0,
          offset_x: fit.offsetX,
          offset_y: fit.offsetY,
          rotate: 0,
          name: image.title,
          imageheight: String(image.imageheight),
          imagewidth: String(image.imagewidth),
          old_width: fit.width,
          old_height: fit.height,
          rendercode: '',
          render_id: '',
          xFlip: false,
          yFlip: false,
          realSize: JSON.stringify({ width: fit.width, height: fit.height }),
          bboxHeight: fit.height,
          bboxWidth: fit.width,
          is_fixed: '-1',
          is_replace: '-1',
          is_title: '-1',
          is_cloud_chart: '-1',
          title_alias: '',
          device_name: '',
          device_val: '',
          data_group_name: '',
          designImg: designImageUrl,
          designImg2: designImageUrl,
          designImg1: designImageUrl,
          old_img: toAbsoluteUrl(image.url_origin),
          url_origin: toAbsoluteUrl(image.url_origin),
          xyFlip_base64: '',
          vh: 100,
          vw: 100,
          size: {
            width: fit.width,
            height: fit.height,
          },
        },
        img_size: {
          height: fit.height,
          width: fit.width,
        },
        dpi: image.dpi || '72.01',
        print_area_id: defaultViewId,
        type: 'design',
        index_cur: '',
        point_svg: '',
        view_id: defaultViewId,
      },
    ],
    color_mixing: {},
  };
}

async function searchImagesByTag(tag, auth) {
  const allItems = [];
  const limit = 200;
  let page = 1;

  while (true) {
    const json = await requestJson('https://user.landwu.com/api/photo/productPhoto', {
      page,
      limit,
      category_name: '',
      category_id: '',
      title: '',
      tag,
    }, auth);
    const items = json.data?.data || [];
    allItems.push(...items);
    if (items.length < limit) break;
    page += 1;
  }

  return allItems;
}

async function searchTemplateByName(templateName, auth) {
  const json = await requestJson('https://user.landwu.com/api/design/DzDesignProduct/getDesignProduct', {
    page: 1,
    limit: 200,
    defaultPageSize: 200,
    name: templateName,
    name_zh: templateName,
    special_subject_id: '',
    category_id: '',
    is_group_template: '-1',
  }, auth);
  const templates = json.data?.data || [];
  const targetName = normalizeTemplateName(templateName);
  const exactMatch = templates.find((item) => {
    const currentName = normalizeTemplateName(item.name_zh || item.name);
    return currentName === targetName;
  });
  return exactMatch || templates[0] || null;
}

async function getTemplateInfo(code, auth) {
  const url = `https://user.landwu.com/api/design/DzDesignProduct/getDesignProductInfo?code=${encodeURIComponent(code)}&api_token=${encodeURIComponent(auth.token)}&lange=zh`;
  const json = await requestGetJson(url, auth);
  return json.data || {};
}

async function getNormalSizeColor(templateId, auth) {
  const json = await requestJson('https://user.landwu.com/api/design/getNormalSizeColor', {
    design_product_template_id: templateId,
  }, auth);
  return json.data || {};
}

async function doDesignProductPic(templateId, image, auth, cIndex, designOptions = {}) {
  const designImageUrl = toAbsoluteUrl(image.url_large || image.url || image.url_origin);
  const productConfig = buildProductConfig(templateId, image, designImageUrl, designOptions);
  const json = await requestJson('https://user.landwu.com/api/design/ImageApi/doDesignProductPic', {
    productConfig: JSON.stringify(productConfig),
    view_id: designOptions.defaultViewId || 1,
    new_design_save: '1',
    set_main_image: '',
    fabric_id: '',
    cIndex,
  }, auth);
  return json;
}

async function saveTitleAndLabel(productId, auth, autoAssociation) {
  const json = await requestJson('https://user.landwu.com/api/product/saveTitleAndLabel', {
    ids: productId,
    auto_association: autoAssociation,
  }, auth);
  return json;
}

function pickProductId(responseJson) {
  const data = responseJson.data || responseJson.result || {};
  return data.id || data.product_id || data.design_product_id || data.productId || null;
}

function writeProgressReport(args, template, successes, failures) {
  saveReport(args.reportFile, {
    step: 'step2',
    tag: args.tag,
    templateName: args.templateName,
    templateId: template?.id || '',
    maximizeDesign: !!args.maximizeDesign,
    successes,
    failures,
    summary: {
      successCount: successes.length,
      failureCount: failures.length,
    },
    updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  });
}

function writeFailureReport(args, error, successes = [], failures = [], template = null, totalCount = 0) {
  const message = error && error.message ? error.message : String(error || '第二步失败');
  const finalFailures = failures.length ? failures : [{ error: message }];
  saveReport(args.reportFile, {
    step: 'step2',
    ok: false,
    failed: true,
    tag: args.tag || '',
    templateName: args.templateName || '',
    templateId: template?.id || '',
    maximizeDesign: !!args.maximizeDesign,
    successes,
    failures: finalFailures,
    errorMessage: message,
    summary: {
      successCount: successes.length,
      failureCount: finalFailures.length,
      totalCount: Math.max(Number(totalCount || 0), successes.length + finalFailures.length),
    },
    updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.tag) throw new Error('缺少 --tag');
  if (!args.templateName) throw new Error('缺少 --template-name');

  const successes = [];
  const failures = [];
  let images = [];
  let template = null;

  try {
    const auth = loadAuth();
    log(`开始第二步，标签: ${args.tag}`);
    log(`公版名称: ${args.templateName}`);
    log(`最大化设计: ${args.maximizeDesign ? '是' : '否'}`);

    images = await searchImagesByTag(args.tag, auth);
    if (!images.length) {
      throw new Error(`未找到标签为 ${args.tag} 的主题图`);
    }
    log(`主题图数量: ${images.length}`);

    template = await searchTemplateByName(args.templateName, auth);
    if (!template) {
      throw new Error(`未找到公版: ${args.templateName}`);
    }
    log('已找到公版', { id: template.id, code: template.code, name: template.name_zh || template.name });

    const templateInfo = await getTemplateInfo(template.code, auth);
    await getNormalSizeColor(template.id, auth);
    const defaultColorId = Number(templateInfo.defaultValues?.color || templateInfo.colors?.[0]?.id || 1);
    const defaultViewId = Number(templateInfo.defaultValues?.view || 1);
    const printArea = templateInfo.views?.find((item) => Number(item.id) === defaultViewId)?.printArea || {};
    const printAreaWidth = Number(printArea.actual_width || printArea.width || DESIGN_AREA_WIDTH);
    const printAreaHeight = Number(printArea.height || DESIGN_AREA_HEIGHT);
    log('公版默认展示配置', {
      defaultColorId,
      defaultViewId,
      printAreaWidth,
      printAreaHeight,
    });

    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      log(`合成第 ${index + 1}/${images.length} 张`, { imageId: image.id, title: image.title });

      try {
        const designResult = await doDesignProductPic(template.id, image, auth, index, {
          maximizeDesign: args.maximizeDesign,
          defaultColorId,
          defaultViewId,
          printAreaWidth,
          printAreaHeight,
        });
        const productId = pickProductId(designResult);
        if (!productId) {
          throw new Error(`第 ${index + 1} 张未拿到 productId: ${JSON.stringify(designResult)}`);
        }
        await saveTitleAndLabel(productId, auth, args.autoAssociation);
        successes.push({
          imageId: image.id,
          imageTitle: image.title,
          productId,
        });
      } catch (error) {
        failures.push({
          imageId: image.id,
          imageTitle: image.title,
          error: error.message || String(error),
        });
        log(`合成失败: ${image.title}`, { error: error.message || String(error) });
      }

      writeProgressReport(args, template, successes, failures);
    }

    writeProgressReport(args, template, successes, failures);
  } catch (error) {
    writeFailureReport(args, error, successes, failures, template, images.length);
    throw error;
  }

  writeProgressReport(args, template, successes, failures);

  const result = {
    ok: true,
    tag: args.tag,
    templateId: template.id,
    count: successes.length,
    successCount: successes.length,
    failureCount: failures.length,
    results: successes,
    failures,
    reportFile: args.reportFile,
    maximizeDesign: args.maximizeDesign,
    message: failures.length
      ? `第二步完成，成功 ${successes.length}，失败 ${failures.length}`
      : `第二步完成，成功 ${successes.length}`,
  };

  log(result.message);
  console.log(`__RESULT__${JSON.stringify(result)}`);
}

module.exports = { main };

if (require.main === module) {
  main().catch((error) => {
    console.error('[STEP2-API] 失败:', error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}
