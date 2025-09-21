# 剩余价值计算器 V4

> 本仓库基于 fork： https://github.com/realnovicedev/vps_calculator_docker。

> 一个基于 Material Design 3 的现代化剩余价值计算器，帮助用户精确计算主机、域名等周期性服务的剩余价值。

## 🚀 在线体验

| 演示地址 | 状态 |
|---------|------|
| [Cloudflare Pages](https://vps-price-calculator.pages.dev/) | ✅ 可用 |

## 📱 界面预览

<details>
<summary>点击查看界面截图</summary>

### 亮色模式
<img src="https://image.dooo.ng/c/2025/06/05/6840a1005714b.webp" alt="亮色模式界面">

### 暗色模式
<img src="https://image.dooo.ng/c/2025/06/05/6840a10e4d331.webp" alt="亮色模式界面">


</details>

## ✨ 核心功能

| 功能 | 描述 |
|------|------|
| 💱 **多币种支持** | 支持 USD、EUR、CNY 等 11 种主流货币 |
| 🔄 **实时汇率** | 自动获取最新汇率数据 |
| 📅 **灵活周期** | 月付到五年付 |
| 🎯 **精准计算** | 自动计算剩余天数和价值 |
| 🎨 **全新界面** | 采用 Material Design 3 设计语言
| 🐳 **容器化部署** | 支持 Docker 一键部署
| 📷 **截图功能** | 一键截图并上传到图床
| 🌓 **主题模式** | 支持亮色/暗色模式切换



## 🚀 快速部署

### 🐳 Docker 部署

```bash
docker run -d --name=jsq -p 8089:80 bobby567/calculator:latest
```
如果出现异常，请先尝试执行 ``docker pull bobby567/calculator`` 或更换端口

### ☁️ 其他方式部署

| 平台 | 部署方式 |
|------|----------|
| **Cloudflare Pages** | Fork 本仓库，连接到 Cloudflare Pages |
| **GitHub Pages** | 启用 GitHub Pages，选择 main 分支 |
| **Vercel** | 导入项目，自动部署 |
| **Netlify** | 拖拽文件夹或连接 Git 仓库 |


## 🔗 相关链接

| 项目 | 链接 |
|------|------|
| 🏠 **本项目** | [GitHub](https://github.com/komari-monitor/vps_price_calculator) |
| 🌱 **原项目** | [vps_surplus_value](https://github.com/Tomzhao1016/vps_surplus_value) |
| 📖 **Material Web** | [官方文档](https://material-web.dev/) |

## 🙏 致谢

感谢以下项目和个人的贡献：

- [pengzhile](https://linux.do/t/topic/227730/26) - 实时汇率 API 代码
- [Dooongの公益图床](https://www.nodeseek.com/post-43196-1) - 提供图床服务
- [NodeSeek 编辑器增强脚本](https://www.nodeseek.com/post-74493-1) - 图床上传代码参考
- mjj - 大鸡腿

## 📄 许可协议

本项目采用 MIT 许可，详见仓库中的 `LICENSE` 文件。并尊重上游项目的原始许可与贡献者。
