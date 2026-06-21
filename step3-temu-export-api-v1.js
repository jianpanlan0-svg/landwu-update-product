const fs = require('fs');
const path = require('path');

const RUNTIME_DIR = process.env.LANDWU_RUNTIME_DIR || (process.pkg ? path.dirname(process.execPath) : __dirname);
const AUTH_FILE = path.join(RUNTIME_DIR, 'auth-state-v1.json');

function parseArgs(argv) {
  const args = {
    tag: '',
    shopName: '',
    templateName: '',
    skc: '',
    reportFile: '',
  };
  for (const arg of argv) {
    if (arg.startsWith('--tag=')) args.tag = arg.slice('--tag='.length);
    else if (arg.startsWith('--shop-name=')) args.shopName = arg.slice('--shop-name='.length);
    else if (arg.startsWith('--template-name=')) args.templateName = arg.slice('--template-name='.length);
    else if (arg.startsWith('--skc=')) args.skc = arg.slice('--skc='.length);
    else if (arg.startsWith('--report-file=')) args.reportFile = arg.slice('--report-file='.length);
  }
  return args;
}

function log(message, extra) {
  if (typeof extra === 'undefined') {
    console.log(`[STEP3-API] ${message}`);
    return;
  }
  console.log(`[STEP3-API] ${message}`, extra);
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

function buildHeaders(auth, referer = 'https://user.landwu.com/#/Producet/temu', includeCookie = true) {
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
  if (includeCookie && auth.session) {
    headers.cookie = auth.session;
  }
  return headers;
}

async function requestJson(url, body, auth, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'POST',
    headers: buildHeaders(auth, options.referer, options.includeCookie !== false),
    body: JSON.stringify({
      ...body,
      lange: 'zh',
      api_token: auth.token,
    }),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${url} 返回非 JSON: ${text.slice(0, 300)}`);
  }
  if (!response.ok || json.code !== 1) {
    throw new Error(`${url} 请求失败: ${JSON.stringify(json)}`);
  }
  return json;
}

function parseJsonField(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function buildSkcByShop(shopName) {
  const match = String(shopName || '').match(/^(\d*)TEMU(.+)$/i);
  if (!match) {
    const cleaned = String(shopName || '')
      .replace(/TEMU/gi, '')
      .replace(/[\u4e00-\u9fa5]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 4);
    if (!cleaned) {
      throw new Error(`无法根据店铺名生成SKC，请手动填写: ${shopName}`);
    }
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

function normalizeTemplateName(value) {
  return String(value || '')
    .replace(/\(单品刊登\)/g, '')
    .replace(/\s+/g, '')
    .trim();
}

async function getProductListByTag(tag, auth) {
  const allItems = [];
  const limit = 200;
  let page = 1;

  while (true) {
    const json = await requestJson('https://usersource.landwu.com/api/product/productList', {
      plat_id: 18,
      page,
      limit,
      user_id: '',
      shop_id: '',
      is_export: '',
      design_product_id: '',
      createtime: '',
      title: '',
      id: '',
      label: tag,
      has_order: '',
      photo_id: '',
    }, auth, { referer: 'https://user.landwu.com/#/Producet/temu', includeCookie: false });
    const items = json.data?.data || [];
    allItems.push(...items);
    if (items.length < limit) break;
    page += 1;
  }

  return allItems;
}

async function getShopList(auth) {
  const json = await requestJson('https://user.landwu.com/api/shop/index', {
    limit: 1000,
    plat_id: 18,
  }, auth);
  return json.data?.data || [];
}

async function getTemplateList(shopId, auth) {
  const json = await requestJson('https://user.landwu.com/api/teMu/getTemplateList', {
    shop_id: shopId,
    limit: 1000,
  }, auth);
  return json.data?.data || [];
}

async function getTemplateRecord(templateId, auth) {
  const json = await requestJson('https://user.landwu.com/api/teMu/tplRecord/detail', {
    template_id: templateId,
  }, auth);
  return json.data || {};
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildPackagingList(templateItem, skc) {
  const rawList = parseJsonField(templateItem.packaging_list, []);
  return rawList.map((item) => ({
    ...item,
    skc,
  }));
}

function buildPayload({ products, shop, templateItem, templateRecord, skc }) {
  const firstProduct = products[0];
  const sizeSelect = parseJsonField(templateRecord.size_select, []);
  const colorSelect = parseJsonField(templateRecord.color_select, []);
  const btPrice = parseJsonField(templateRecord.bt_price, []);
  const sizeJson = parseJsonField(templateRecord.size_json, { size_table: [] });
  const nonModelDatasource = parseJsonField(templateRecord.non_model_datasource, []);
  const packagingList = buildPackagingList(templateItem, skc);

  return {
    shop_id: shop.id,
    template_id: templateItem.id,
    sell_type: Number(templateItem.sell_type || templateRecord.sell_type || 1),
    group_size_tab_id: templateRecord.group_size_tab_id || '',
    businessId: templateRecord.businessId || '',
    sizecharts: templateRecord.sizecharts || '',
    product_id: products.map((item) => item.id).join(','),
    bt_price: btPrice,
    design_product_id: firstProduct.design_product_id,
    is_group_template: Number(firstProduct.is_group_template ?? -1),
    inputMaxSpecNum: Number(templateRecord.inputMaxSpecNum || 2),
    size_json: sizeJson,
    model_data: templateRecord.model_data || '',
    model_data_size: templateRecord.model_data_size || '',
    size_select: sizeSelect,
    color_select: colorSelect,
    packaging_list: packagingList,
    save_export: 1,
    catType: String(templateItem.catType || templateRecord.catType || '0'),
    non_model_datasource: nonModelDatasource,
  };
}

async function saveTemplateRecord(payload, auth) {
  return requestJson('https://user.landwu.com/api/teMu/tplRecord/add', payload, auth);
}

async function exportTemu(payload, auth) {
  return requestJson('https://usersource.landwu.com/api/teMu/singleExport', payload, auth, {
    referer: 'https://user.landwu.com/#/Producet/temu',
    includeCookie: true,
  });
}

function writeProgressReport(args, templateItem, skc, successes, failures) {
  saveReport(args.reportFile, {
    step: 'step3',
    tag: args.tag,
    shopName: args.shopName,
    templateName: args.templateName,
    templateId: templateItem?.id || '',
    skc,
    successes,
    failures,
    summary: {
      successCount: successes.length,
      failureCount: failures.length,
    },
    updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.tag) throw new Error('缺少 --tag');
  if (!args.shopName) throw new Error('缺少 --shop-name');
  if (!args.templateName) throw new Error('缺少 --template-name');

  const auth = loadAuth();
  const successes = [];
  const failures = [];
  const skc = args.skc || buildSkcByShop(args.shopName);

  log(`开始第三步，标签: ${args.tag}`);
  log(`店铺: ${args.shopName}`);
  log(`模板: ${args.templateName}`);
  log(`SKC: ${skc}`);

  const allProducts = await getProductListByTag(args.tag, auth);
  if (!allProducts.length) {
    throw new Error(`未找到标签为 ${args.tag} 的成品`);
  }
  log(`已找到成品 ${allProducts.length} 个`);

  const products = [...allProducts];

  const shops = await getShopList(auth);
  const shop = shops.find((item) => item.name === args.shopName);
  if (!shop) {
    throw new Error(`未找到店铺: ${args.shopName}`);
  }
  log('已找到店铺', { shopId: shop.id, shopName: shop.name });

  const templateList = await getTemplateList(shop.id, auth);
  const targetTemplateName = normalizeTemplateName(args.templateName);
  const templateItem = templateList.find((item) => normalizeTemplateName(item.template_name) === targetTemplateName);
  if (!templateItem) {
    throw new Error(`未找到模板: ${args.templateName}`);
  }
  log('已找到模板', { templateId: templateItem.id, templateName: templateItem.template_name });

  const templateRecord = await getTemplateRecord(templateItem.id, auth);
  const payload = buildPayload({
    products,
    shop,
    templateItem: clone(templateItem),
    templateRecord: clone(templateRecord),
    skc,
  });

  try {
    await saveTemplateRecord(payload, auth);
    log('模板记录已保存');

    const exportResult = await exportTemu(payload, auth);
    for (const product of products) {
      successes.push({
        productId: product.id,
        title: product.title || '',
        designProductId: product.design_product_id || '',
      });
    }
    writeProgressReport(args, templateItem, skc, successes, failures);
    log('第三步完成');

    console.log(`__RESULT__${JSON.stringify({
      ok: true,
      tag: args.tag,
      shopName: args.shopName,
      templateId: templateItem.id,
      templateName: templateItem.template_name,
      skc,
      count: successes.length,
      successCount: successes.length,
      failureCount: failures.length,
      message: failures.length
        ? `已汇出 ${successes.length} 个产品到 ${args.shopName}，失败 ${failures.length} 个`
        : `已汇出 ${successes.length} 个产品到 ${args.shopName}`,
      productIds: successes.map((item) => item.productId),
      reportFile: args.reportFile,
      failures,
    })}`);
  } catch (error) {
    for (const product of products) {
      failures.push({
        productId: product.id,
        title: product.title || '',
        error: error.message || String(error),
      });
    }
    writeProgressReport(args, templateItem, skc, successes, failures);
    throw error;
  }
}

module.exports = { main };

if (require.main === module) {
  main().catch((error) => {
    console.error('[STEP3-API] 失败:', error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}
