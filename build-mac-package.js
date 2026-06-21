const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version || '2.1.0';
const DESKTOP_DIR = path.join(process.env.USERPROFILE || process.env.HOME || ROOT, 'Desktop');
const PACKAGE_DIR = path.join(DESKTOP_DIR, `领物TEMU上传器_Mac构建包_v${VERSION}`);
const BRIDGE_SCRIPT = path.join(ROOT, 'userscripts', 'landwu_桥接同步登录态_双兼容_v7.user.js');

const FILES = [
  'package.json',
  'package-lock.json',
  'electron-main.js',
  'launcher-entry.js',
  'uploader-server-v1.js',
  'step1-gallery-upload-api-v1.js',
  'step2-batch-design-api-v1.js',
  'step3-temu-export-api-v1.js',
  '已知问题.md',
];

const DIRS = [
  'ui',
];

function resetDir(targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
}

function copyFile(relativePath) {
  const source = path.join(ROOT, relativePath);
  if (!fs.existsSync(source)) return;
  const target = path.join(PACKAGE_DIR, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyDir(relativePath) {
  const source = path.join(ROOT, relativePath);
  if (!fs.existsSync(source)) return;
  const target = path.join(PACKAGE_DIR, relativePath);
  fs.cpSync(source, target, {
    recursive: true,
    filter: (item) => {
      const name = path.basename(item);
      return !['node_modules', 'dist', 'reports'].includes(name);
    },
  });
}

function writeMacCommand() {
  const content = `#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "领物TEMU上传器 Mac 打包开始"
echo "当前目录: $(pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "未检测到 Node.js，请先安装: https://nodejs.org/"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "未检测到 npm，请确认 Node.js 已正确安装"
  exit 1
fi

echo "安装依赖..."
npm install

echo "生成 Mac App..."
npm run build:mac

APP_PATH="$(find ./release-mac -maxdepth 3 -name '领物TEMU上传器.app' -type d | head -n 1)"
if [ -z "$APP_PATH" ]; then
  echo "未找到生成的 .app，请检查上方报错"
  exit 1
fi

echo ""
echo "打包完成: $APP_PATH"
echo "如系统提示无法打开，请在 Finder 里右键点击 App，再选择打开。"
open "$(dirname "$APP_PATH")"
`;
  fs.writeFileSync(path.join(PACKAGE_DIR, '一键打包Mac.command'), content, 'utf8');
}

function writeReadme() {
  const content = [
    `领物TEMU上传器 Mac 构建包 v${VERSION}`,
    '',
    '一、用途',
    '1. 这个文件夹不是最终 App，是 Mac 构建包。',
    '2. 请把整个文件夹复制到 M 系列 Mac 上，再在 Mac 上生成 .app。',
    '',
    '二、Mac 上打包',
    '1. 先安装 Node.js：https://nodejs.org/',
    '2. 打开“终端”，进入本文件夹。',
    '3. 执行：bash 一键打包Mac.command',
    '4. 完成后会生成 release-mac 目录，里面有 领物TEMU上传器.app。',
    '',
    '三、Mac 上使用',
    '1. 双击 领物TEMU上传器.app。',
    '2. 安装 领物登陆态同步脚本猫脚本.user.js。',
    '3. 用 Chrome 打开并刷新领物页面，等待上传器显示已同步。',
    '4. 正常选择图片文件夹并执行任务。',
    '',
    '四、注意',
    '1. 未签名 App 首次打开可能被系统拦截，请右键 App 选择“打开”。',
    '2. auth-state-v1.json 和 reports 会保存到 Mac 当前用户的 App 数据目录，不写入 .app 内部。',
    '3. 这个 App 只按 Apple 芯片 arm64 打包。',
  ].join('\n');
  fs.writeFileSync(path.join(PACKAGE_DIR, 'Mac使用说明.txt'), content, 'utf8');
}

function main() {
  resetDir(PACKAGE_DIR);
  FILES.forEach(copyFile);
  DIRS.forEach(copyDir);

  if (fs.existsSync(BRIDGE_SCRIPT)) {
    fs.copyFileSync(BRIDGE_SCRIPT, path.join(PACKAGE_DIR, '领物登陆态同步脚本猫脚本.user.js'));
  }

  writeMacCommand();
  writeReadme();

  console.log('Mac 构建包已生成：');
  console.log(PACKAGE_DIR);
}

main();
