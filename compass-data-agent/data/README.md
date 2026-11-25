# 学员数据资产

这里保存随 Compass 仓库交付的、已验收的合成数据快照。当前入口为 [零售业务数据](retail/README.md)：111,055 笔订单、71 张关系表及公开场景材料。

- `retail/compass-retail.sql.gz`：唯一正式数据包，由 Git LFS 保存。
- `retail/*.sha256`、`retail/README.md`：普通 Git 文本，登记校验值、来源与初始化步骤。
- `retail/compass-retail.sql`：`pnpm data:prepare` 校验并解压生成的导入文件，已忽略，不重复提交。

按课程负责人指定采用 Git LFS 分发约 117 MiB 的压缩包，以便学员随 clone 获取同一份数据。维护者提交和推送数据包时，必须同时包含 Compass 根 `.gitattributes`、校验文件和说明，并确认 LFS 对象上传成功；只推送指针文件无法完成交付。不要重写既有 Git 历史。

更新数据时先在 `work/` 生成并完成业务、权限和独立导入验收，再更新这里的压缩包、两份摘要及版本记录。克隆后使用现成快照无需重新运行生成器。生成器及冻结素材仍维护在 `tools/data-seed/src/compass_data_seed/`，私有答案、部署凭据、候选数据和运行日志继续保留在 `work/`。
