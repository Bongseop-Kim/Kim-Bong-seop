---
author: Kim Bong-seop
pubDatetime: 2026-02-28T04:00:00Z
title: "Part 5. Oh My Bridge — 플러그인 구성과 작동 방식"
slug: oh-my-bridge
featured: false
draft: false
tags:
  - claude-code
  - llm
  - mcp
  - workflow
description: oh-my-bridge 플러그인의 구성 요소와 작동 방식을 단계별로 정리한다. MCP 서버 등록, SubAgent 정의, Hook 비용 로깅, 안정성 설계를 포함한다.
---

**oh-my-bridge**는 Claude Code 워크플로우에 외부 LLM(GPT-5.3-codex)을 통합하는 Claude Code 플러그인이다.

**핵심 원칙: Claude가 판단하고, GPT가 생성한다.**

MCP Server → SubAgent → Hook → Skill → Plugin 레이어를 쌓아 Codex CLI(GPT-5.3-codex)를 Claude Code 워크플로우에 통합한다.

> **소스 코드:** [github.com/Bongseop-Kim/oh-my-bridge](https://github.com/Bongseop-Kim/oh-my-bridge)

전략과 배경은 **[Part 1. Oh My Bridge: Claude Code 멀티 LLM 오케스트레이션 전략](/posts/claude-code-multi-llm-orchestration)**을 참조한다.

---

## 1. 플러그인 디렉토리 구조

```
oh-my-bridge/
├── .claude-plugin/
│   └── plugin.json                    플러그인 메타데이터
├── .mcp.json                          MCP 서버 등록 설정
├── agents/
│   └── codex-generator.md             SubAgent 정의
├── hooks/
│   ├── hooks.json                     Hook 이벤트 바인딩
│   ├── log-codex-usage.sh             JSONL 사용량 로깅
│   └── codex-fallback.sh              장애 감지 + fallback 주입
├── skills/
│   └── subagent-driven-development/
│       ├── SKILL.md                   워크플로우 오버라이드
│       └── implementer-prompt.md      위임 프롬프트 템플릿
└── setup.sh                           스킬 배포 헬퍼
```

---

## 2. 전체 실행 흐름

```
사용자 요청
  → /subagent-driven-development 스킬 트리거 (Superpowers)
  → Step 1: codex-generator SubAgent 디스패치 (haiku 오케스트레이터)
      → 7-Section 위임 프롬프트 조합
      → codex -q -a full-auto --writable-roots "$(pwd)" "{prompt}"
      → GPT-5.3-codex가 파일 직접 생성/수정
      → 결과 검증 (파일 존재 확인, 문법 검사)
      → PostToolUse Hook 자동 트리거
          → log-codex-usage.sh: JSONL 로그 기록
          → codex-fallback.sh: 에러 감지 → additionalContext 주입
  → Step 2: Spec Reviewer SubAgent (Claude 네이티브, 원본 그대로)
  → Step 3: Code Quality Reviewer SubAgent (Claude 네이티브, 원본 그대로)
```

---

## 3. 레이어별 구성

### 3.1 MCP Server — `.mcp.json`

Codex CLI의 내장 `mcp-server` 모드를 활용하여 Claude Code에 네이티브 도구로 등록한다.

```json
{
  "codex": {
    "type": "stdio",
    "command": "codex",
    "args": ["-m", "gpt-5.3-codex", "mcp-server"]
  }
}
```

`/plugin install` 후 Claude Code 세션에서 `/mcp`를 실행하면:

```
plugin:oh-my-bridge:codex · ✔ connected
```

실제 도구명: `mcp__plugin_oh-my-bridge_codex__codex`

### 3.2 SubAgent — `agents/codex-generator.md`

haiku가 오케스트레이터를 맡아 CLI 명령을 조합하고 결과를 검증한다. 실제 코드 생성은 Codex CLI → GPT-5.3-codex가 처리한다.

**프론트매터:**

```yaml
name: codex-generator
description: 코드 생성, 보일러플레이트, 테스트 생성 시 사용
tools: Bash, Read, Write
model: haiku
maxTurns: 10
permissionMode: acceptEdits
```

**워크플로우 (4단계):**

1. **프롬프트 조합** — 7-Section 위임 프롬프트를 태스크 설명으로부터 구성
2. **Codex CLI 실행**
   ```bash
   codex -q -a full-auto --writable-roots "$(pwd)" "{prompt}"
   ```
   - `-q`: quiet 모드 (인터랙티브 UI 억제)
   - `-a full-auto`: GPT가 자율적으로 파일 생성/수정
   - `--writable-roots`: 쓰기 가능 경로를 현재 프로젝트로 한정
3. **결과 검증** — 파일 존재 확인, 문법 검사 (`node --check`, `python -m py_compile` 등)
4. **결과 반환** — 생성/수정된 파일 목록, 검증 결과, 에러 발생 시 상세 정보

실패 시 SubAgent는 자체 수정이나 재시도를 하지 않고 부모 세션에 에러를 보고한다. 재시도는 `codex-fallback.sh`의 `additionalContext`를 읽은 Claude가 결정한다.

### 3.3 Hook — `hooks/`

`PostToolUse` 이벤트 기반 비용 로깅과 fallback 주입은 **[Part 3. Inside oh-my-opencode — Hook 시스템](/posts/inside-oh-my-opencode)**과 **[Part 4. Inside oh-my-claudecode — 훅 기반 인터셉션 레이어](/posts/inside-oh-my-claudecode)**에서 분석한 훅 패턴을 Claude Code 플러그인 범위에서 구현한 것이다.

`PostToolUse` 이벤트에 `mcp__plugin_oh-my-bridge_codex__.*` 패턴을 매칭하여 Codex MCP 호출마다 두 훅을 순서대로 실행한다.

**`hooks/hooks.json`:**

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "mcp__plugin_oh-my-bridge_codex__.*",
      "hooks": [
        {"type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/hooks/log-codex-usage.sh"},
        {"type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/hooks/codex-fallback.sh"}
      ]
    }]
  }
}
```

**`log-codex-usage.sh` — JSONL 사용량 로깅:**

stdin에서 PostToolUse 페이로드를 읽어 `~/.claude/logs/codex-usage.log`에 추가한다.

```json
{
  "timestamp": "2026-02-28T08:59:54Z",
  "tool": "mcp__plugin_oh-my-bridge_codex__codex",
  "status": "success",
  "exit_code": "",
  "error": ""
}
```

**`codex-fallback.sh` — 장애 감지 + fallback 주입:**

Codex 응답에서 `.error` 필드 또는 비정상 `exit_code`를 감지하면 `additionalContext`를 출력한다.

```bash
{"additionalContext": "⚠️ Codex 호출 실패. 동일 태스크를 codex-generator SubAgent 대신 Claude 네이티브 SubAgent로 재실행하라."}
```

성공 시 아무것도 출력하지 않으며 Claude Code가 정상적으로 진행한다. 훅은 감지 역할만 담당하고, 실제 fallback 전환은 `additionalContext`를 읽은 Claude가 결정한다.

### 3.4 Skill — `skills/subagent-driven-development/`

Superpowers의 `subagent-driven-development` 스킬을 오버라이드한다. Implementer를 `codex-generator` SubAgent로 교체하고, Spec Reviewer / Code Quality Reviewer는 원본 그대로 유지한다.

오버라이드 메커니즘 상세는 **[Part 2. Inside Superpowers](/posts/inside-superpowers)**를 참조한다.

**`SKILL.md` — 오버라이드 워크플로우:**

```
1. Implementer: codex-generator SubAgent 디스패치
   - 7-Section 위임 포맷 사용 (implementer-prompt.md)
   - 실패 시 fallback hook 지시에 따라 Claude 네이티브 Implementer로 재시도
   - 권장: git worktree 격리 후 실행

