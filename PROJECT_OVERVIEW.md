# 性能预算审计平台 — 代码理解与梳理

> 一个用于「性能预算 / 构建产物体积」全流程审计的全栈平台：登录注册、项目管理、预算配置、构建快照上传、Chunk 体积分析、违规检测、趋势统计、异常构建展示与版本对比。

---

## 1. 总体目录结构

```
performance-budget-audit/
├── backend/                  # Node.js + Express + SQLite 后端
│   ├── server.js             # 入口，挂载路由 / 静态资源
│   ├── database.js           # SQLite 连接 & 建表脚本
│   ├── middleware/auth.js    # JWT 鉴权中间件
│   └── routes/
│       ├── auth.js           # 登录/注册
│       ├── projects.js       # 项目 & 预算配置
│       ├── snapshots.js      # 快照上传/详情/对比/备注
│       └── dashboard.js      # 仪表盘统计 & 最大增长
├── frontend/                 # React + Vite + Tailwind + Recharts 前端
│   ├── vite.config.js        # 端口 3000，将 /api 代理到 8038
│   └── src/
│       ├── main.jsx          # React 根 + AuthProvider + Router
│       ├── App.jsx           # 路由表 + ProtectedRoute
│       ├── context/AuthContext.jsx  # 登录态 / token 管理
│       ├── components/Layout.jsx    # 侧边栏 + Outlet 布局
│       ├── pages/                   # 业务页面
│       │   ├── Login.jsx
│       │   ├── Dashboard.jsx
│       │   ├── Projects.jsx
│       │   ├── ProjectDetail.jsx
│       │   ├── SnapshotDetail.jsx
│       │   └── CompareView.jsx
│       └── utils/format.js   # 字节/日期格式化
└── .gitignore
```

