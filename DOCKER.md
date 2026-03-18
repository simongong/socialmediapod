# Docker 部署手册 🚀

本项目支持通过 Docker 一键部署，方便快速在不同环境（Linux/Windows/Mac）中运行语音后端服务。

## 1. 前置条件

- 已安装 [Docker](https://docs.docker.com/get-docker/) 和 [Docker Compose](https://docs.docker.com/compose/install/)。
- 网络连接良好（首次构建时需要下载模型权重，约 100MB）。

## 2. 快速启动

1. **进入项目根目录：**
   ```bash
   cd socialmediapod
   ```

2. **启动服务：**
   ```bash
   docker-compose up -d
   ```
   *这条命令会自动完成：下载基础镜像、安装依赖、**预下载 TTS 模型**并启动 FastAPI 服务。*

3. **检查运行状态：**
   ```bash
   docker-compose ps
   ```dd
   你可以访问 `http://localhost:8000/docs` 查看 API 文档，如果能看到文档，说明后端已经成功运行。

## 3. 配置浏览器插件

1. 打开 Google Chrome，在地址栏输入 `chrome://extensions/`。
2. 在页面右上角开启 **开发者模式 (Developer mode)**。
3. 点击左上角的 **加载已解压的扩展程序 (Load unpacked)**。
4. 选择本项目中的 `socialmediapod/extension` 文件夹。

插件默认会连接 `http://localhost:8000`。由于 Docker 已经把容器的 8000 端口映射到了主机的 8000 端口，你不需要对插件做任何修改。

## 4. 常见问题

- **性能评估**：Docker 默认在 CPU 上运行。虽然 Kokoro-82M 模型非常轻量，但在常规 CPU 上也能获得不错的响应速度。
- **停止服务**：
  ```bash
  docker-compose down
  ```
- **查看日志**：
  ```bash
  docker-compose logs -f backend
  ```

## 5. 高级配置（可选）

如果你想在容器重启后仍然保留模型缓存（避免重新构建镜像时重复下载），可以修改 `docker-compose.yml`，启用 volume 挂载：

```yaml
    volumes:
      - ./backend/model_cache:/app/model_cache
```
