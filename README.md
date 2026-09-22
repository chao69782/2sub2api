# OpenAI 账号授权工作台

独立的 Vue 3 + Fastify 管理工作台。凭据加密保存在 SQLite 中，通过 Sub2API 管理员密钥完成 OAuth 导入、刷新、健康检测和失效后的托管重授权。

## 功能

- 批量导入 `邮箱--密码--2FA密钥`，两个分隔符均接受独立的连续 2 个及以上半角 `-`。
- 账号列表、搜索、编辑、备注、删除、点击自动授权、手动刷新与健康检测；列表自动刷新授权、健康和同步状态。
- 首次由用户点击“自动授权”并设置 Sub2API 账号名称；工作台自动使用邮箱、密码和 2FA 完成授权，成功后继续检测失效并托管重新授权。
- 全局配置模型白名单、模型映射、并发数量、优先级、分组、负载系数与过期自动暂停。
- 自动从 Sub2API 选择账号数最少、延迟最低的可用代理；没有可用代理时不传 `proxy_id`。
- 管理员会话、CSRF 校验、登录限速、AES-256-GCM 凭据加密和审计记录。

验证码、安全检查、邮箱验证和设备验证不会被绕过，检测到后账号会进入“需人工处理”状态。

## Docker 部署

生产环境在服务器上从源码构建镜像，再使用 `docker run` 启动；不需要登录或拉取项目作者的镜像仓库。服务端口固定为 `1000`。

启动前必须准备以下文件，宿主机文件带 `.txt`，挂载到容器后的密钥文件名不带 `.txt`：

```text
/opt/openai-auth-workbench/config.yaml
/opt/openai-auth-workbench/secrets/workbench_admin_password.txt
/opt/openai-auth-workbench/secrets/app_master_key.txt
/opt/openai-auth-workbench/secrets/app_session_secret.txt
/opt/openai-auth-workbench/secrets/sub2api_admin_key.txt
```

每个 `.txt` 文件只写一个值，不写 `变量名=`，也不加引号。具体内容示例和安全生成命令见 [完整启动与部署文档](./DEPLOYMENT.md#3-创建四个密钥文件)。

在项目目录构建并启动：

```bash
cd /opt/openai-auth-workbench
docker build -t openai-auth-workbench:1.0.0 .
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
  openai-auth-workbench:1.0.0
```

浏览器访问 `http://服务器IP:1000`，默认用户名为 `admin`。SQLite 数据保存在宿主机 `/opt/openai-auth-workbench/data`，删除或更新容器不会丢失账号数据。

首次部署、密钥生成、更新和故障排查参见 [完整启动与部署文档](./DEPLOYMENT.md)。

## 配置说明

运行期配置位于 `config.yaml`。Sub2API 连接地址在 `sub2api.base_url` 中配置，修改后需要重启容器。扫描周期和导入模板也可以登录后在“设置”页面修改，页面保存值写入 SQLite 并优先于 YAML 默认值。Sub2API 管理员密钥只能通过 Secret 配置。

- `check_interval_minutes`：主动检测间隔，默认 5 分钟。每个周期同步 Sub2API 状态、检查令牌并测试账号；确认授权失效后自动创建重新授权任务。
- `proxy_policy`：`auto` 自动选择、`direct` 不使用代理、`fixed` 固定代理。

若通过 HTTPS 反向代理访问，请将 `server.trust_proxy` 和 `server.cookie_secure` 都改为 `true`。

## 本地开发

```powershell
pnpm install
pnpm test
pnpm typecheck
pnpm dev
```

前端开发服务器为 `http://localhost:5173`，后端为 `http://localhost:1000`。本地开发仍需准备可读取的配置与密钥文件。

## 备份

停止容器后备份整个 `data` 目录，并单独安全备份 `secrets/app_master_key.txt`。缺少主密钥将无法解密已保存的账号密码和 2FA 密钥。
