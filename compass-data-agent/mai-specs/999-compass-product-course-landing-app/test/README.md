# Feature 999 测试与验证

- [prototype-check.mjs](prototype-check.mjs)：原型浏览器回归脚本；默认定位本 Feature 的 design/prototype/index.html，可通过 PROTOTYPE_URL 指定 HTTP 入口。
- [prototype-verification.md](prototype-verification.md)：已执行检查、证据与边界。

复跑命令见 [原型运行说明](../design/prototype/README.md)。脚本产生的截图和浏览器状态写入系统临时目录，不纳入交付。此处记录现有原型检查，生产系统测试计划尚待后续设计。

- [home-verification.md](home-verification.md)：独立 home 官网的工程与浏览器验证记录。

- [static-demo-check.mjs](static-demo-check.mjs)：六个完整静态演示、真实文件下载、授权同意/拒绝、会话恢复与隔离、桌面/抽屉及身份门禁检查。使用与旧回归脚本相同的 `PLAYWRIGHT_MODULE`、`CHROME_BIN`、`PROTOTYPE_URL` 环境变量。
- [build-demo-downloads.py](build-demo-downloads.py)：从原型唯一示例数据生成离线 PDF / DOCX / PPTX 下载包；重建命令见原型 README。

- [build-login-background.mjs](build-login-background.mjs)：从 home 的 GhostFibers 源码与首屏参数生成登录背景的独立浏览器适配器；保留来源校验与许可证，重建命令见原型 README。
