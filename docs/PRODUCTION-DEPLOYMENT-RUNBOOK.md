# 二课活动管理系统生产部署运行手册

适用范围：`F:\二课活动管理系统` 的生产部署、回滚与应用回滚备份清理。本手册不记录服务器地址、账号、私钥、环境变量或数据库连接信息。

## 强制边界

- 先记录 `git status --porcelain=v1` 基线；不得覆盖、重置、提交或带入用户已有的无关修改。
- 生产机是运行目录，不假定存在 Git 仓库；禁止对生产目录执行 `git pull`。
- 不读取、输出、复制或修改环境文件；尤其不得替换 `public/uploads`、`node_modules`、`.ocr-venv`。
- 不直接复制 `deploy/systemd/second-class.service` 到生产机。它是参考模板，不是现网配置。
- 删除应用备份前，必须向用户列出精确绝对路径并取得确认。

## 1. 定义发布源

1. 默认版本是最新已提交的 `HEAD`。
2. 若必须包含已验证的未提交修复，只能把该文件单独覆盖到 `git archive HEAD` 导出的发布源目录；版本标记必须写成 `+local-<reason>`。不得打包整个脏工作树。
3. 发布源只保留源码、构建配置、非上传 `public` 资源、`local-ocr`、`scripts`、`supabase`、锁文件与 `.env.example`。
4. 必须排除 `.env.local`、其他 `.env*`、`public/uploads`、`node_modules`、`.ocr-venv`、`.next`、`dist`、`cn_debug`、临时文件和用户文档。

## 2. 本地验证

~~~powershell
pnpm test
pnpm ts-check
pnpm lint:build
pnpm lint:style
git diff --check
~~~

全部通过才可继续。若发布包含未提交修复，额外确认发布源目录内该文件的 SHA-256 与工作区一致。

## 3. 生产只读预检

使用获授权连接并强制 `StrictHostKeyChecking=yes`、非交互 `sudo -n`。先只读确认：

- 当前 `.deploy-version`、`second-class.service`、首页和 `/api/health`；
- `/opt/second-class/.deploy-backups` 的目录与 `status`；
- 数据库备份与 Rainyun 对象存储备份 timer 为 `active`；
- 目标 stage、构建、发布包和备份目录均不存在。

当前服务不健康、远程目录不是普通目录、候选备份是链接或挂载点时，停止发布并报告；不要猜测或清理。

## 4. 构建受控发布包

生产构建必须同时生成 Next.js 页面产物和自定义 Node 服务：

~~~bash
pnpm exec next build --webpack
pnpm exec tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify
node --check dist/server.js
~~~

构建机可复用生产 `node_modules`，但要先比较新旧 `pnpm-lock.yaml`。锁文件不同则停止，先处理依赖变更。构建后生成 SHA-256 文件清单，检查 `.next/BUILD_ID`、`dist/server.js`，打包时排除 `.next/cache` 与 `.next/node_modules`，并校验发布包和清单哈希。

## 5. 原子切换与回滚

部署脚本必须：

1. 在独立 stage 目录解包并验证；
2. 先保留旧 `.next`、`dist`、源码和版本标记到一个新的应用回滚目录；
3. 保持 `public/uploads`、`node_modules`、`.ocr-venv`、`.env.local` 的 inode、权限和内容不变；
4. 停服务后替换允许的发布项，启动后做完整验收；
5. 任何构建、迁移、启动、OCR 或 HTTP 检查失败时，用 `trap` 恢复旧项并复核服务；
6. 全部验收通过后才更新 `.deploy-version` 与备份 `status=SUCCEEDED`。

PowerShell 向 SSH 管道传脚本会带入 CRLF；可能在发布主体成功后触发 `bash: $'\r': command not found` 并误写失败状态。远程脚本必须使用 UTF-8 LF 文件，或使用已验证的无 CR 字节传输；不能只看状态文件，必须独立核验线上状态。

## 6. 线上验收

- `.deploy-version` 等于本次发布标记；`second-class.service` 为 `active/running`，`NRestarts=0`；
- `/`、`/admin`、`/evening-study`、`/api/health` 和本次新页面为 `200`；
- 未登录 `/api/auth?me=true` 与受保护上传路径为 `401`；
- `dist/server.js`、发布清单、RapidOCR 的 `cv2` 与 `rapidocr_onnxruntime` 导入正常；
- 数据库备份和 Rainyun 对象存储备份 timer 仍为 `active`。

已知迁移问题：生产端遇到 `relation "former_activity_leaders" already exists` 时，新增表路径必须幂等，例如 `CREATE TABLE IF NOT EXISTS`；不能只依赖本地内存数据库分支。

## 7. 只保留一份应用回滚备份

只在用户明确要求且发布已验收后执行：

1. 列出所有候选目录、状态和将保留的最新目录；
2. 展示要删除的精确绝对路径，取得用户确认；
3. 对每个候选确认是普通目录、非符号链接、`realpath` 未跳转；
4. 使用无通配符的精确路径删除；
5. 复核旧目录不存在、回滚目录数为 `1`、保留目录存在、服务和 HTTP 正常。

绝不删除数据库备份、Rainyun 对象存储备份、备份 timer 或 `public/uploads`。应用回滚备份和数据备份是两类资产。

## 8. 2026-09-17 已验证案例

`cecf110` 发布曾因重复创建 `former_activity_leaders` 自动回滚。修复后，以 `cecf110…+schemafix-20260917` 标记发布；本地 66/66 测试、TypeScript、ESLint、Stylelint 和差异检查通过，线上构建、服务、页面、鉴权保护、OCR、发布清单和两项备份 timer 均通过。随后经用户按精确路径确认，清理两份旧应用回滚目录，只保留一份最新目录。

该案例是方法证据，不替代下一次部署的实时预检。
