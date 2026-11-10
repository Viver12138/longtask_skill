# 示例

示例覆盖四类场景：交接写法、异常恢复、环境差异误判、两阶段确认。

核心判据只有一个：**把一个从没见过这个项目的 agent 丢进来，只给它这些文件，它能不能在 10 分钟内开始干活？**

---

## 1. 交接写法：流水账 vs 只写不可重建的东西

同一个会话（实现 JWT 认证的第一半）的两种交接写法。差距不在文笔，在**下一个会话能不能开工**。

### 坏：写成流水账

```markdown
# S02 交接

## 1. 结论
完成了认证模块的开发。

## 2. 关键决策与理由
用了 JWT。

## 3. 被否决的方案及原因
无。

## 4. 踩过的坑
改了很多文件，修了一些 bug。

## 5. 遗留线索
继续实现。

## 6. 下一会话的第一条命令
继续。

## 7. Git 状态
无。
```

**为什么坏**：

- 「完成了认证模块」不可验证——下一个会话无法判断该信还是该重做。
- 「用了 JWT」是代码里能读到的，写了等于没写；真正会丢的是**为什么不是 session**。
- 「继续」不是命令，新会话照样不知道该敲什么，只能从头探索，回到压缩前的原点。
- 七节齐全但全是空壳——**填空式写作会把思考偷走**。

### 好：只写不可重建的东西

```markdown
# S02 交接

> 计划版本：v1 · 交接状态：READY_FOR_HANDOFF · 完成时间：2026-11-10 15:40

## 1. 结论
JWT 签发与校验已完成，`npx jest src/auth` 退出码 0（42 passed，Node 22.4.0）。
一处遗留：refresh token 轮换失败时没有回滚，当前直接 500（见 §5）。S03 未开始。

## 2. 关键决策与理由
- 用 RS256 而非 HS256：第三方服务需要离线验签，对称密钥做不到。
- token 放 httpOnly cookie 而非 localStorage：XSS 面更小，代价是要处理 CSRF，已加 SameSite=Strict。

## 3. 被否决的方案及原因
- 用 session 表存状态：与无状态网关的设计冲突，且每次请求多一次 DB 往返。

## 4. 踩过的坑
- `jsonwebtoken` 的 `expiresIn` 传数字是**秒**不是毫秒。测试里等了 60ms 才发现过期逻辑根本没触发。

## 5. 遗留线索
- `src/auth/refresh.ts:47` 轮换失败时应回滚旧 token，当前直接返回 500。
- 时钟偏移（clock skew）没有测试覆盖。

## 6. 下一会话的第一条命令
npx jest src/auth/refresh.spec.ts -t "rotation failure"

## 7. Git 状态
- 开始基线：a1b2c3d
- 结束基线：未提交（工作区）
- 未提交修改：src/auth/*.ts、src/middleware/auth.ts
- 未跟踪交付物：无
```

**为什么好**：

- §1 的结论**可验证**——贴了命令、退出码和数字，下一个会话第一件事就是重跑它。
- §2 §3 全是「为什么不是别的」，这些无法从代码重建，丢了就永久丢失。
- §4 记录的是**踩坑成本**，避免下一个会话重踩。
- §6 是可以直接粘进终端的一条命令，新会话零探索即可开工。
- §7 只给索引，不复制 diff。
- 全文不到 30 行——**因为只写了值得写的**。

---

## 2. 异常恢复：没有交接文件，但有未完成的成果

上一会话在实现中途被强制关闭，`S02.md` 根本没写出来。`STATE.md` 停在检查点。

### `STATE.md`

```markdown
# 游标
- 会话：S02 · 状态：IN_PROGRESS · 计划版本：v1
- 正在做：refresh token 轮换
- 下一步：补 src/auth/refresh.spec.ts 的 rotation failure 用例
- 基线：a1b2c3d · 所有者：kscc @ 2026-11-10 14:30
- 最后更新：2026-11-10 15:10
```

### 新会话的正确恢复

```text
读 PROTOCOL.md → 读 PLAN.md → 读 STATE.md（IN_PROGRESS）
→ 没有 S02.md
→ git status 显示 src/auth/refresh.ts 有未提交修改
→ 读该文件，确认轮换逻辑已写了一半
→ 重跑 `npx jest src/auth`：3 failed（rotation failure 未覆盖）
→ 结论：继续 S02，从「补 rotation failure 用例」开始
→ 把状态保持 IN_PROGRESS，更新「正在做」和「下一步」
```