后端服务监听 `8038`，前端开发服务监听 `3000`，并通过 Vite proxy 把 `/api` 转发到后端，参见 [vite.config.js](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/frontend/vite.config.js)。生产构建后由后端 [server.js](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/backend/server.js#L23-L27) 兜底返回 `frontend/build/index.html`（注意：Vite 默认产物目录是 `dist`，与此处不一致，详见维护建议）。

---

## 2. 模块关系总览

```
┌──────────────────────────── 前端 (React) ────────────────────────────┐
│  AuthContext  ──token──►  axios.defaults.headers.Authorization        │
│       ▲                                                               │
│  ProtectedRoute  ──► Layout ──► Pages                                 │
│                                                                       │
│  Dashboard ──► /api/dashboard/{stats,max-growth}                      │
│  Projects/ProjectDetail ──► /api/projects, /api/projects/:id/budget   │
│                              /api/snapshots, /api/snapshots/project/* │
│  SnapshotDetail ──► /api/snapshots/:id, /api/snapshots/:id/notes      │
│  CompareView ──► /api/snapshots/:id/compare/:compareId                │
└───────────────────────────────────────────────────────────────────────┘
                  │HTTP（带 Bearer Token）
                  ▼
┌──────────────────────── 后端 (Express) ──────────────────────────────┐
│  /api/auth        public              register/login → 签发 JWT       │
│  /api/projects    authMiddleware      项目 + budget_configs           │
│  /api/snapshots   authMiddleware      快照上传/查询/对比/备注         │
│  /api/dashboard   authMiddleware      聚合统计                        │
└───────────────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌──────────────────────── SQLite (database.db) ─────────────────────────┐
│  users ─< projects ─< budget_configs                                  │
│              └─< build_snapshots ─< chunks                            │
│                          └─< budget_violations >─ chunks              │
└───────────────────────────────────────────────────────────────────────┘
```

### 2.1 前端职责
- [main.jsx](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/frontend/src/main.jsx)：用 `BrowserRouter` + `AuthProvider` 包裹 `App`。
- [AuthContext.jsx](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/frontend/src/context/AuthContext.jsx)：从 `localStorage` 恢复 token，登录/注册/登出，并把 token 注入 `axios` 默认请求头。
- [App.jsx](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/frontend/src/App.jsx)：定义路由表；`ProtectedRoute` 在 `loading` 结束后根据 `user` 决定是否跳到 `/login`。
- [Layout.jsx](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/frontend/src/components/Layout.jsx)：左侧固定导航（仪表盘 / 项目管理）+ 用户/登出按钮 + `<Outlet/>`。

### 2.2 后端职责
- [server.js](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/backend/server.js)：装载 `cors`、`express.json`，挂载四组路由，托管前端静态资源。
- [database.js](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/backend/database.js)：创建 6 张表，进程启动时自动 `CREATE TABLE IF NOT EXISTS`。
- [middleware/auth.js](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/backend/middleware/auth.js)：解析 `Authorization: Bearer <token>`，挂 `req.userId / req.username`。
- 业务路由按资源拆分：`auth`、`projects`、`snapshots`、`dashboard`。

---

## 3. 数据库表关系

| 表 | 关键字段 | 说明 |
|---|---|---|
| `users` | id, username(unique), password(bcrypt), created_at | 注册用户 |
| `projects` | id, **user_id**, name, description, created_at | 用户拥有的项目 |
| `budget_configs` | id, **project_id**, max_total_size(默认 5MB), max_chunk_size(默认 1MB), max_gzip_size(默认 512KB) | 项目预算阈值 |
| `build_snapshots` | id, **project_id**, branch, version, build_time, commit_hash, notes, gate_status('pending'/'passed'/'failed'), total_size, total_gzip_size | 一次构建快照 |
| `chunks` | id, **snapshot_id**, name, size, gzip_size, chunk_type, dependency_source | 快照下的产物 chunk |
| `budget_violations` | id, **snapshot_id**, chunk_id?, violation_type, message, threshold, actual_value, created_at | 预算违规明细 |

外键关系（DDL 中有 FOREIGN KEY 但 SQLite 默认未开启 `PRAGMA foreign_keys=ON`，仅作为约束声明）：

```
users(1) ──< projects(N)
projects(1) ──< budget_configs(1)               ※ 创建项目时自动插入一条
projects(1) ──< build_snapshots(N)
build_snapshots(1) ──< chunks(N)
build_snapshots(1) ──< budget_violations(N)
chunks(1) ──< budget_violations(0..N)
```

> 数据隔离：所有列表/详情查询都通过 `WHERE p.user_id = ?` 或 `WHERE user_id = ?` 来保证「同账号可见」。但 [GET /api/snapshots/:id](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/backend/routes/snapshots.js#L188-L214)、对比、备注、预算更新等接口未再次校验 snapshot/project 的归属，存在越权读写隐患（详见维护建议）。

---

## 4. 核心业务流程

### 4.1 登录认证流程
1. 用户在 [Login.jsx](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/frontend/src/pages/Login.jsx) 提交账号密码。
2. `AuthContext.login` 调用 `POST /api/auth/login`，后端 [auth.js](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/backend/routes/auth.js#L32-L47) 用 `bcrypt.compareSync` 比对，签发 7 天有效期的 JWT。
3. 前端把 `token`/`user` 持久化到 `localStorage`，同时设置 `axios.defaults.headers.common.Authorization`。
4. 受保护路由由 `ProtectedRoute` 控制：`user` 为 `null` 时重定向到 `/login`；后端则在每个非 auth 路由前统一 `router.use(authMiddleware)`。
5. 登出会清空 token、user、axios header。

### 4.2 项目 + 预算流程
1. `Projects.jsx` 调用 `GET /api/projects` 拉取列表。
2. 创建项目 `POST /api/projects` 时，[projects.js](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/backend/routes/projects.js#L19-L39) 同时插入一条默认 `budget_configs`。
3. `ProjectDetail.jsx` 进入后并行拉取项目、快照列表、预算配置；可通过弹窗 `PUT /api/projects/:id/budget` 修改阈值。

### 4.3 快照上传 + 预算门禁
入口：`ProjectDetail.jsx` 的「上传构建」表单 + 文件选择器（仅前端解析 JSON 文本，再以 JSON 形式 POST）。

前端会兼容多种产物格式（数组 / `{ chunks }` / `{ assets }`），并对每个 chunk 兜底：
```js
{
  name: c.name || c.fileName || c.chunkNames?.[0] || 'unknown',
  size: c.size || 0,
  gzip_size: c.gzipSize || c.gzip_size || Math.round(c.size * 0.3), // gzip 缺省按 30% 估算
  chunk_type: c.type || c.chunkType || 'asset',
  dependency_source: c.dependencySource || c.dependency_source || ''
}
```

后端 [POST /api/snapshots](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/backend/routes/snapshots.js#L50-L162) 处理流程：
1. 计算 `total_size / total_gzip_size`。
2. 读取项目 `budget_configs`，若不存在则使用硬编码默认值。
3. 插入 `build_snapshots`（gate_status 默认 `pending`）。
4. 逐条插入 `chunks`，全部完成后调用 `checkBudgetViolations`：
   - **总原始体积**超过 `max_total_size` → `total_size` 违规。
   - **总 gzip 体积**超过 `max_gzip_size` → `total_gzip_size` 违规。
   - **单 chunk 的 gzip_size**超过 `max_chunk_size` → `chunk_size` 违规（注意：阈值名是 `max_chunk_size`，实际比较的是 gzip_size，是个潜在歧义）。
5. 把违规写入 `budget_violations`，并把快照 `gate_status` 更新为 `passed` / `failed`。
6. 响应 `{ id, gate_status, violations }`。

### 4.4 快照详情 / 依赖树
[SnapshotDetail.jsx](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/frontend/src/pages/SnapshotDetail.jsx) 拉取 `GET /api/snapshots/:id`，展示：
- 基本信息（version/branch/build_time）+ 4 个汇总卡片。
- 违规列表（红色块）。
- Chunks 列表（可展开看 dependency_source / chunk_type）。
- 依赖体积树：根据 `dependency_source` 用 `/` 切片，递归构建嵌套对象，叶子节点累加 gzip_size。
- 备注编辑：`PUT /api/snapshots/:id/notes`。

### 4.5 快照对比
1. `SnapshotDetail.jsx` 中通过下拉选其他快照后跳转 `/compare/:snapshotId/:compareId`。
2. [CompareView.jsx](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/frontend/src/pages/CompareView.jsx) 调 `GET /api/snapshots/:id/compare/:compareId`。
3. 后端用 `Promise.all` 并行取两个快照的 chunks，按 `name` 建 Map，遍历并集生成 `added/removed/modified` 三类差异：
   - `modified`：`size_diff`、`gzip_diff` 由「snapshot1 - snapshot2」得出，即 url 中第一个 id 视作「新版」。
4. 前端按 `gzip_diff` 渲染 Top 15 条形图、明细表格，并提供 `all/added/removed/modified` 过滤。

### 4.6 仪表盘
[GET /api/dashboard/stats](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/backend/routes/dashboard.js#L8-L53) 一次性返回：
- 当前用户 100 条最新快照中的 `total_snapshots / failed_count / violation_count`；
- 最近 5 条 `failed` 快照；
- 最近 20 条快照的体积趋势（已 reverse 成升序，便于折线图）。

[GET /api/dashboard/max-growth](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/backend/routes/dashboard.js#L55-L91) 用「同 chunk name + 上一条快照」做自连接，按 gzip 增长降序取 Top 10。

---

## 5. 关键接口说明

> 除 `/api/auth/*` 外，所有接口需 `Authorization: Bearer <jwt>`。

### 5.1 认证
| 方法 | 路径 | 入参 | 返回 |
|---|---|---|---|
| POST | `/api/auth/register` | `{ username, password }` | `{ token, user:{id,username} }` |
| POST | `/api/auth/login` | `{ username, password }` | `{ token, user:{id,username} }` |

### 5.2 项目 & 预算
| 方法 | 路径 | 入参 | 返回 |
|---|---|---|---|
| GET | `/api/projects` | — | `Project[]` |
| POST | `/api/projects` | `{ name, description }` | `{ id, name, description, user_id }` (并自动建 budget_configs) |
| GET | `/api/projects/:id` | — | `Project` |
| GET | `/api/projects/:id/budget` | — | `BudgetConfig` 或 `{}` |
| PUT | `/api/projects/:id/budget` | `{ max_total_size, max_chunk_size, max_gzip_size }` | `{ success: true }` |

### 5.3 快照
| 方法 | 路径 | 入参 | 返回 |
|---|---|---|---|
| POST | `/api/snapshots` | `{ project_id, branch?, version, commit_hash?, notes?, build_time?, chunks:[{name,size,gzip_size,chunk_type?,dependency_source?}] }` | `{ id, gate_status, violations }` |
| GET | `/api/snapshots/project/:projectId` | query: `branch?`, `version?`, `limit=20` | `Snapshot[]` |
| GET | `/api/snapshots/:id` | — | `Snapshot & { chunks, violations }` |
| GET | `/api/snapshots/:id/compare/:compareId` | — | `{ snapshot1, snapshot2, changes[], total_diff, total_gzip_diff }` |
| PUT | `/api/snapshots/:id/notes` | `{ notes }` | `{ success: true }` |

### 5.4 仪表盘
| 方法 | 路径 | 返回字段 |
|---|---|---|
| GET | `/api/dashboard/stats` | `total_snapshots, failed_count, violation_count, recent_failed[], size_trend[]` |
| GET | `/api/dashboard/max-growth?project_id=` | `[{ name, current_size, prev_size, growth, version, project_name }]` |

---

## 6. 预算校验规则（详）

实现见 [checkBudgetViolations](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/backend/routes/snapshots.js#L8-L48)：

| 类型 | 触发条件 | threshold | actual_value |
|---|---|---|---|
| `total_size` | Σchunk.size > `max_total_size` | `max_total_size` | 总原始体积 |
| `total_gzip_size` | Σchunk.gzip_size > `max_gzip_size` | `max_gzip_size` | 总 gzip 体积 |
| `chunk_size` | 任一 chunk 的 `gzip_size` > `max_chunk_size` | `max_chunk_size` | 该 chunk 的 gzip_size |

任何一项命中即把快照 `gate_status` 标记为 `failed`，否则 `passed`。

---

## 7. 数据流（典型示例：上传构建）

```
ProjectDetail.handleUpload
  └─ 解析 JSON、规范化 chunks
      └─ POST /api/snapshots  (Bearer token)
          └─ authMiddleware → req.userId
              └─ db.get budget_configs(project_id)
                  └─ db.run INSERT build_snapshots → snapshotId
                      └─ for each chunk: INSERT chunks
                          └─ checkBudgetViolations()
                              └─ INSERT budget_violations
                              └─ UPDATE build_snapshots.gate_status
                              └─ res.json { id, gate_status, violations }
ProjectDetail.fetchSnapshots() 重新拉列表渲染表格
```

---

## 8. 维护建议 / 注意点

> 以下为静态阅读到的当前代码可能影响后续开发的点，按优先级排序，仅作为提醒，未做改动。

1. **JWT 密钥硬编码**  
   [auth.js#L2](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/backend/middleware/auth.js#L2) 将 `SECRET_KEY` 写死。建议改为 `process.env.JWT_SECRET`，并在缺省时拒绝启动。

2. **跨用户越权风险**  
   - `GET /api/snapshots/:id`、`/compare`、`/notes`、`/api/projects/:id/budget`（PUT/GET）只通过登录态校验，没有再次校验 `project.user_id === req.userId`。理论上任意已登录用户可以读写他人快照、预算。建议统一加 owner 校验（JOIN projects + WHERE user_id）。

3. **静态资源目录与 Vite 产物不一致**  
   [server.js#L23-L27](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/backend/server.js#L23-L27) 指向 `frontend/build`，而 Vite 默认产出 `frontend/dist`。生产部署需统一（修改 vite.config 的 `build.outDir` 或修改 server 的路径）。

4. **`POST /api/snapshots` 未做项目归属校验**  
   外部知道 `project_id` 即可写入快照。需要校验 `project.user_id === req.userId`。

5. **预算违规判定的语义歧义**  
   `chunk_size` 违规比较的是 `gzip_size > max_chunk_size`（命名为 `max_chunk_size`），与字段名暗示的「原始体积上限」不一致。建议要么改字段名为 `max_chunk_gzip_size`，要么比较 `chunk.size`。

6. **快照写入是异步并发，没有事务**  
   `safeChunks.forEach + db.run(...)` 异步触发，依赖 `completed === safeChunks.length` 计数；中间出错时已经 inserted 的 chunks 不会回滚，且 res.json 可能在多次错误下重复触发。建议封装成事务（`db.serialize` + `BEGIN/COMMIT`），或改用 `better-sqlite3` 同步事务。

7. **`max-growth` 自连接逻辑偏窄**  
   仅按「id < 当前 id 的最大 id」找上一次快照（`build_snapshots.id` 的相对大小），未按 `branch` 或 `build_time` 划分，跨分支、补传旧 build_time 时会得到误差。

8. **gzip 缺省值估算**  
   前端 `gzip_size = Math.round(c.size * 0.3)` 对没有 gzip 字段的产物给的是粗估值，可能造成误警/漏警。建议在文档/UI 上明示，或在后端拒绝缺失字段。

9. **`size_trend` 排序**  
   `slice(0,20).reverse()` 的前提是 `snapshots` 已按 `build_time DESC`。同时如果用户跨多个项目，趋势图会把不同项目混在一起，需要在前端按 `project` 分色或在后端按 `project_id` 分组。

10. **数据库连接 & 迁移**  
    现版本只有 `CREATE TABLE IF NOT EXISTS`，新增列时不会自动迁移；建议引入 `knex/sequelize/drizzle` 做 migration 管理，避免手工 `ALTER`。

11. **前端 `proxy` 重复声明**  
    `frontend/package.json` 中的 `proxy` 字段是 CRA 习惯，对 Vite 无效（实际生效的是 vite.config 中的 proxy）。可删除以减少误导。

12. **缺少防刷 / 速率限制 / 输入校验**  
    `register` 没有用户名长度/字符校验，`snapshot.chunks` 没限制条数，建议引入 `express-rate-limit` 与 `zod/joi` 做入参校验。

13. **测试与日志**  
    项目无单元/集成测试，无统一 logger（仅 `console.log`）。后续做改造前建议先补上 `routes/snapshots` 的快照写入与预算校验测试用例，避免回归。

14. **`AuthContext` 的 token 失效感知**  
    目前不处理 401；token 过期后页面仍显示已登录。可在 `axios` 拦截器里识别 401 → `logout()` 并跳 `/login`。

---

## 9. 快速运行指引

```bash
# 后端
cd backend
npm install
npm run dev          # nodemon, 端口 8038

# 前端
cd frontend
npm install
npm run dev          # vite, 端口 3000，/api → 8038
```

数据库为 `backend/database.db`（SQLite 文件），首次启动自动建表。
