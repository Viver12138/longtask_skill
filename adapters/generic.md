# 通用平台适配

适配器负责安装、触发和加载协议。状态、授权、并发与恢复规则只在 [执行协议](../references/protocol.md) 维护。

## 安装

仓库根目录就是 skill 包。最小安装内容：

```text
longtask/
├── SKILL.md
├── references/
│   ├── protocol.md
│   ├── templates.md
│   ├── examples.md
│   └── validation.md
└── adapters/
    └── generic.md
```

将这些内容复制到目标平台实际配置的 skills 目录。下面从已有源码目录安装，目的目录必须尚不存在，防止覆盖已有版本。路径由使用者替换，不假定任何平台的全局目录。

POSIX Shell：

```sh
skill_source='/absolute/path/to/longtask'
skill_dest='/absolute/path/to/skills/longtask'
mkdir -p "$(dirname "$skill_dest")"
mkdir "$skill_dest" && cp -R "$skill_source/SKILL.md" "$skill_source/references" "$skill_source/adapters" "$skill_dest/"
```

PowerShell：

```powershell
$skillSource = 'C:\path\to\longtask'
$skillDest = 'C:\path\to\skills\longtask'
if (Test-Path -LiteralPath $skillDest) { throw '目标已存在，请先比较版本，勿直接覆盖。' }
New-Item -ItemType Directory -Path $skillDest -ErrorAction Stop | Out-Null
foreach ($item in @('SKILL.md', 'references', 'adapters')) {
    Copy-Item -LiteralPath (Join-Path $skillSource $item) -Destination $skillDest -Recurse -ErrorAction Stop
}
```

安装后检查关键文件均存在；失败时保留错误并检查部分安装，不宣称成功。更新现有版本先比较和备份，不直接复用上述初装命令。

`README`、`docs/`、`scripts/` 和测试是源码维护资源，不属于最小运行包。验证脚本在源码仓库执行；安装后的任务不依赖脚本。无需复制 `.git` 或 `uploads/`。

## 触发与恢复

- 平台支持 skills 时按该平台方式调用，可用自然语言「用 longtask 规划这个任务」或「继续已有 longtask」。
- `/longtask` 仅在平台支持该入口时使用，不承诺通用斜杠命令。
- 以平台实际能力判断自动加载是否有效；没有验证时记录「未确认」。
- 不支持自动加载时，在新聊天粘贴协议 §13 的手动恢复入口。

## 项目加载片段

在平台支持的项目指令文件中合并下面片段。保留原有规则；已有同义片段就更新该片段，不重复追加。用户已授权配置时直接完成；否则先提供可审阅片段再请求决定。

```markdown
## longtask

当用户要求继续本项目长任务，或当前工作属于已有 longtask 时：
- 先读 `.longtask/PROTOCOL.md`、`.longtask/PLAN.md`、`.longtask/STATE.md`。
- 按固定协议检查所有权、未完成转换和实际产物，恢复当前单元或选择满足依赖的下一单元。
- 关键文件缺失时先报告并按协议恢复，不覆盖初始化；已完成任务不自动重开。

无活动任务或当前请求与之无关时，正常处理用户请求，不强行接管。
```

不要把完整状态机、锁规则和权限表复制进项目加载片段。Subagent 权限矩阵统一见协议 §10，`PLAN.md`、`STATE.md`、`S<nn>.md` 等共享记录禁止子 Agent 写入。

## 验证边界

在真实新聊天检查加载、恢复和权限行为；记录平台、版本、实际步骤与证据。文档示例不是兼容性保证，静态检查不是 Agent 集成测试。协议升级不自动改写已有 `.longtask/PROTOCOL.md`；迁移按固定版本规则处理。
