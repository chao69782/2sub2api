# OpenAI Auth Workbench 部署文档

## 1. 本地构建

在项目根目录执行：

```powershell
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

镜像不会包含 `secrets` 目录中的密钥。

当前 `config.yaml` 中 `session_idle_minutes: 0`、`session_absolute_hours: 0`，后台登录会话不会因空闲或时间到期失效。

## 2. 配置文件和密钥

项目根目录需要：

```text
config.yaml
secrets/workbench_admin_password.txt
secrets/app_master_key.txt
secrets/app_session_secret.txt
secrets/sub2api_admin_key.txt
```

`config.yaml` 中必须使用容器路径：

```yaml
auth:
  password_file: "/run/secrets/workbench_admin_password"
security:
  master_key_file: "/run/secrets/app_master_key"
  session_secret_file: "/run/secrets/app_session_secret"
sub2api:
  admin_key_file: "/run/secrets/sub2api_admin_key"
```

宿主机文件名带 `.txt`，容器挂载目标文件名不带 `.txt`。

## 3. 构建并推送镜像

```bash
docker login crpi-no16jw5ywcx0jgxw.cn-beijing.personal.cr.aliyuncs.com --username 15632327388
docker buildx build --platform linux/amd64 --provenance=false --tag crpi-no16jw5ywcx0jgxw.cn-beijing.personal.cr.aliyuncs.com/zhang1998/openai-auth-workbench:1.0.0 --push .
```

## 4. 生产服务器准备

以下以 `/opt/openai-auth-workbench` 为例：

```bash
sudo mkdir -p /opt/openai-auth-workbench/data /opt/openai-auth-workbench/secrets
```

上传 `config.yaml` 和四个 `.txt` 文件后执行：

```bash
cd /opt/openai-auth-workbench
sudo chown -R 1000:1000 data secrets config.yaml
sudo chmod 400 config.yaml secrets/*.txt
```

## 5. 使用 docker run 启动

```bash
docker login crpi-no16jw5ywcx0jgxw.cn-beijing.personal.cr.aliyuncs.com --username 15632327388
docker pull crpi-no16jw5ywcx0jgxw.cn-beijing.personal.cr.aliyuncs.com/zhang1998/openai-auth-workbench:1.0.0
```

```bash
docker run -d \
  --name openai-auth-workbench \
  --restart unless-stopped \
  -p 1000:1000 \
  --shm-size=1g \
  -v /opt/openai-auth-workbench/config.yaml:/app/config/config.yaml:ro \
  -v /opt/openai-auth-workbench/data:/app/data \
  -v /opt/openai-auth-workbench/secrets/workbench_admin_password.txt:/run/secrets/workbench_admin_password:ro \
  -v /opt/openai-auth-workbench/secrets/app_master_key.txt:/run/secrets/app_master_key:ro \
  -v /opt/openai-auth-workbench/secrets/app_session_secret.txt:/run/secrets/app_session_secret:ro \
  -v /opt/openai-auth-workbench/secrets/sub2api_admin_key.txt:/run/secrets/sub2api_admin_key:ro \
  crpi-no16jw5ywcx0jgxw.cn-beijing.personal.cr.aliyuncs.com/zhang1998/openai-auth-workbench:1.0.0
```

如果 Sub2API 在宿主机本机，在镜像名之前增加：

```bash
--add-host host.docker.internal:host-gateway
```

## 6. 验证

```bash
docker ps --filter name=openai-auth-workbench
docker logs --tail=100 openai-auth-workbench
curl -fsS http://127.0.0.1:1000/health/ready
```

正常返回：`{"status":"ready"}`。

## 7. 更新

```bash
cd /opt/openai-auth-workbench
tar -czf "backup-$(date +%Y%m%d-%H%M%S).tar.gz" data config.yaml secrets
docker pull crpi-no16jw5ywcx0jgxw.cn-beijing.personal.cr.aliyuncs.com/zhang1998/openai-auth-workbench:1.0.0
docker rm -f openai-auth-workbench 2>/dev/null || true
```

然后重新执行第 5 节的 `docker run` 命令。数据在宿主机 `data` 目录中。

## 8. 常见错误

如果出现 `ENOENT ... /run/secrets/workbench_admin_password`，先确认启动命令挂载了：

```bash
-v /opt/openai-auth-workbench/secrets/workbench_admin_password.txt:/run/secrets/workbench_admin_password:ro
```

宿主机文件可以带 `.txt`，但容器内目标文件名必须是不带 `.txt` 的 `/run/secrets/workbench_admin_password`。其它密钥同理。不要把宿主机路径 `/opt/openai-auth-workbench/secrets/...` 写进容器内的 `config.yaml`。
