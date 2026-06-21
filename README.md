# 领物TEMU上传器

本项目用于领物 TEMU 流程自动化：上传图库、批量设计、成品汇出。

## 启动

```bash
npm install
npm start
```

本地服务默认启动后访问：

```text
http://127.0.0.1:18321
```

## 本地配置

以下文件只保存在本机，不提交到 Git：

- `auth-state-v1.json`：网页登录态，由脚本猫桥接自动同步生成。
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
