# 生产进程托管（systemd）

## 边界：本仓库文件不是现网部署清单

`deploy/systemd/second-class.service` **仅是参考模板，禁止直接复制、安装或覆盖** `second-class.service`。它与现网已核验字段不一致；并且本次没有读取完整 unit、环境文件内容或任何环境变量值，因此不能把模板当作现网完整备份。

本文件只记录一次脱敏的只读核验、差异审查和后续需另行授权的变更流程。它不包含生产写入、重载、启用或重启命令。

## 已执行的只读核验

- **时间：** 2026-09-05 20:10:02 +08:00
- **方式：** SSH 到生产主机后，仅执行 `systemctl show` 的安全属性白名单；未执行 `systemctl cat`，未读取环境文件或环境变量值，未修改、重启或重载服务。

远端只读命令（连接地址、密钥路径已省略）：

```bash
sudo -n systemctl show second-class.service --no-pager \
  -p Id -p LoadState -p ActiveState -p SubState -p UnitFileState \
  -p Restart -p RestartUSec -p NRestarts -p User -p Group \
  -p WorkingDirectory -p ExecStart -p EnvironmentFiles
```

脱敏结果：

```text
Id=second-class.service
LoadState=loaded
ActiveState=active
SubState=running
UnitFileState=enabled
Restart=always
RestartUSec=3s
NRestarts=0
User=secondclass
Group=secondclass
WorkingDirectory=/opt/second-class
ExecStart=/usr/bin/node dist/server.js
EnvironmentFiles=/opt/second-class/.env.local (contents not read)
EnvironmentFiles=/etc/second-class/second-class.env (contents not read)
```

## 本次证据能够和不能够说明什么

| 项目 | 结论 | 边界 |
| --- | --- | --- |
| 当前运行 | 已实测：服务当时为 `active/running`。 | 这是 2026-09-05 20:10:02 +08:00 的快照，不代表未来持续健康。 |
| 开机自动启动 | 已实测配置：`UnitFileState=enabled`。 | 未做重启机器试验，不能把它表述为已验证的真实开机启动。 |
| 故障恢复 | 已实测配置：`Restart=always`、`RestartUSec=3s`；当时 `NRestarts=0`。 | **未做进程退出或重启试验**，不能声称故障恢复已实测。 |
| 环境文件 | 仅实测到两个文件路径及忽略策略。 | 未读取文件、未输出变量名或变量值，也未验证文件权限。 |

## 参考模板与现网的差异

| 字段 | 已核验现网 | 参考模板 | 处理结论 |
| --- | --- | --- | --- |
| `User` / `Group` | `secondclass` / `secondclass` | `secondclass-admin` / `secondclass-admin` | 禁止覆盖，否则可能改变运行身份与文件访问权限。 |
| `EnvironmentFiles` | `/opt/second-class/.env.local`（允许缺失）和 `/etc/second-class/second-class.env` | 仅 `/etc/second-class/second-class.env` | 禁止覆盖，否则可能丢失现有加载行为。 |
| `ExecStart` | `/usr/bin/node dist/server.js` | `/usr/bin/node /opt/second-class/dist/server.js` | 在当前工作目录下可能等价，但未据此替换现网。 |
| `Restart` / `RestartSec` | `always` / `3s` | `on-failure` / `5s` | 策略不同，必须由运维负责人单独决定。 |
| `WorkingDirectory` | `/opt/second-class` | `/opt/second-class` | 本次白名单核验中一致。 |

`[Unit]` 依赖、其他安全加固字段、资源限制、安装目标和 unit 文件来源均未通过完整 unit 内容核验；不要把未列出的字段视为一致或不存在。

## 如需变更：必须另行授权的步骤

以下是变更流程，不是可直接执行的生产命令：

1. 获得用户对具体主机、具体字段、维护窗口及可否重启的明确授权；不得用本仓库模板整份覆盖现网 unit。
2. 先对现网执行同样的安全属性白名单核验，并由负责人审查拟议差异；仅从服务白名单属性核对环境文件路径及缺失策略；不读取、打印、复制、修改或检查 `/etc/second-class/second-class.env` 本身权限。
3. 将拟议 unit 在隔离环境做语法检查，并由第二人确认运行账户、文件路径、环境文件加载和重启策略不会被意外改变。
4. 在已批准维护窗口内，仅修改获批准的字段；保留可回退的原 unit 元数据，随后才可进行 daemon reload、服务操作和 HTTP 健康检查。
5. 若任一语法、启动、健康检查或业务验收失败，立即按已批准的回退方案恢复；记录结果但不写入密钥、Cookie 或环境变量值。

## 生产验收最低要求

除 systemd 状态外，发布或变更后还需在授权范围内验证应用 HTTP 健康检查和真实业务流程。构建成功、`enabled`、或单次 `active` 都不等于生产业务验收完成。