2. Spec Reviewer: 원본 그대로

3. Code Quality Reviewer: 원본 그대로
```

**`implementer-prompt.md` — 위임 프롬프트 템플릿:**

7-Section 포맷을 정의한다. Stateless 설계 특성상 각 호출에 전체 컨텍스트를 포함해야 하며, 재시도 시 이전 시도 내용과 에러를 함께 넣는다.

```
1. TASK: {원자적, 구체적 목표 한 문장}
2. EXPECTED OUTCOME: {성공 기준}
3. CONTEXT: {현재 상태, 관련 파일 경로/스니펫, 배경}
4. CONSTRAINTS: {기술 제약, 기존 패턴, 변경 불가 항목}
5. MUST DO: {필수 요건}
6. MUST NOT DO: {금지 행동}
7. OUTPUT FORMAT: {출력 형식}
```

Stateless 재시도 시 `CONTEXT` 섹션에 이전 시도 기록을 포함한다. 최대 3회 시도 후 부모 세션으로 에스컬레이션한다.

GPT(principle-driven)에는 간결한 목표와 제약만 제시하고, Claude(mechanics-driven)에는 상세한 체크리스트를 명시하는 방식의 차이는 **[Part 3. Inside oh-my-opencode — 모델 성격 매칭](/posts/inside-oh-my-opencode)**에서 실증 데이터(프롬프트 줄 수 차이)와 함께 분석한다.

---

## 4. 설치

### Phase 1–2: 플러그인 설치

```bash
/plugin install /path/to/oh-my-bridge
# 또는 마켓플레이스에서
/plugin install oh-my-bridge
```

자동으로 처리되는 항목:
- `.mcp.json` → `mcp__plugin_oh-my-bridge_codex__codex` 도구 등록
- `agents/codex-generator.md` → SubAgent 자동 등록 (플러그인 `agents/` 자동 스캔)
- `hooks/hooks.json` → `PostToolUse` 훅 바인딩 (`${CLAUDE_PLUGIN_ROOT}` = 플러그인 캐시 경로)

### Phase 3: 스킬 오버라이드 (Superpowers 필요)

`/plugin install`은 `skills/`를 `~/.claude/skills/`에 복사하지 않는다. 수동 배포가 필요하다.

```bash
# setup.sh로 자동 배포
./setup.sh

