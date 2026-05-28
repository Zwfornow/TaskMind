# Todolist 部署说明

本文档适用于阿里云服务器，优先覆盖 Alibaba Cloud Linux 8；如果你用的是 Ubuntu，可把文中的 `dnf` 替换成 `apt`。

## 部署架构

- Nginx 负责托管前端静态文件 `dist/`
- Node 代理进程负责处理 `/api/deepseek`
- DeepSeek API Key 仅保存在服务器环境变量或 `.env` 中，不进入前端构建产物

## 一、服务器准备

以下命令适用于 Alibaba Cloud Linux 8。

安装基础软件：

```bash
sudo dnf makecache
sudo dnf install -y nginx git curl rsync
sudo systemctl enable --now nginx
```

安装 Node 20：

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc

nvm install 20.15.0
nvm use 20.15.0
node -v
npm -v
```

确认当前登录用户：

```bash
whoami
which node
which npm
```

后面配置 systemd 时，需要把服务文件中的 `User` 和 `ExecStart` 改成这里查到的实际值。

## 二、拉取项目并构建前端

```bash
cd /opt
sudo git clone 你的仓库地址 todolist
sudo chown -R $USER:$USER /opt/todolist

cd /opt/todolist
npm install
npm run build
```

构建完成后会生成 `dist/`。

## 三、配置代理服务环境变量

在项目根目录创建 `.env`：

```bash
cp .env.example .env
```

编辑 `.env`：

```env
DEEPSEEK_API_KEY=你的_deepseek_key
DEEPSEEK_MODEL=deepseek-chat
PORT=8787
DEEPSEEK_TIMEOUT_MS=30000
```

说明：

- `DEEPSEEK_API_KEY` 必填
- `PORT` 默认使用 `8787`
- 代理服务默认只监听 `127.0.0.1`，不会直接暴露公网端口

## 四、先手动验证代理服务

```bash
cd /opt/todolist
npm run start
```

另开一个终端测试：

```bash
curl http://127.0.0.1:8787/api/health
```

如果返回：

```json
{ "ok": true }
```

说明代理服务已正常启动。

## 五、配置 systemd 守护 Node 代理

复制示例服务文件：

```bash
sudo cp /opt/todolist/todolist-proxy.service /etc/systemd/system/todolist-proxy.service
```

按实际 Node 路径修改 `ExecStart`。可通过下面命令确认：

```bash
which node
which npm
```

通常如果你使用 nvm，需要同时修改 `User` 和 `ExecStart`，例如：

```text
User=ecs-user
ExecStart=/home/ecs-user/.nvm/versions/node/v20.15.0/bin/npm run start
```

如果你的登录用户是 `root`，则改成：

```text
User=root
ExecStart=/root/.nvm/versions/node/v20.15.0/bin/npm run start
```

启用服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now todolist-proxy
sudo systemctl status todolist-proxy
```

查看日志：

```bash
journalctl -u todolist-proxy -f
```

## 六、部署前端文件到 Nginx 目录

```bash
sudo mkdir -p /var/www/todolist
sudo rsync -av --delete /opt/todolist/dist/ /var/www/todolist/
```

## 七、配置 Nginx

Alibaba Cloud Linux 8 的 Nginx 默认使用 `/etc/nginx/conf.d/*.conf`，不使用 Ubuntu 常见的 `sites-available/sites-enabled` 目录。

复制示例配置：

```bash
sudo cp /opt/todolist/nginx.todolist.conf /etc/nginx/conf.d/todolist.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 八、阿里云轻量服务器防火墙

在阿里云控制台放行：

- `22` for SSH
- `80` for HTTP
- `443` for HTTPS

代理端口 `8787` 不需要对公网开放。

## 九、开启 HTTPS

如果你已经把域名解析到这台服务器：

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名
```

## 十、更新发布流程

以后每次更新代码，可以按下面流程发布：

```bash
cd /opt/todolist
git pull
npm install
npm run build
sudo rsync -av --delete dist/ /var/www/todolist/
sudo systemctl restart todolist-proxy
sudo systemctl reload nginx
```

## 十一、故障排查

前端页面能打开，但 AI 不可用：

```bash
curl http://127.0.0.1:8787/api/health
sudo systemctl status todolist-proxy
journalctl -u todolist-proxy -n 100 --no-pager
```

Nginx 配置是否正确：

```bash
sudo nginx -t
```

确认 DeepSeek Key 是否被加载：

```bash
cd /opt/todolist
grep DEEPSEEK_API_KEY .env
```

## 十二、安全说明

- 不要再把 DeepSeek Key 配成 `VITE_` 开头的前端环境变量
- 不要把 `.env` 提交到 Git 仓库
- 生产环境只让 Nginx 暴露 `80/443`
- Node 代理仅监听 `127.0.0.1`
