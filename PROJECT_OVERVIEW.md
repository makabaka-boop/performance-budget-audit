# 性能预算/构建产物审计平台 - 项目梳理文档

## 一、项目概述

这是一个前端构建产物体积审计与预算管控平台，提供构建产物上传、体积分析、预算违规检测、历史对比、趋势统计等功能。技术栈为：
- **后端**: Node.js + Express + SQLite3 + JWT
- **前端**: React 18 + Vite + React Router 6 + Recharts + Tailwind CSS (通过 class 体现) + Axios + Lucide Icons

## 二、整体目录结构

```
performance-budget-audit/
├── backend/                          # 后端服务
│   ├── server.js                     # 服务入口
│   ├── database.js                   # 数据库初始化与表创建
│   ├── package.json                  # 后端依赖
│   ├── middleware/
│   │   └── auth.js                   # JWT 认证中间件
│   └── routes/
│       ├── auth.js                   # 登录注册路由
│       ├── projects.js               # 项目管理与预算配置路由
│       ├── snapshots.js              # 构建快照与对比路由
│       └── dashboard.js              # 仪表盘统计路由
├── frontend/                         # 前端应用
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── src/
│       ├── main.jsx                  # 应用入口
│       ├── App.jsx                   # 路由配置与权限保护
│       ├── context/
│       │   └── AuthContext.jsx       # 认证状态管理
│       ├── components/
│       │   └── Layout.jsx            # 布局组件（侧边栏+头部）
│       ├── pages/
│       │   ├── Login.jsx             # 登录/注册页
│       │   ├── Dashboard.jsx         # 仪表盘页
│       │   ├── Projects.jsx          # 项目列表页
│       │   ├── ProjectDetail.jsx     # 项目详情+构建上传
│       │   ├── SnapshotDetail.jsx    # 快照详情页
│       │   └── CompareView.jsx       # 版本对比页
│       └── utils/
│           └── format.js             # 工具函数（字节/日期格式化）
└── PROJECT_OVERVIEW.md               # 本文档
```

## 三、数据库表关系图

数据库使用 SQLite，共 6 张表：

```
users (用户表)
├── id (PK)
├── username (UNIQUE)
├── password (bcrypt 哈希)
└── created_at

projects (项目表)
├── id (PK)
├── user_id (FK → users.id)
├── name
├── description
└── created_at

budget_configs (预算配置表)
├── id (PK)
├── project_id (FK → projects.id)
├── max_total_size (默认 5MB = 5242880 字节)
├── max_chunk_size (默认 1MB = 1048576 字节)
├── max_gzip_size (默认 512KB = 524288 字节)
└── created_at

build_snapshots (构建快照表)
├── id (PK)
├── project_id (FK → projects.id)
├── branch (默认 'main')
├── version
├── build_time
├── commit_hash
├── notes
├── gate_status ('pending' | 'passed' | 'failed')
├── total_size
└── total_gzip_size

chunks (产物 Chunk 表)
├── id (PK)
├── snapshot_id (FK → build_snapshots.id)
├── name
├── size
├── gzip_size
├── chunk_type
└── dependency_source

budget_violations (预算违规记录表)
├── id (PK)
├── snapshot_id (FK → build_snapshots.id)
├── chunk_id (FK → chunks.id, 可空)
├── violation_type ('total_size' | 'total_gzip_size' | 'chunk_size')
├── message
├── threshold
├── actual_value
└── created_at
```

**表关系说明**:
- 一个用户拥有多个项目 (1:N)
- 一个项目对应一条预算配置 (1:1)，创建项目时自动初始化默认配置
- 一个项目包含多个构建快照 (1:N)
- 一个快照包含多个 Chunk 文件 (1:N)
- 一个快照可能产生多条违规记录 (1:N)

## 四、前后端模块职责

### 4.1 后端模块

