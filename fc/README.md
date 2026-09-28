# 小麦岛 AI 修图函数

此目录保存 `https://may911.top/photo/` 对应的阿里云函数计算源码。网页文件在仓库的 `photo/` 目录；GitHub Pages 只发布静态网页，不会自动部署此函数。

- 运行环境：Node.js 22；自定义运行时监听端口 `9000`。
- 将 `index.js` 的完整内容保存到阿里云 FC 的同名文件，然后在 FC 控制台部署。
- 环境变量：`DASHSCOPE_API_KEY`、`DASHSCOPE_BASE_URL`、`FREE_PUBLIC_ENABLED=true`、`ALLOWED_ORIGINS=https://may911.top,https://www.may911.top,http://localhost:8080,http://127.0.0.1:8080`。密钥只放在 FC 环境变量中，不提交到 GitHub。
- 可选：`FREE_INSTANCE_DAILY_LIMIT=20`。这是每实例内存中的尝试次数限制；实例重启或扩容会重置，不能作为严格费用上限。
- 本版只开放 `sunny`（晴空蓝海）和 `sunset`（自然黄昏），不提供局部清理或兑换码。

部署后，访问函数根路径应返回 `version: mvp-13-subject-guard`。在本目录运行 `node --test backend.test.js` 可执行不产生模型费用的模拟测试。网页还会用本地结构变化检查拦截明显新增的大面积人物或物体，但不能保证识别所有异常结果。

