# 项目协作规则

- 始终使用简体中文回复。
- 项目根目录是 `C:\Users\Administrator\Documents\Playground\领物TEMU上传器_v2.0.3`，不要从父目录 `Playground` 提交。
- 功能性修改要同步更新版本号：`package.json`、`package-lock.json`、`uploader-server-v1.js`、`ui/index.html`。
- 修改前先备份关键文件到 `D:\临时备份`。
- 不要提交本地敏感文件：`auth-state-v1.json`、`obs-config.json`、`reports/`、`node_modules/`、`dist/`。
- OBS 密钥只能从 `obs-config.json` 或环境变量 `LANDWU_OBS_SECRET_ACCESS_KEY` 读取，不要写死到源码。
- 当前前端入口是 `ui/index.html`，当前运行脚本是 `ui/app-v24.js`。
- 三步核心脚本分别是 `step1-gallery-upload-api-v1.js`、`step2-batch-design-api-v1.js`、`step3-temu-export-api-v1.js`。
- 修改网页脚本时如需保留历史版本，新文件名带版本号，并同步 `ui/index.html` 引用。
- 提交前至少执行相关 `node --check`，并检查 `git status --ignored --short` 确认敏感文件未暂存。
