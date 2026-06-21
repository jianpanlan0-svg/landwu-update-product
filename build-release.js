const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || '2.1.0';
const DIST_DIR = path.join(ROOT, 'dist');
const DIST_EXE = path.join(DIST_DIR, '领物TEMU上传器.exe');
const RELEASE_DIR = path.join(ROOT, `领物TEMU上传器EXE版本V${VERSION}`);
const RELEASE_EXE = path.join(RELEASE_DIR, '领物TEMU上传器.exe');
const BRIDGE_SCRIPT = path.join(ROOT, 'userscripts', 'landwu_桥接同步登录态_双兼容_v7.user.js');
const RELEASE_BRIDGE = path.join(RELEASE_DIR, '领物登陆态同步脚本猫脚本.user.js');
const README_FILE = path.join(RELEASE_DIR, '使用说明.txt');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`${command} 执行失败，退出码：${result.status}`);
  }
}

function resetDir(targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
}

function writeReadme() {
  const content = [
  `领物TEMU上传器 EXE 版本 V${VERSION}`,
    '',
    '一、首次使用',
  '1. 把整个文件夹放到本机任意位置，不要只单独拿出 领物TEMU上传器.exe。',
  '2. 双击 领物TEMU上传器.exe 启动本地服务。',
    '3. 启动后手动打开网页面板：http://127.0.0.1:18321',
    '4. 首次使用时，请安装 领物登陆态同步脚本猫脚本.user.js。',
    '5. 安装后刷新领物页面，系统会自动同步登录态。',
    '',
    '二、空机自测',
    '1. 先确认网页面板顶部显示“已同步”。',
    '2. 准备 2 张测试图片，先跑一遍完整三步流程。',
    '3. 任务完成后，程序会自动生成 reports 目录并保存报告。',
    '4. 如需换电脑测试，也按这套流程先跑通再正式使用。',
    '',
    '三、注意事项',
    '1. reports 目录首次运行后会自动创建。',
    '2. 如果网页显示未同步，请先确认桥接脚本已安装，并刷新领物页面。',
    '3. 发给同事时，请整个文件夹一起发，不要只发 exe。',
  ].join('\r\n');
  fs.writeFileSync(README_FILE, content, 'utf8');
}

async function main() {
  resetDir(DIST_DIR);
  const pkgBin = path.join(ROOT, 'node_modules', 'pkg', 'lib-es5', 'bin.js');
  run(process.execPath, [pkgBin, '.', '--targets', 'node18-win-x64', '--output', DIST_EXE]);

  resetDir(RELEASE_DIR);
  fs.copyFileSync(DIST_EXE, RELEASE_EXE);
  fs.copyFileSync(BRIDGE_SCRIPT, RELEASE_BRIDGE);
  writeReadme();

  console.log('打包完成：');
  console.log(`EXE：${RELEASE_EXE}`);
  console.log(`桥接脚本：${RELEASE_BRIDGE}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