# 되돌리기
./setup.sh --undo
```

또는 수동:

```bash
mkdir -p ~/.claude/skills/subagent-driven-development
cp skills/subagent-driven-development/SKILL.md ~/.claude/skills/subagent-driven-development/
cp skills/subagent-driven-development/implementer-prompt.md ~/.claude/skills/subagent-driven-development/
```

Superpowers의 개인 스킬 우선 매칭에 의해 `~/.claude/skills/subagent-driven-development/`가 원본보다 먼저 로드된다.

---

## 5. 동작 확인

### MCP 서버 연결

Claude Code 세션에서 `/mcp` 실행:

```
plugin:oh-my-bridge:codex · ✔ connected
```

`disconnected`면 Codex CLI 설치(`codex --version`) 또는 인증(`codex /status`) 확인.

### SubAgent 등록

`/agents` 실행:

```
oh-my-bridge:codex-generator · haiku
```

### Hook 로그

Codex MCP 호출 후:

```bash
cat ~/.claude/logs/codex-usage.log
tail -5 ~/.claude/logs/codex-usage.log | jq .

# 에러만 필터
jq 'select(.status == "error")' ~/.claude/logs/codex-usage.log
```

### 스킬 오버라이드

```bash
head -6 ~/.claude/skills/subagent-driven-development/SKILL.md
# "oh-my-bridge override" 텍스트가 나오면 정상
```

### E2E 흐름 확인

```
/subagent-driven-development implement a hello world function in /tmp/hello-bridge.js
```

정상 실행 시:

```
⏺ Step 1: Dispatching Implementer (codex-generator SubAgent)

⏺ oh-my-bridge:codex-generator(...)
  ⎿  Done (...)

⏺ Step 2 & 3: Dispatching Spec Reviewer and Code Quality Reviewer in parallel
...
```

`oh-my-bridge:codex-generator`가 Implementer로 디스패치되면 전체 흐름 정상.

---

## 6. 통제 수단

| 통제 수단 | 구현 방식 |
|-----------|----------|
| 외부 모델 호출 범위 | 스킬 트리거 조건 + SubAgent description |
| fix loop 반복 제한 | SubAgent `maxTurns: 10` + 스킬 "최대 3회" 규칙 |
| 쓰기 경로 제한 | `--writable-roots "$(pwd)"` |
| 비용 추적 | `log-codex-usage.sh` JSONL 로깅 |
| 에러 시 자동 fallback | `codex-fallback.sh` → `additionalContext` 주입 → Claude 네이티브로 전환 |
| 오케스트레이션 비용 | `model: haiku` (haiku는 CLI 명령 조합·검증만, 실제 생성은 GPT) |
| 보안 | 시크릿 전달 금지 규칙 명시, 프로젝트 외부 쓰기 차단 |

---

## 7. 안정성 설계

### full-auto 모드 리스크 완화

`codex -a full-auto`는 GPT가 파일을 자율적으로 수정한다. 의도치 않은 덮어쓰기를 방지하기 위해 **git worktree 격리**를 권장한다. 외부 모델의 파일 편집 정확도 자체의 문제(해시 기반 편집 패턴 등)는 **[Part 3. Inside oh-my-opencode — 하네스 문제](/posts/inside-oh-my-opencode)**에서 다룬다.

```bash
# Implementer 실행 전 worktree 생성
git worktree add .worktrees/codex-impl -b feat/codex-impl-{task-id}
cd .worktrees/codex-impl

# 리뷰 통과 후 머지
git checkout main
git merge feat/codex-impl-{task-id}
git worktree remove .worktrees/codex-impl
```

Superpowers의 `using-git-worktrees` 스킬을 활용하면 이 과정을 자동화할 수 있다. `implementer-prompt.md`에 worktree 격리 절차가 템플릿으로 포함되어 있다.

### Stateless 재시도 프로토콜

Codex CLI 각 호출은 독립적이므로, 재시도 시 이전 시도 내용 전체를 컨텍스트에 포함한다:

```
Attempt 1 → 실패
  ↓
Attempt 2 (원래 태스크 + Attempt 1 시도 내용 + 에러 상세)
  ↓
Attempt 3 (전체 히스토리)
  ↓
부모 세션 에스컬레이션
```

---

## 시리즈

- **[Part 1. Oh My Bridge: Claude Code 멀티 LLM 오케스트레이션 전략](/posts/claude-code-multi-llm-orchestration)** — oh-my-bridge 배경, 대안 탐색, 전체 구조
- **[Part 2. Inside Superpowers](/posts/inside-superpowers)** — 스킬 시스템 동작 원리, SubAgent 패턴 상세
- **[Part 3. Inside Oh My Opencode](/posts/inside-oh-my-opencode)** — 설계 패턴 레퍼런스, 멀티 에이전트 오케스트레이션, 도구 혁신
- **[Part 4. Inside Oh My Claudecode](/posts/inside-oh-my-claudecode)** — 훅 기반 인터셉션, 에이전트 티어, autopilot 파이프라인
- **[Part 5. Oh My Bridge: 플러그인 구성과 작동 방식](/posts/oh-my-bridge)** — 플러그인 구성과 작동 방식
