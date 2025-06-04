
# 贡献指南 (Contributing Guide)

感谢您对 FileChunk Pro 项目的关注！我们非常欢迎社区成员参与贡献，无论是报告 bug、提出功能建议，还是直接提交代码。本文档将指导您如何参与项目贡献。

## 目录

- [贡献指南 (Contributing Guide)](#贡献指南-contributing-guide)
  - [目录](#目录)
  - [行为准则](#行为准则)
  - [项目结构](#项目结构)
  - [开发环境设置](#开发环境设置)
    - [前提条件](#前提条件)
    - [安装步骤](#安装步骤)
  - [开发工作流程](#开发工作流程)
  - [代码风格和规范](#代码风格和规范)
    - [TypeScript 规范](#typescript-规范)
    - [提交消息规范](#提交消息规范)
  - [提交变更](#提交变更)
  - [测试要求](#测试要求)
  - [文档要求](#文档要求)
  - [版本发布流程](#版本发布流程)
  - [常见问题](#常见问题)
    - [如何调试 Web Worker？](#如何调试-web-worker)
    - [如何在本地测试小程序适配器？](#如何在本地测试小程序适配器)
    - [如何贡献新平台适配器？](#如何贡献新平台适配器)

## 行为准则

我们希望所有参与者都能够尊重彼此，创造一个积极、包容的社区环境。请遵循以下基本准则：

- 使用友好、包容的语言
- 尊重不同的观点和经验
- 优雅地接受建设性批评
- 关注项目和社区的最佳利益
- 对其他社区成员表示同理心

## 项目结构

FileChunk Pro 使用微内核架构，主要包含以下目录结构：

```text
filechunk-pro
├── dist/
├── filechunk-pro.ts        // UMD打包 (35KB)
├── filechunk-pro.min.ts    // UMD压缩版 (18KB)
├── esm/                    // ES模块
│   ├── core/               // 微内核
│   │   ├── kernel.ts
│   │   └── module-manager.ts
│   ├── modules/            // 功能模块
│   │   ├── transport.ts
│   │   ├── storage.ts
│   │   ├── security.ts
│   │   └── compression.ts
│   ├── adapters/           // 平台适配器
│   │   ├── browser.ts
│   │   ├── wechat.ts
│   │   ├── alipay.ts
│   │   ├── taro.ts
│   │   └── uniapp.ts
│   └── reactive/           // 响应式API
│       ├── reactive-uploader.ts
│       └── hooks/
│           ├── react.ts
│           └── vue.ts
│   └── types/              // 类型定义
│       └── index.ts
├── miniapp/                // 小程序专用包
│   ├── wechat.ts           // 微信小程序
│   ├── alipay.ts           // 支付宝小程序
│   └── taro.ts             // Taro适配
├── plugins/                // 官方插件
│   ├── encryption.ts
│   ├── validation.ts
│   └── cdn-integration.ts
└── workers/                // Web Worker
    └── hash-worker.ts
├── tests/                  // 测试文件
├── examples/               // 示例代码
├── docs/                   // 文档
├── scripts/                // 构建脚本
└── package.json
```

## 开发环境设置

### 前提条件

- Node.js (>= 14.0.0)
- npm (>= 6.0.0) 或 yarn (>= 1.22.0)
- TypeScript (>= 4.5.0)

### 安装步骤

1. Fork 项目仓库并克隆到本地：

```bash
git clone https://github.com/你的用户名/filechunk-pro.git
cd filechunk-pro
```

2. 安装依赖：

```bash
npm install
# 或
yarn install
```

3. 启动开发服务器：

```bash
npm run dev
# 或
yarn dev
```

4. 运行测试：

```bash
npm test
# 或
yarn test
```

## 开发工作流程

1. 从 `main` 分支创建新的功能分支：

```bash
git checkout -b feature/your-feature-name
# 或
git checkout -b fix/your-bug-fix
```

2. 进行必要的代码更改

3. 确保代码通过测试和 lint 检查：

```bash
npm run lint
npm test
# 或
yarn lint
yarn test
```

4. 提交代码（请遵循 [提交消息规范](#提交消息规范)）：

```bash
git add .
git commit -m "feat: add new feature"
```

5. 将您的分支推送到 GitHub：

```bash
git push origin feature/your-feature-name
```

6. 创建 Pull Request

## 代码风格和规范

我们使用 TypeScript 作为主要开发语言，并使用 ESLint 和 Prettier 来保持一致的代码风格。

### TypeScript 规范

- 所有文件必须使用 TypeScript (.ts) 编写
- 为所有公共 API 提供完整的类型定义
- 使用接口定义模块契约
- 避免使用 `any` 类型，尽可能使用明确的类型
- 使用枚举而非字符串常量

### 提交消息规范

我们使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<类型>[可选 作用域]: <描述>

[可选 正文]

[可选 脚注]
```

类型包括：

- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档变更
- `style`: 代码格式变更（不影响代码逻辑）
- `refactor`: 代码重构（既不是新功能也不是修复 bug）
- `perf`: 性能优化
- `test`: 添加或修改测试
- `build`: 构建系统或外部依赖项变更
- `ci`: CI 配置变更
- `chore`: 其他变更

例如：

```
feat(upload): 添加动态分片大小调整功能

基于网络速度自动调整上传分片大小，提高传输效率。

Closes #123
```

## 提交变更

1. 确保您的代码符合我们的代码风格和规范
2. 确保所有测试都通过
3. 确保您的提交消息符合规范
4. 创建 Pull Request 到 `main` 分支
5. 在 PR 描述中详细说明您的变更和原因
6. 等待代码审查

## 测试要求

- 所有新功能必须包含测试
- 所有 bug 修复必须包含测试用例来验证修复
- 测试覆盖率不应下降
- 单元测试应使用 Jest 框架
- 集成测试应包括浏览器和小程序环境

测试命令：

```bash
# 运行所有测试
npm test

# 运行单元测试
npm run test:unit

# 运行集成测试
npm run test:integration

# 检查测试覆盖率
npm run test:coverage
```

## 文档要求

- 所有公共 API 必须有 JSDoc 注释
- 重要的功能更改必须更新 README.md 和相关文档
- 新功能应该在 `/docs` 目录中提供示例和使用说明
- 文档应同时提供中文和英文版本

## 版本发布流程

我们使用 [Semantic Versioning](https://semver.org/) 进行版本管理：

- 主版本号（X.0.0）：不兼容的 API 变更
- 次版本号（0.X.0）：向后兼容的功能新增
- 修订版本号（0.0.X）：向后兼容的问题修复

版本发布流程：

1. 更新 `CHANGELOG.md`
2. 更新版本号（`npm version`）
3. 构建生产版本（`npm run build`）
4. 发布到 npm（`npm publish`）
5. 创建 GitHub Release

## 常见问题

### 如何调试 Web Worker？

Web Worker 调试可以使用 Chrome DevTools 的专用 Worker 调试面板。开发时可以使用 `debugger` 语句或 `console.log` 进行调试。

### 如何在本地测试小程序适配器？

1. 构建小程序专用包：

   ```bash
   npm run build:miniapp
   ```

2. 将生成的文件复制到小程序项目中进行测试

### 如何贡献新平台适配器？

1. 在 `src/adapters/` 目录下创建新的适配器文件
2. 实现 `IPlatformAdapter` 接口
3. 在 `PlatformAdapterFactory` 中添加新平台的检测和实例化逻辑
4. 添加相应的测试用例
5. 更新文档，说明新平台的支持情况

---

如有任何疑问，请随时在 Issues 中提问或联系项目维护者。感谢您的贡献！
