# 领物TEMU上传器

用于领物 TEMU 流程自动化：上传图库、批量设计、成品汇出。当前版本：`v2.1.6`。

## 功能

- 上传图库：批量读取图片文件夹，统一设置标签，单张失败自动重试 1 次。
- 失败处理：第一步仍失败的图片会复制到原文件夹下的 `上传失败_标签_店铺_公版` 目录。
- 文件夹标记：第一步全成功后，原图片文件夹自动追加 `（已上传图库）`。
- 批量设计：按标签选择主题图，按公版名称精确匹配设计公版，支持“最大化设计”选项。
- TEMU 汇出：按标签筛选成品，支持单店铺或多店铺汇出，按店铺自动生成默认 SKC。
- 队列任务：支持任务排队，运行中新增队列会在当前任务结束后自动续跑。
- 错误展示：三步流程中后续步骤失败时，会保留已完成步骤的真实结果，历史任务不再把后续失败误显示为上传失败。

## 启动

```bash
npm install
npm start
```

本地服务默认地址：

```text
http://127.0.0.1:18321
```

Windows 可直接运行：

```text
启动领物TEMU上传器_v2.0.3.bat
```

## 登录态

推荐使用脚本猫桥接脚本同步领物网页登录态：

```text
userscripts/landwu_桥接同步登录态_双兼容_v7.user.js
```

打开或刷新 `user.landwu.com` 后，桥接脚本会把当前账号同步到本地服务。未同步时，先确认本地服务已启动，再刷新领物页面。

## 本地配置

以下文件只保存在本机，不提交到 Git：

- `auth-state-v1.json`：网页登录态，由桥接脚本同步生成。
- `obs-config.json`：OBS 上传密钥配置，可参考 `obs-config.example.json`。
- `reports/`：任务执行报告。
- `dist/`、打包目录：本地构建产物。

`obs-config.json` 格式：

```json
{
  "secret_access_key": "填写本机使用的 OBS secret_access_key"
}
```

也可以用环境变量：

```bash
LANDWU_OBS_SECRET_ACCESS_KEY=你的密钥
```

## 打包

Windows EXE：

```bash
npm run build:exe
```

Mac 构建包：

```bash
npm run build:mac-package
```

GitHub 自动打包：

- 推送到 `main` 后，会自动生成 Windows EXE 和 Mac Apple 芯片 `.app` 构建产物。
- 在 GitHub 仓库的 `Actions` 页面打开最新工作流，从 `Artifacts` 下载。
- 推送 `v*` 标签时，会自动创建 GitHub Release 并附带压缩包。

正式发布：

```bash
git tag -a v版本号 -m "Release v版本号"
git push origin v版本号
```

发布后必须确认：

- `Actions` 里的 `Build Windows EXE`、`Build Mac App`、`Publish GitHub Release` 都是 `success`。
- `Releases` 页面存在对应版本。
- Release Assets 至少包含 Windows EXE 压缩包和 Mac APP 压缩包。

## 代码入口

- 本地服务：`uploader-server-v1.js`
- 第一步上传图库：`step1-gallery-upload-api-v1.js`
- 第二步批量设计：`step2-batch-design-api-v1.js`
- 第三步 TEMU 汇出：`step3-temu-export-api-v1.js`
- 当前网页入口：`ui/index.html`
- 当前前端脚本：`ui/app-v25.js`