**为什么正确**：

- 没有因为「没有交接文件」就认定上一会话什么都没做。
- 用 Git 工作区和实际测试结果确认成果，而不是猜。
- 没有覆盖未提交的修改。
- 恢复后仍走完整的检查点和收尾流程。

### 错误恢复

```text
→ 没有 S02.md，认为 S02 没开始
→ 从 S01 重新执行
→ 覆盖了 src/auth/refresh.ts 里未提交的修改
```

**为什么错**：把「缺少记录」等同于「没有成果」，并且破坏了用户未提交的代码。这正是 protocol §8 明令禁止的。

---

## 3. 环境差异：不是代码退步，是环境不对

新会话重跑上一会话的验收命令，失败了。

### 表现

```text
$ npx jest src/auth
FAIL src/auth/token.spec.ts
  ● RS256 verification › rejects tampered signature
    TypeError: Cannot read properties of undefined (reading 'export')
```

### 错误判断

> 上一会话的验收是假的，代码有问题，重做。

### 正确判断

先看 `PLAN.md` 的「验收环境」：

```markdown
## 5. 验收环境
- 操作系统：macOS 14.5
- 运行时版本：Node 22.4.0
- 包管理器及版本：npm 10.8.2
- 依赖锁文件：package-lock.json
- 必需环境变量（只记录变量名）：JWT_PRIVATE_KEY_PATH
```

再查当前环境：

```text
$ node -v
v18.20.4
$ echo $JWT_PRIVATE_KEY_PATH

```

**结论**：两个环境变量/运行时都不匹配，属于环境差异。先对齐环境重跑，仍失败才判定代码缺陷。

**如果已经错误地判定为代码缺陷**：会把上一会话的成果回退，浪费一个会话。**验收记录必须带环境**，否则失败无法归因。

---

## 4. 两阶段交接：先展示，再确认

收尾阶段不能先要确认再写交接。正确对话：

### 阶段 A：准备交接

```text
Agent：
S02 已完成验收，准备交接。结果摘要：

- `npx jest src/auth` → 退出码 0（42 passed，Node 22.4.0）
- `ls src/auth/refresh.ts` → 存在，1.8 KB
- 未执行项：无

交接摘要（S02.md 已生成）：
- 结论：JWT 签发与校验完成，遗留 refresh 轮换失败未回滚
- 关键决策：RS256（离线验签）、httpOnly cookie（XSS）
- 被否方案：session 表（与无状态网关冲突）
- 遗留：src/auth/refresh.ts:47

当前状态：READY_FOR_HANDOFF。
确认后我把状态置为 HANDED_OFF，S03 才开始。是否确认？
```

### 阶段 B：确认

```text
用户：确认。

Agent：
状态已置为 HANDED_OFF。S02 结束。S03 的第一条命令是：
npx jest src/auth/refresh.spec.ts -t "rotation failure"
```

### 用户拒绝时

```text
用户：refresh 那个 500 不能留，S02 先别交接。

Agent：
明白。状态退回 IN_PROGRESS，S02.md 标记为 INCOMPLETE。
当前剩余交付物：refresh token 轮换失败时回滚旧 token。
下一步：先补失败用例，再改 src/auth/refresh.ts:47。
```

**关键**：`READY_FOR_HANDOFF` 不是 `HANDED_OFF`。用户没确认，就不能进入下一个会话。

---

## 5. Subagent 报告：不落盘等于没做

### 错误做法

```text
主 Agent 派 subagent 调研鉴权库选型。
subagent 在返回文本里给出结论：「选 jose，因为 ESM 原生支持最好」。
主 Agent 把结论放进自己的上下文，没有写文件。
父会话被压缩。
→ 结论消失，S03 重新调研，重复劳动。
```

### 正确做法

```markdown
# .longtask/reports/S02-auth-lib.md

## 任务范围
评估 jose / jsonwebtoken / jwks-rsa，给出选型建议。不改代码。

## 输入
package.json、src/auth/*.ts、Node 22 运行时

## 交付物
- 无代码交付；结论如下

## 验收结果
- `node -e "import('jose').then(()=>console.log('ok'))"` → 退出码 0
- 对比表见下（ESM / 离线验签 / 维护状态）

## 未决问题
- jwks-rsa 的缓存失效策略未验证
```

主 Agent 再核实报告与 `package.json`、锁文件是否一致，然后更新 `STATE.md`。

**判据**：subagent 的报告如果只存在于对话里，压缩后就等于没发生。
