# 通用平台适配

longtask 的核心协议与平台无关（[`references/protocol.md`](../references/protocol.md)）。本文件说明如何把协议接到具体 Agent 上，以及能力缺失时如何降级。

适配层只做三件事：**安装文件、触发 skill、让新会话读取 `.longtask/PROTOCOL.md`**。它不复制协议正文。

---

## 1. 安装

### 通用方式（任何支持 Agent Skills 的平台）

把以下内容放进平台的 skills 目录，目录名用 `longtask`：

```text
longtask/
├── SKILL.md
├── references/
│   ├── protocol.md
│   ├── templates.md
│   └── examples.md
└── adapters/
    └── generic.md
```

从仓库克隆后复制：

```bash
git clone https://github.com/Viver12138/longtask_skill.git /tmp/longtask_skill
mkdir -p <your-skills-dir>/longtask
cp -r /tmp/longtask_skill/{SKILL.md,references,adapters} <your-skills-dir>/longtask/
```

`README.md` 和 `README.zh-CN.md` 是文档，不必复制。

### KSCC

```bash
# 全局——所有项目可用
git clone https://github.com/Viver12138/longtask_skill.git /tmp/longtask_skill
mkdir -p ~/.kscc/skills/longtask
cp -r /tmp/longtask_skill/{SKILL.md,references,adapters} ~/.kscc/skills/longtask/

# 或只对当前项目生效
mkdir -p .kscc/skills/longtask
cp -r /tmp/longtask_skill/{SKILL.md,references,adapters} .kscc/skills/longtask/
```

仓库根目录就是 skill 包，不存在 `longtask/` 子目录，直接 `cp -r longtask ~/.kscc/skills/` 不会成功。

### 不支持 Agent Skills 的平台

手动把 `SKILL.md` 和 `references/*.md` 提供给 Agent（作为系统提示词附件、项目知识文件，或直接粘贴），并按下文「手动入口」使用。

---

## 2. 触发

| 平台能力 | 使用方式 |
|---|---|
| 支持斜杠命令 | `/longtask` 加任务描述 |
| 支持按 description 自动调用 | 直接描述长任务，Agent 自行判断 |
| 仅支持自然语言 | 「按 longtask 的流程规划这个任务」 |
| 都不支持 | 手动入口（§4） |

`SKILL.md` 的 frontmatter 默认允许模型按 description 触发。如果希望**只允许手动调用**，在支持该字段的平台上添加：

```yaml
disable-model-invocation: true
```

无论哪种触发方式，SKILL.md 的「何时退出」三条判定都必须生效。

---

## 3. 让新会话读取协议

`.longtask/PROTOCOL.md` 是执行阶段的唯一协议来源。按平台选择一种适配方式：

### 方式 A：`AGENTS.md`（多数编码 Agent）

把 [`references/templates.md`](../references/templates.md) 中的 `AGENTS.md` 常驻指令**作为提案**交给用户，确认后追加到项目根目录的 `AGENTS.md`。

### 方式 B：其他项目级规则文件

把同一段指令写入平台识别的位置（如 `.cursor/rules`、`CLAUDE.md`、自定义项目指令）。内容保持一致，只改文件名。

### 方式 C：系统提示词 / 项目记忆

在平台的项目级系统提示词中加入同一段加载指令。

### 方式 D：手动启动语

自动加载不可用时，每次新会话由用户粘贴：

> 本项目有进行中的 longtask。先读 `.longtask/PROTOCOL.md`、`.longtask/PLAN.md` 和 `.longtask/STATE.md`，再按 `STATE.md` 的会话编号读对应的 `S<nn>.md`，然后按协议继续。重跑上一会话的验收检查之前不要改代码。

**不要在适配文件里复制协议正文。** 协议升级后，复制会产生多个版本不一致。

---

## 4. 手动入口

当 Agent 无法自动识别 skill 时，用户可以直接给出明确指令：

```text
按 longtask 协议执行：
1. 读 .longtask/PROTOCOL.md
2. 读 .longtask/PLAN.md 的「当前有效决策」「会话划分」
3. 读 .longtask/STATE.md，确认当前会话和状态
4. 读对应的 .longtask/S<nn>.md
5. 重跑上一会话的验收检查，通过后继续
```

如果连 `.longtask/` 都还没有，说明任务尚未规划，直接描述任务并说「用 longtask 规划」。

---

## 5. 能力检测与降级

Agent 在规划阶段把检测结果写入 `PLAN.md` 的「能力与降级」。

| 能力 | 不支持时的行为 |
|---|---|
| 读取项目文件 | 请用户粘贴；关键文件不可读时停止 |
| 写入项目文件 | 输出完整文件内容请用户保存，不得声称已写入 |
| Shell | 生成命令由用户执行并回报退出码与输出 |
| Git | 用文件清单 + 用户提供的版本信息替代 |
| 自动加载项目指令 | 手动启动语 |
| Subagent | 主 Agent 顺序执行 |
| 斜杠命令 | 自然语言触发 |

**共同底线**：不能把「计划执行」描述成「实际执行并验证」。无法验证的检查必须在交接文件中列为「未执行」，不得判定通过。

---

## 6. 自检清单

安装或修改 skill 后，至少走一遍以下场景：

- [ ] 单会话任务被正确拒绝，没有创建 `.longtask/`
- [ ] 多会话任务能完成规划 → 执行 → 验收 → 两阶段交接
- [ ] 用户拒绝交接后，状态正确退回 `IN_PROGRESS` 或 `BLOCKED`
- [ ] 任意检查点强制中断后，新会话能从文件和 Git 恢复
- [ ] `STATE.md` 损坏或缺失时，不猜测进度，能从历史或实际文件重建
- [ ] 前序验收在新环境失败时，能区分环境差异和代码缺陷
- [ ] 两个主会话同时启动时，能检测到并发并停止
- [ ] Subagent 报告落盘，并由主 Agent 核实
- [ ] 不支持自动加载的 Agent 能通过手动启动语恢复
- [ ] 不支持 Shell 或 Git 的 Agent 明确降级，不虚构执行结果
- [ ] 安装命令能在干净环境实际执行成功

---

## 7. 升级与版本

- `SKILL.md` 的 `metadata.version` 是 skill 版本；`.longtask/PROTOCOL.md` 头部的协议版本是任务初始化时采用的版本。
- 升级 skill **不会**自动改写已初始化的任务。
- 需要迁移时：用户确认后更新 `.longtask/PROTOCOL.md`，并在 `.longtask/PLAN.md` 的「变更记录」中写明变更内容和影响范围。
- 会话开始时发现协议版本不一致，报告差异，不擅自覆盖。
