# OpenAI Auth Workbench 启动与部署文档

本文档使用 `docker run` 部署，服务端口为 `1000`。删除或更新容器不会影响挂载在宿主机上的配置、密钥和 SQLite 数据。

## 1. 环境要求

- Linux 服务器和 Docker Engine。
- 已运行且可被工作台容器访问的 Sub2API。
- 服务器的 `1000` 端口可用。
- 如镜像仓库要求认证，需要阿里云容器镜像服务账号。

镜像地址：

```text
crpi-no16jw5ywcx0jgxw.cn-beijing.personal.cr.aliyuncs.com/zhang1998/openai-auth-workbench:1.0.0
```

## 2. 获取项目并准备目录

```bash
sudo git clone https://github.com/chao69782/2sub2api.git /opt/openai-auth-workbench
cd /opt/openai-auth-workbench
sudo mkdir -p data secrets
sudo cp -n config.docker.example.yaml config.yaml
```

如果目录已经存在，使用以下命令更新代码：

```bash
cd /opt/openai-auth-workbench
sudo git pull --ff-only
```

## 3. 创建四个密钥文件

交互输入工作台密码和 Sub2API 管理员密钥，避免把明文写入命令历史：

```bash
cd /opt/openai-auth-workbench

read -rsp '工作台管理员密码: ' WORKBENCH_PASSWORD && echo
printf '%s' "$WORKBENCH_PASSWORD" | sudo tee secrets/workbench_admin_password.txt >/dev/null
unset WORKBENCH_PASSWORD

read -rsp 'Sub2API 管理员密钥: ' SUB2API_ADMIN_KEY && echo
printf '%s' "$SUB2API_ADMIN_KEY" | sudo tee secrets/sub2api_admin_key.txt >/dev/null
unset SUB2API_ADMIN_KEY

openssl rand -base64 32 | tr -d '\n' | sudo tee secrets/app_master_key.txt >/dev/null
openssl rand -base64 48 | tr -d '\n' | sudo tee secrets/app_session_secret.txt >/dev/null
```

设置目录和文件权限：

```bash
sudo chown -R 1000:1000 data secrets config.yaml
sudo chmod 700 data secrets
sudo chmod 400 config.yaml secrets/*.txt
```

`app_master_key.txt` 用于解密账号密码和 2FA 密钥。生产环境投入使用后不要重新生成，必须单独安全备份。

## 4. 检查 `config.yaml`

四个密钥路径必须保持为容器内路径：

```yaml
auth:
  username: "admin"
  password_file: "/run/secrets/workbench_admin_password"
  session_idle_minutes: 0
  session_absolute_hours: 0

security:
  master_key_file: "/run/secrets/app_master_key"
  session_secret_file: "/run/secrets/app_session_secret"

sub2api:
  admin_key_file: "/run/secrets/sub2api_admin_key"
```

宿主机文件名带 `.txt`，但容器内目标文件名不带 `.txt`。不要在 `config.yaml` 中填写 `/opt/openai-auth-workbench/secrets/...`。

根据 Sub2API 的部署位置设置 `sub2api.base_url`：

```yaml
# Sub2API 在同一台宿主机的 8080 端口
base_url: "http://host.docker.internal:8080/api/v1"

# 或使用可访问的 HTTPS 地址
base_url: "https://sub2api.example.com/api/v1"
```

配置中的 `session_idle_minutes: 0` 和 `session_absolute_hours: 0` 表示管理员登录会话不自动过期。公网部署建议通过防火墙限制访问范围，并在反向代理启用 HTTPS。

## 5. 登录镜像仓库并拉取镜像

```bash
docker login crpi-no16jw5ywcx0jgxw.cn-beijing.personal.cr.aliyuncs.com --username 15632327388
docker pull crpi-no16jw5ywcx0jgxw.cn-beijing.personal.cr.aliyuncs.com/zhang1998/openai-auth-workbench:1.0.0
```

密码由 `docker login` 交互输入，不要写入脚本或本文档。

## 6. 使用 `docker run` 启动