| 文件 | 职责 |
|------|------|
| [server.js](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/backend/server.js) | Express 应用初始化、CORS、路由挂载、静态资源服务（生产环境） |
| [database.js](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/backend/database.js) | SQLite 数据库连接、自动建表、导出 db 实例 |
| [middleware/auth.js](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/backend/middleware/auth.js) | JWT Token 校验中间件，验证后挂载 req.userId/req.username |
| [routes/auth.js](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/backend/routes/auth.js) | 用户注册 (bcrypt 加密)、登录 (返回 JWT) |
| [routes/projects.js](file:///Users/zhangxidan/9999-gsb/0608/performance-budget-audit/backend/routes/projects.js) | 项目 CRUD、预算配置获取与更新（创建项目自动初始化默认预算） |
| [routes/snapshots.js](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/backend/routes/snapshots.js) | 快照上传、预算校验、违规检测、列表查询、详情查询、版本对比、备注更新 |
| [routes/dashboard.js](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/backend/routes/dashboard.js) | 仪表盘统计：总体统计、体积趋势、最近失败构建、增长最快 Chunk Top10 |

### 4.2 前端模块

| 文件 | 职责 |
|------|------|
| [src/main.jsx](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/frontend/src/main.jsx) | React 根渲染、Router、AuthProvider 包裹 |
| [src/App.jsx](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/frontend/src/App.jsx) | 路由定义、ProtectedRoute 前端路由守卫 |
| [src/context/AuthContext.jsx](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/frontend/src/context/AuthContext.jsx) | 全局认证状态：localStorage 持久化 token/user、axios 默认 header 设置、login/register/logout 方法 |
| [src/components/Layout.jsx](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/frontend/src/components/Layout.jsx) | 后台布局：可折叠侧边栏导航、用户信息、退出登录 |
| [src/pages/Login.jsx](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/frontend/src/pages/Login.jsx) | 登录/注册切换表单 |
| [src/pages/Dashboard.jsx](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/frontend/src/pages/Dashboard.jsx) | 统计卡片、体积趋势折线图、最大增长 Chunk 横向柱状图、最近异常构建列表 |
| [src/pages/Projects.jsx](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/frontend/src/pages/Projects.jsx) | 项目卡片列表、新建项目弹窗 |
| [src/pages/ProjectDetail.jsx](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/frontend/src/pages/ProjectDetail.jsx) | 项目信息、预算配置卡片与编辑弹窗、构建历史表格（分支/版本筛选）、构建上传弹窗（支持 JSON 文件上传与手动粘贴，自动兼容 webpack/rollup stats 格式） |
| [src/pages/SnapshotDetail.jsx](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/frontend/src/pages/SnapshotDetail.jsx) | 快照统计卡片、违规提示、Chunks 可折叠列表、依赖体积树（从 dependency_source 构建层级树）、备注编辑、版本选择跳转对比 |
| [src/pages/CompareView.jsx](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/frontend/src/pages/CompareView.jsx) | 总体差异统计、差异柱状图、变更明细表格（支持按 added/removed/modified 筛选） |
| [src/utils/format.js](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/frontend/src/utils/format.js) | formatBytes（字节 → KB/MB/GB）、formatDate（日期本地化） |

## 五、登录态与权限校验逻辑

### 5.1 后端认证流程

1. **注册**: `POST /api/auth/register`
   - 接收 username/password
   - 使用 bcryptjs (10轮 salt) 对密码哈希
   - 写入 users 表，自动签发 7天有效期 JWT (含 userId, username)
   
2. **登录**: `POST /api/auth/login`
   - 查询用户，bcrypt.compareSync 验证密码
   - 签发 7天有效期 JWT

3. **JWT 中间件** ([middleware/auth.js](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/backend/middleware/auth.js)):
   - 从 `Authorization: Bearer <token>` 提取 token
   - 无 token → 401
   - 验证失败 → 401
   - 验证成功 → 将 `userId`/`username` 挂载到 req 对象，后续路由使用

4. **数据隔离**: 所有受保护路由在查询数据库时都强制带 `user_id = req.userId` 条件，确保用户只能看到自己的数据。

### 5.2 前端认证流程

1. **AuthContext** 初始化时从 localStorage 读取 token 和 user 信息
2. 如果 token 存在，自动设置 axios 默认 header `Authorization: Bearer <token>`
3. ProtectedRoute 组件 ([App.jsx](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/frontend/src/App.jsx#L12-L16)):
   - loading 状态显示"加载中..."
   - 无 user → 重定向到 /login
   - 有 user → 渲染子路由
4. Login 页登录成功后 navigate('/') 跳转首页
5. Logout 清除 localStorage、axios header、状态

## 六、页面与接口数据流

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              前端页面                                        │
├──────────────┬──────────────────────────────────────────────────────────────┤
│ Login        │ POST /api/auth/login / register                              │
│ Dashboard    │ GET  /api/dashboard/stats, /api/dashboard/max-growth         │
│ Projects     │ GET  /api/projects, POST /api/projects                       │
│ ProjectDetail│ GET  /api/projects/:id,                                      │
│              │ GET  /api/projects/:id/budget, PUT /api/projects/:id/budget  │
│              │ GET  /api/snapshots/project/:id, POST /api/snapshots         │
│ SnapshotDetail│ GET /api/snapshots/:id, PUT /api/snapshots/:id/notes        │
│ CompareView  │ GET  /api/snapshots/:id/compare/:compareId                   │
└──────────────┴──────────────────────────────────────────────────────────────┘
                                    ↓ HTTP + JWT
┌─────────────────────────────────────────────────────────────────────────────┐
│                           后端路由层 (Express)                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SQLite 数据库                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

**构建上传完整数据流**:
1. 用户在 ProjectDetail 页上传/粘贴 JSON → 前端解析 chunks 数组
2. POST /api/snapshots 发送 project_id, branch, version, commit_hash, notes, chunks, build_time
3. 后端先查询该项目的 budget_configs
4. 插入 build_snapshots 记录
5. 循环插入每个 chunk 到 chunks 表，收集生成的 chunk id
6. 调用 checkBudgetViolations() 检测违规
7. 更新快照 gate_status (passed/failed)
8. 将违规记录批量插入 budget_violations 表
9. 返回 { id, gate_status, violations } 给前端

## 七、核心接口详细说明

### 7.1 认证接口

#### POST /api/auth/register
**入参**:
```json
{ "username": "string", "password": "string" }
```
**返回**:
```json
{ "token": "jwt-token", "user": { "id": 1, "username": "xxx" } }
```

#### POST /api/auth/login
同上

---

### 7.2 项目接口 (需认证)

#### GET /api/projects
返回当前用户的所有项目列表

#### POST /api/projects
**入参**: `{ "name": "string", "description": "string" }`
**副作用**: 自动创建默认 budget_configs (5MB/1MB/512KB)

#### GET /api/projects/:id
获取单个项目详情

#### GET /api/projects/:id/budget
获取项目预算配置

#### PUT /api/projects/:id/budget
**入参**:
```json
{
  "max_total_size": 5242880,
  "max_chunk_size": 1048576,
  "max_gzip_size": 524288
}
```

---

### 7.3 快照接口 (需认证)

#### POST /api/snapshots
**入参**:
```json
{
  "project_id": 1,
  "branch": "main",
  "version": "v1.0.0",
  "commit_hash": "abc123 (可选)",
  "notes": "发布说明 (可选)",
  "build_time": "2024-01-01T12:00:00 (可选)",
  "chunks": [
    {
      "name": "main.js",
      "size": 102400,
      "gzip_size": 30720,
      "chunk_type": "asset",
      "dependency_source": "lodash/xxx (可选)"
    }
  ]
}
```
**返回**:
```json
{
  "id": 123,
  "gate_status": "passed" | "failed",
  "violations": [ /* 违规项列表 */ ]
}
```
**注意**: 前端自动兼容多种 JSON 格式，字段映射逻辑见 [ProjectDetail.jsx:80-86](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/frontend/src/pages/ProjectDetail.jsx#L80-L86)

#### GET /api/snapshots/project/:projectId
Query 参数: `branch`, `version`, `limit` (默认 20)
返回该项目的快照列表（按 build_time DESC）

#### GET /api/snapshots/:id
返回快照详情，包含 chunks[] 和 violations[]

#### GET /api/snapshots/:id/compare/:compareId
返回两个快照的对比结果:
```json
{
  "snapshot1": { /* 新快照详情 */ },
  "snapshot2": { /* 旧快照详情 */ },
  "changes": [
    {
      "name": "main.js",
      "status": "modified" | "added" | "removed",
      "old_size": 100,
      "new_size": 150,
      "size_diff": 50,
      "old_gzip_size": 30,
      "new_gzip_size": 45,
      "gzip_diff": 15
    }
  ],
  "total_diff": 1234,
  "total_gzip_diff": 567
}
```

#### PUT /api/snapshots/:id/notes
更新快照备注: `{ "notes": "string" }`

---

### 7.4 仪表盘接口 (需认证)

#### GET /api/dashboard/stats
返回:
- total_snapshots: 总构建数
- failed_count: 超预算次数
- violation_count: 违规项总数
- recent_failed: 最近 5 个失败快照
- size_trend: 最近 20 次构建体积趋势

#### GET /api/dashboard/max-growth
Query: `project_id` (可选)
返回: 最近快照与前一版本相比增长最快的 Chunk Top10，包含 chunk name、current/prev size、growth、version、project_name

## 八、预算校验规则

校验逻辑在 [snapshots.js:8-48](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/backend/routes/snapshots.js#L8-L48) 的 `checkBudgetViolations` 函数中实现。

| 违规类型 | 校验规则 | 阈值默认值 | 触发条件 |
|---------|---------|-----------|---------|
| `total_size` | 所有 chunks size 总和 | 5MB (5242880 字节) | totalSize > max_total_size |
| `total_gzip_size` | 所有 chunks gzip_size 总和 | 512KB (524288 字节) | totalGzipSize > max_gzip_size |
| `chunk_size` | 单个 chunk 的 gzip_size | 1MB (1048576 字节) | chunk.gzip_size > max_chunk_size |

**注意**: Chunk 级别校验用的是 `gzip_size` 与 `max_chunk_size` 比较，而不是原始 size。

门禁状态判定:
- 有任何 violations → `gate_status = 'failed'`
- 无违规 → `gate_status = 'passed'`

## 九、快照存储与对比逻辑

### 9.1 快照存储流程

1. 前端解析上传的 JSON（支持数组、{chunks: []}、{assets: []} 三种格式）
2. 字段映射: name ← name/fileName/chunkNames[0], size ← size, gzip_size ← gzipSize/gzip_size 或估算为 size * 0.3
3. 后端接收后，先计算 totalSize 和 totalGzipSize 再写入 build_snapshots
4. 循环插入 chunks 表，全部插入完成后再做预算校验（注意当前代码存在异步计数问题，详见下方注意点）
5. 更新 gate_status，写入 violations

### 9.2 快照对比逻辑

对比接口在 [snapshots.js:216-278](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/backend/routes/snapshots.js#L216-L278) 实现：

1. 并行查询两个快照及其所有 chunks
2. 构建两个 chunkMap（key 为 chunk.name）
3. 取两个 map 的 key 并集 allChunkNames
4. 遍历每个 name:
   - 两边都存在 → status: 'modified'，计算 size_diff/gzip_diff
   - 只在 snapshot1 → status: 'added'（snapshot1 是新快照）
   - 只在 snapshot2 → status: 'removed'（snapshot2 是旧快照）
5. 计算 total_diff / total_gzip_diff = snapshot1 - snapshot2
6. 前端显示时，正数显示红色（体积增长），负数显示绿色（体积减小）

**注意对比方向**: URL 中 `:id` 是较新的快照，`:compareId` 是基线快照。对比结果是 `snapshot1(id) - snapshot2(compareId)`。

## 十、代码中需要注意的问题与维护建议

### 10.1 当前代码存在的 Bug / 风险点

#### 🔴 高危：快照上传时预算校验存在异步竞态问题
位置: [snapshots.js:78-137](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/backend/routes/snapshots.js#L78-L137)

**问题**: 当前代码通过 `completed` 计数器等待所有 chunks 插入完成，但：
1. 如果某个 chunk INSERT 失败，代码只做 completed++ 但 chunkIds 里没有该 chunk，校验时用的是不完整的数据
2. `checkBudgetViolations` 依赖 `chunkIds` 数组中的 chunk 对象（包含 id），但在校验 total_size 和 total_gzip_size 时，实际应该使用之前计算好的 totalSize/totalGzipSize，而不是从 chunkIds reduce（因为 chunkIds 可能不完整）
3. chunk 插入成功后才 push 到 chunkIds，但校验 chunk 级违规需要的是 chunk 的 name/size/gzip_size，这些在 chunkIds 里是有的，但 chunk.id 是 this.lastID 没问题

**建议重构**: 使用 Promise.all + async/await 替代回调计数器，错误处理更清晰。

#### 🔴 高危：SECRET_KEY 硬编码
位置: [middleware/auth.js:2](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/backend/middleware/auth.js#L2)
JWT 密钥直接写在代码中，应该使用环境变量。

#### 🟡 中危：预算配置接口缺少项目归属校验
位置: [projects.js:53-76](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/backend/routes/projects.js#L53-L76)
GET/PUT `/api/projects/:id/budget` 没有校验该 project 是否属于当前登录用户！用户A理论上可以通过遍历 id 查看/修改用户B的项目预算。同样的问题也存在于 snapshots 相关接口，没有校验 project_id 归属。

#### 🟡 中危：没有全局错误处理中间件
Express 没有统一的 error handler，异步错误可能导致未捕获异常。

#### 🟡 中危：Gzip 体积估算逻辑
位置: [ProjectDetail.jsx:83](file:///Users/zhangxinyu/sunxidan/9999-gsb/0608/performance-budget-audit/frontend/src/pages/ProjectDetail.jsx#L83)
当 JSON 中没有 gzipSize 字段时，前端简单估算为 `size * 0.3`（30% 压缩率），这个估算比较粗糙，实际 gzip 压缩率通常在 60%-80% 之间（即 gzip 后是原始的 20%-40%），但不同文件类型差异很大。建议作为可配置项，或在后端也做一次估算保证一致性。

#### 🟢 低危：数据库字段类型不一致
- build_time 是 DATETIME，但插入时如果前端传 build_time 是 ISO 字符串，SQLite 会按 TEXT 存储（SQLite 是弱类型），目前排序查询没问题但类型语义不清晰。
- dashboard max-growth 查询中用 id 排序找"上一个快照"，而不是用 build_time，如果用户上传历史快照（指定旧的 build_time）可能出错。应该按 build_time DESC 来找前一个版本。

### 10.2 维护建议

1. **环境变量管理**: 引入 dotenv，将 PORT、SECRET_KEY、DB_PATH 等放入 .env
2. **数据权限**: 所有带 project_id / snapshot_id 的接口都要加 user_id 关联校验
3. **异步重构**: 后端路由全部改成 async/await + util.promisify(db.run/get/all)，避免回调地狱
4. **参数校验**: 加入请求参数校验（如 joi/zod），避免非法数据写入
5. **分页支持**: snapshots 列表目前 limit 写死 20，应支持 offset/limit 分页
6. **API 响应结构统一**: 建议统一响应格式 `{ code: 0, data: {}, message: '' }`
7. **日志**: 加入简单的请求日志和错误日志
8. **快照上传鉴权**: 如果后续需要 CI/CD 集成上传，建议增加 project-level API token 机制，而不是用用户 JWT
9. **Chunks 对比的依赖源跟踪**: 目前 dependency_source 是简单字符串，可考虑支持 source-map-explorer / webpack-bundle-analyzer 的完整依赖树格式
10. **历史快照预算回溯**: 修改预算配置后，旧快照不会重新校验，如果需要"按新预算重新审计历史"需要单独功能
11. **前端缺少 401 拦截**: 当前 axios 没有配置 response interceptor，token 过期时前端不会自动跳登录页，接口报错后用户体验不好
12. **前端样式**: 目前所有样式都是 Tailwind class 内联，没有引入 CSS 文件或 Tailwind 配置，但从 vite.config.js 看也没配置 Tailwind 插件？检查一下（实际看代码是用了 Tailwind 类名，可能需要确认 postcss 配置）
13. **数据库备份**: SQLite 文件直接在 backend 目录，建议加入定时备份机制或支持切换到 MySQL/PostgreSQL
14. **测试**: 目前完全没有测试代码，建议补充核心预算校验逻辑的单元测试

## 十一、快速启动指南

```bash
# 启动后端 (端口 8038)
cd backend
npm install
npm run dev

# 启动前端 (开发模式, Vite 默认 5173, proxy 到 8038)
cd frontend
npm install
npm run dev

# 生产构建
cd frontend && npm run build
cd .. && cd backend && npm start
# 后端会自动 serve frontend/build 静态文件
```

首次启动时会自动在 backend/database.db 创建 SQLite 数据库文件和所有表，需要先注册一个用户才能登录使用。
