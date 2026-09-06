# 生产备份与服务只读核验

- 核验时间：2026-09-05 22:26:15 +08:00（生产主机时间）。
- 证据范围：应用 service、Rains3 Restic timer/service、独立数据库 timer/service、Rains3 备份脚本限定关键行，以及 2026-08-01 起保留的脱敏 journal。
- 边界：未读取、打印、复制、检查或修改任何环境文件、环境值、备份凭据；未执行备份、恢复、`restic snapshots`、`restic check`、`forget`、`prune`、删除、安装、重载、启用、重启、部署或提交。

## 应用服务

2026-09-05 22:26:15 +08:00，`second-class.service` 关键输出：

```text
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
```

这只证明该时点服务运行、unit 已启用；不等于 HTTP、业务、机器重启后的启动或长期可用性已验收。

## Rains3 Restic 定时备份

```text
second-class-rains3-backup.timer
ActiveState=active
SubState=waiting
UnitFileState=enabled
LastTriggerUSec=2026-09-05 04:00:00 +08:00
NextElapseUSecRealtime=2026-09-06 04:00:00 +08:00
Triggers=second-class-rains3-backup.service

second-class-rains3-backup.service
Result=success
ExecMainStartTimestamp=2026-09-05 04:00:00 +08:00
ExecMainExitTimestamp=2026-09-05 04:00:04 +08:00
ExecMainStatus=0
ActiveState=inactive
SubState=dead
UnitFileState=static
```

`inactive/dead` 是 oneshot 成功退出后的预期状态，不是失败。

### 脚本覆盖与保留配置

只读脚本的限定关键行：

```bash
runuser -u postgres -- pg_dumpall --clean --if-exists > "$workdir/database.sql"
sha256sum "$workdir/database.sql" > "$workdir/checksums.sha256"
restic -o s3.bucket-lookup=path backup --tag second-class-daily \
  "$workdir/database.sql" /opt/second-class/public/uploads "$workdir/checksums.sha256"
restic -o s3.bucket-lookup=path forget --keep-daily 180 --prune
```

已证明脚本覆盖 PostgreSQL 全库逻辑导出、真实本地 uploads `/opt/second-class/public/uploads`、数据库导出 SHA-256 文件。它不是 `app-files` 云存储备份证明。

`--keep-daily 180` 是已见配置，**不等于仓库已有 180 个日快照**。本次没有执行 `restic snapshots`，也没有执行脚本中的 `forget --prune`。

### journal 佐证的快照事件

当前保留 journal 有 8 条成功 `snapshot ... saved` 事件：

| 时间（+08:00） | 快照短 ID |
| --- | --- |
| 2026-08-29 09:38:19 | `f9968543` |
| 2026-08-30 04:00:03 | `0e99b0f4` |
| 2026-08-31 04:00:02 | `b089e056` |
| 2026-09-01 04:00:02 | `ea07b43f` |
| 2026-09-02 04:00:02 | `1d4b0092` |
| 2026-09-03 04:00:02 | `9a876171` |
| 2026-09-04 04:00:03 | `661f7634` |
| 2026-09-05 04:00:02 | `06449475` |

这些仅为 **journal 佐证**，不是 `restic snapshots` 直接列举，不能据此报告仓库实时快照总数、实际 180 天覆盖或可恢复性。

### 失败与后续成功

保留日志显示：2026-08-27、2026-08-28、2026-08-29 均在 04:00 因未指定仓库位置失败，服务退出码 1。其后 2026-08-29 09:38:19 有成功事件，2026-08-30 至 2026-09-05 每日均有成功事件；最新直接状态是 2026-09-05 `Result=success`、退出码 0。

## 独立本机数据库 timer

`second-class-db-backup.timer` 为 `enabled/active/waiting`，2026-09-05 03:31:50 +08:00 成功，下一次为 2026-09-06 03:31:27 +08:00。其可见命令只将 `pg_dump -d second_class` 压缩至 `/var/lib/second-class-backups`，删除超过 7 天的 `.sql.gz`；**不包含 `/opt/second-class/public/uploads`，不能替代 Rains3 Restic 备份。**

## 恢复与完整性验收

本次检索范围内：

- `restore` / `recovery` 标记：0。
- `restic check` / `verify` 标记：0。
- 未见恢复演练、数据库导入校验、uploads 恢复校验或应用验收证据。

当前结论仅为“近期成功备份事件、明确脚本覆盖与日保留配置”，**不是**“已完成恢复验收”。

## 未验证项

1. 未运行 `restic snapshots`：真实快照数、远端对象和 180 天实际覆盖未验证。
2. 未运行 `restic check` 或恢复：仓库完整性和恢复可用性未验证。
3. 对象存储 endpoint、bucket、repository 当前值未验证；历史线索不是本次证明。
4. 数据库导出内容、uploads 文件完整性、校验文件复核、HTTP 和业务流程未验证。
5. 无生产写操作、无部署、无提交、无桌面通知。

## 脱敏 SSH 命令白名单

连接强制使用 `StrictHostKeyChecking=yes`、非交互 `sudo -n`。命令中不记录主机、用户、密钥路径、环境文件路径或任何凭据。

```bash
# service/timer 安全状态字段白名单
sudo -n systemctl show <unit> --no-pager \
  -p Id -p LoadState -p ActiveState -p SubState -p UnitFileState \
  -p Result -p ExecMainStatus -p ExecMainStartTimestamp \
  -p ExecMainExitTimestamp -p LastTriggerUSec -p NextElapseUSecRealtime \
  -p Triggers -p Restart -p RestartUSec -p NRestarts -p User -p Group \
  -p WorkingDirectory -p ExecStart

# 仅列出备份相关 timer/unit 名称
sudo -n systemctl list-timers --all --no-pager
sudo -n systemctl list-unit-files --type=timer --no-pager

# 脚本仅匹配覆盖、校验、备份、保留关键行；输出前脱敏
sudo -n grep -nE 'pg_dump|public/uploads|sha256sum|restic (backup|forget)|--keep-daily' <backup-script>

# 仅检索服务 journal 的成功、失败、快照、校验、恢复关键字；输出前脱敏
sudo -n journalctl -u <backup-service> --since '2026-08-01 00:00:00' --no-pager -o short-iso
```

未用 `cat` 或其他方式读取环境文件，未绕过权限，未运行任何可能改变备份状态的命令。