```bash
docker run -d \
  --name openai-auth-workbench \
  --restart unless-stopped \
  -p 1000:1000 \
  --shm-size=1g \
  --add-host host.docker.internal:host-gateway \
  -v /opt/openai-auth-workbench/config.yaml:/app/config/config.yaml:ro \
  -v /opt/openai-auth-workbench/data:/app/data \
  -v /opt/openai-auth-workbench/secrets/workbench_admin_password.txt:/run/secrets/workbench_admin_password:ro \
  -v /opt/openai-auth-workbench/secrets/app_master_key.txt:/run/secrets/app_master_key:ro \
  -v /opt/openai-auth-workbench/secrets/app_session_secret.txt:/run/secrets/app_session_secret:ro \
  -v /opt/openai-auth-workbench/secrets/sub2api_admin_key.txt:/run/secrets/sub2api_admin_key:ro \
  crpi-no16jw5ywcx0jgxw.cn-beijing.personal.cr.aliyuncs.com/zhang1998/openai-auth-workbench:1.0.0
```

`--add-host` 用于让容器访问宿主机上的 Sub2API。即使当前使用远程 HTTPS 地址，保留此参数也不会影响运行。

## 7. 验证启动结果

```bash
docker ps --filter name=openai-auth-workbench
docker logs --tail=100 openai-auth-workbench
curl -fsS http://127.0.0.1:1000/health/live
curl -fsS http://127.0.0.1:1000/health/ready
```

正常结果：

```json
{"status":"live"}
{"status":"ready"}
```

浏览器访问：

```text
http://服务器IP:1000
```

默认用户名是 `admin`，密码是 `secrets/workbench_admin_password.txt` 中设置的值。

## 8. 更新生产环境

先备份数据和关键配置：

```bash
cd /opt/openai-auth-workbench
sudo tar -czf "/root/openai-auth-workbench-$(date +%Y%m%d-%H%M%S).tar.gz" data config.yaml secrets
```

拉取相同标签的最新镜像并重建容器：

```bash
docker pull crpi-no16jw5ywcx0jgxw.cn-beijing.personal.cr.aliyuncs.com/zhang1998/openai-auth-workbench:1.0.0
docker rm -f openai-auth-workbench 2>/dev/null || true
```

然后重新执行第 6 节的完整 `docker run` 命令。数据仍保留在 `/opt/openai-auth-workbench/data`。

## 9. 停止与重新启动

临时停止和启动：

```bash
docker stop openai-auth-workbench
docker start openai-auth-workbench
```

删除容器但保留宿主机数据：

```bash
docker rm -f openai-auth-workbench
```

## 10. 常见问题

### 密钥文件不存在

日志示例：

```text
Unable to read admin password from /run/secrets/workbench_admin_password: ENOENT
```

检查宿主机文件和容器挂载：

```bash
ls -l /opt/openai-auth-workbench/secrets
docker inspect openai-auth-workbench --format '{{json .Mounts}}'
```

正确映射必须是：

```text
宿主机: /opt/openai-auth-workbench/secrets/workbench_admin_password.txt
容器内: /run/secrets/workbench_admin_password
```

其它三个密钥文件遵循相同规则。

### 无法访问 Sub2API

如果 Sub2API 在宿主机，确认启动命令含有：

```bash
--add-host host.docker.internal:host-gateway
```

并确认 `config.yaml` 中地址使用 `host.docker.internal`，而不是容器内的 `127.0.0.1`。

### 端口被占用

```bash
sudo ss -lntp | grep ':1000'
```

应用容器内端口固定为 `1000`。如需更换外部端口，例如改为 `18000`，启动参数使用 `-p 18000:1000`。

### 查看持续日志

```bash
docker logs -f --tail=200 openai-auth-workbench
```

## 11. 本地构建和手动推送镜像

在项目根目录执行：

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
docker build -t crpi-no16jw5ywcx0jgxw.cn-beijing.personal.cr.aliyuncs.com/zhang1998/openai-auth-workbench:1.0.0 .
docker push crpi-no16jw5ywcx0jgxw.cn-beijing.personal.cr.aliyuncs.com/zhang1998/openai-auth-workbench:1.0.0
```

Docker 镜像不会包含 `secrets/*.txt` 或 `data` 目录中的运行数据。
