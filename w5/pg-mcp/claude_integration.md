# Claude Desktop 集成配置

## 配置文件位置

macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

## 配置内容

```json
{
  "mcpServers": {
    "postgres": {
      "command": "python",
      "args": [
        "/Users/buoge/Desktop/github/aicoding-bootcamp/w5/pg-mcp/main.py",
        "--config",
        "/Users/buoge/Desktop/github/aicoding-bootcamp/w5/pg-mcp/config/config.yaml",
        "--verbose"
      ],
      "env": {
        "PATH": "/opt/anaconda3/bin:/usr/local/bin:/usr/bin:/bin",
        "PYTHONPATH": "/Users/buoge/Desktop/github/aicoding-bootcamp/w5/pg-mcp"
      }
    }
  }
}
```

## 验证 MCP 服务器

要测试 MCP 服务器是否正常工作，可以运行：

```bash
cd /Users/buoge/Desktop/github/aicoding-bootcamp/w5/pg-mcp
python main.py --config config/config.yaml --verbose
```

如果服务器正常工作，它会等待输入而不会退出。

## 故障排除

### 问题 1: 服务器立即退出
- 原因: 数据库连接失败或配置错误
- 解决: 运行 `python diagnose.py` 检查配置

### 问题 2: API 认证失败
- 原因: API 密钥无效
- 解决: 验证 API 密钥是否正确，可以尝试在 curl 中测试:
```bash
curl https://api.moonshot.cn/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### 问题 3: Claude Desktop 找不到 Python
- 原因: Python 不在 PATH 中
- 解决: 在 env 中配置完整 PATH

## 使用方法

配置完成后，重启 Claude Desktop，然后可以询问：

- "查询前10个用户的姓名和邮箱"
- "统计每个城市的用户数量"
- "列出所有数据库"
- "刷新数据库模式"
