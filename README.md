# Todolist Dashboard

一个基于 React、TypeScript 和 Vite 的单页 Todolist，支持今日事项管理、重复规则和按日历汇总完成进度。

## 已实现功能

- 默认展示今日待办事项
- 点击底部按钮新增 Todo
- 每条事项支持删除
- 每条事项支持选择时间
- 每条事项支持重复规则：不重复、每天、每月
- 每天可独立勾选完成状态
- 月历展示每天的完成进度，例如 6/7
- 点击日历某一天后，右侧列表切换为该日期事项
- 数据持久化到 localStorage，刷新后保留

## 重复规则说明

- 不重复：只在创建当天出现
- 每天：从创建日开始，之后每天都出现
- 每月：按创建日的“日”重复；如果目标月份没有该日期，则落在当月最后一天

## 开发命令

```bash
npm install
npm run dev
npm run dev:proxy
```

说明：

- `npm run dev` 启动前端开发服务器。
- `npm run dev:proxy` 启动本地 DeepSeek 服务端代理，默认监听 `8787`，Vite 会把 `/api/*` 转发过去。
- DeepSeek Key 现在只应写在服务端环境变量中，不要再使用 `VITE_DEEPSEEK_API_KEY` 这类前端公开变量。

构建验证：

```bash
npm run build
```

## 运行环境说明

当前项目为了兼容本机 Node 20.15.0，已将 Vite 工具链调整为可兼容的版本。若后续升级 Node 到 20.19+ 或 22.12+，可以再评估是否升级到更新的 Vite 主版本。

## 生产部署

生产环境需要同时提供两部分：

- Nginx 托管 `dist/` 静态文件
- Node 代理进程负责 `/api/deepseek`

完整步骤见 [DEPLOYMENT.md](/Users/zw/innovative-project/todolist/DEPLOYMENT.md)。
Nginx 示例配置见 [nginx.todolist.conf](/Users/zw/innovative-project/todolist/nginx.todolist.conf)。
Systemd 示例服务见 [todolist-proxy.service](/Users/zw/innovative-project/todolist/todolist-proxy.service)。
