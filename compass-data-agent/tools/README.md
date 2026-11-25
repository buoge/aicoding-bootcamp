# 离线工程工具

这里保存有独立依赖、测试与生命周期的项目工具。工具按需执行，无常驻服务、HTTP 端口或 `dev` 任务；部署应用继续放在 `apps/`，命令包装继续放在 `scripts/`，已验收数据放在 `data/`。

当前工具：[data-seed](data-seed/README.md)，负责合成零售业务数据准备、校验、导出和候选发布。工具纳入 pnpm / uv workspace，与应用共用格式、类型、测试和构建检查；Python 工具需要同步登记两种 workspace 元数据。
