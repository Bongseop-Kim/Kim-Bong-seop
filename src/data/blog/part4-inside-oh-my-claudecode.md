---
author: Kim Bong-seop
pubDatetime: 2026-02-28T03:00:00Z
title: "Part 4. Inside oh-my-claudecode"
slug: inside-oh-my-claudecode
featured: false
draft: false
tags:
  - claude-code
  - llm
  - multi-agent
  - workflow
description: oh-my-claudecode의 프로젝트 구조, 훅 기반 인터셉션 동작 원리, 에이전트·스킬 시스템을 소스코드 기반으로 정리한 비교 참고 자료다.
---

> 소스: [github.com/Yeachan-Heo/oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) (v4.5.1, MIT License)
> npm: `oh-my-claude-sisyphus`

이 문서는 oh-my-claudecode(이하 OMC)의 프로젝트 구조, 동작 원리, 에이전트·스킬 시스템을 소스코드 기반으로 정리한 **비교 참고 자료**다. OMC는 Claude Code 네이티브 플러그인이지만, **[Superpowers 기반 전략](/posts/inside-superpowers)**과 직접 교체하는 관계가 아니다. Hook 기반 인터셉션의 실구현 방식, 외부 모델(Codex/Gemini) tmux 통합 패턴을 참고하는 용도로 활용한다.

---

## 1. 전체 프로젝트 구조

```
Yeachan-Heo/oh-my-claudecode/
├─ src/                  ← TypeScript 소스 (592개 파일, 145k LOC)
│   ├─ features/         ← 핵심 기능 모듈 (model-routing, delegation-routing, verification 등)
│   ├─ hooks/            ← 훅 이벤트 처리 로직
│   ├─ config/           ← 설정 로더
│   ├─ shared/           ← 공유 타입 정의
│   └─ ...
├─ agents/               ← 21개 에이전트 프롬프트 (마크다운)
├─ skills/               ← 38개 스킬 정의 (마크다운)
├─ scripts/              ← 빌드/런타임 스크립트 (Node.js)
├─ bridge/               ← 컴파일된 브리지 (CJS)
├─ hooks/
│   └─ hooks.json        ← 10개 이벤트, 21개 훅 핸들러
├─ dist/                 ← 빌드 결과물
└─ templates/            ← 설정 파일 템플릿
```

Superpowers(마크다운 + JS 유틸 몇 개)와 달리, OMC는 **TypeScript로 작성된 본격적인 런타임 레이어**를 가진다. 마크다운 에이전트·스킬은 행동 규칙이지만, 그 아래에서 Node.js 스크립트가 프롬프트 주입, 모델 라우팅, 상태 관리 등을 실행한다.

---

## 2. 동작 원리: 훅 기반 인터셉션 레이어

OMC의 핵심 설계는 **Claude Code의 훅 이벤트를 전면 활용**하는 것이다. 세션 시작부터 종료까지 모든 단계에 Node.js 스크립트를 끼워 넣는다.

### 훅 이벤트 전체 목록 (hooks/hooks.json)

| 이벤트 | 스크립트 | 역할 |
|--------|----------|------|
| `UserPromptSubmit` | `keyword-detector.mjs` | 매직 키워드 감지 → 스킬 자동 주입 |
| `UserPromptSubmit` | `skill-injector.mjs` | 스킬 컨텍스트 주입 |
| `SessionStart` (모든) | `session-start.mjs` | 퍼시스턴트 모드 복원, 코드베이스 맵 주입 |
| `SessionStart` (모든) | `project-memory-session.mjs` | 프로젝트 메모리 로드 |
| `SessionStart` (init) | `setup-init.mjs` | 초기 설치 설정 |
| `SessionStart` (maintenance) | `setup-maintenance.mjs` | 유지보수 작업 |
| `PreToolUse` (모든) | `pre-tool-enforcer.mjs` | 도구 사용 전 규칙 강제 |
| `PreToolUse` (ExitPlanMode) | `context-safety.mjs` | 컨텍스트 안전 검사 |
| `PermissionRequest` (Bash) | `permission-handler.mjs` | Bash 권한 요청 처리 |
| `PostToolUse` | `post-tool-verifier.mjs` | 도구 결과 검증 |
| `PostToolUse` | `project-memory-posttool.mjs` | 프로젝트 메모리 업데이트 |
| `PostToolUseFailure` | `post-tool-use-failure.mjs` | 실패 처리 |
| `SubagentStart` | `subagent-tracker.mjs start` | 서브에이전트 추적 시작 |
| `SubagentStop` | `subagent-tracker.mjs stop` | 서브에이전트 추적 종료 |
| `SubagentStop` | `verify-deliverables.mjs` | 서브에이전트 산출물 검증 |
| `PreCompact` | `pre-compact.mjs` | 컨텍스트 압축 전 처리 |
| `PreCompact` | `project-memory-precompact.mjs` | 메모리 저장 후 압축 |
| `Stop` | `context-guard-stop.mjs` | 종료 시 컨텍스트 보호 |
| `Stop` | `persistent-mode.cjs` | 퍼시스턴트 모드 상태 저장 |
| `Stop` | `code-simplifier.mjs` | 코드 간소화 후처리 |
| `SessionEnd` | `session-end.mjs` | 세션 종료 정리 |

Superpowers의 훅이 세션 시작 1개뿐인 반면, **OMC는 10개 이벤트에 21개 핸들러**를 등록한다.

### 동작 흐름

```
1. 세션 시작 (SessionStart)
   ↓
2. session-start.mjs: 퍼시스턴트 모드 복원 + 코드베이스 맵 생성 → additionalContext 주입
3. project-memory-session.mjs: 프로젝트별 메모리 로드 → additionalContext 주입
   ↓
4. 사용자 프롬프트 입력 (UserPromptSubmit)
   ↓
5. keyword-detector.mjs: "ralph", "autopilot", "team", "ultrawork" 등 매직 키워드 감지
   → 감지 시 해당 스킬 내용을 additionalContext로 주입 (스킬 강제 활성화)
6. skill-injector.mjs: 컨텍스트 기반 스킬 주입
   ↓
7. Claude 모델이 주입된 스킬을 읽고 실행
   ↓
8. 도구 사용마다 Pre/PostToolUse 훅이 개입 (강제·검증)
9. 서브에이전트 생성/종료마다 SubagentStart/Stop 훅이 추적
   ↓
10. Stop / SessionEnd: 상태 저장, 메모리 업데이트, 후처리
```

**결론: OMC의 인터셉션 레이어는 에이전트 생명주기 전체를 감시한다. Superpowers가 "시작 시 규칙 주입"에 그친다면, OMC는 모든 이벤트를 프로그래밍 방식으로 제어한다.**

### oh-my-bridge에의 적용

이 인터셉션 레이어 패턴은 **[Part 5. Oh My Bridge](/posts/oh-my-bridge)**에서 플러그인 범위에 맞게 축소 채용되었다. 인터셉션 지점을 `PostToolUse` 하나로 좁히고, 매처(`mcp__plugin_oh-my-bridge_codex__.*`)로 Codex MCP 호출만 선별한다.

채용된 핵심 메커니즘은 **`additionalContext` 주입**이다. OMC의 훅 스크립트들이 stdout으로 `additionalContext`를 출력해 Claude에게 컨텍스트를 주입하듯이, oh-my-bridge의 `codex-fallback.sh`는 Codex 장애 감지 시 `additionalContext`를 출력해 Claude가 fallback 전환을 결정하도록 유도한다. 훅이 직접 동작을 실행하는 것이 아니라 컨텍스트를 주입하고 판단은 Claude에게 위임하는 구조다.

---

## 3. 에이전트 시스템 (21개)

OMC의 에이전트는 역할별로 명확히 분리되어 있으며, `model` 헤더로 기본 모델을 고정한다.

### 에이전트 카탈로그

| 카테고리 | 에이전트 | 모델 | 역할 |
|----------|----------|------|------|
| **전략** | `planner` | Opus | 인터뷰 → 요구사항 수집 → `.omc/plans/*.md` 생성 |
| | `analyst` | Opus | 요구사항 갭 분석 |
| | `architect` | Opus | 코드 분석·아키텍처 조언 (READ-ONLY, Write/Edit 차단) |
| | `critic` | Opus | 플랜 검토·비판 |
| **구현** | `executor-high` | Opus | 복잡한 구현 |
| | `executor` | Sonnet | 표준 구현 |
| | `executor-low` | Haiku | 단순 작업 |
| | `deep-executor` | Opus | 자율 딥워커 (탐색→계획→구현→검증 전 과정) |
| | `build-fixer` | Sonnet | 빌드 오류 수정 |
| **탐색** | `explore` | Sonnet | 코드베이스 탐색 (READ-ONLY) |
| | `document-specialist` | Sonnet | 문서·외부 지식 탐색 |
| **검토** | `code-reviewer` | Opus | 코드 품질 리뷰 |
| | `security-reviewer` | Opus | 보안 취약점 검토 |
| | `quality-reviewer` | Sonnet | 코드 품질 검토 |
| | `verifier` | Sonnet | 구현 결과 검증 |
| | `qa-tester` | Sonnet | QA 테스트 |
| **전문** | `designer` | Sonnet | UI/UX 설계 |
| | `writer` | Sonnet | 문서 작성 |
| | `debugger` | Opus | 버그 디버깅 |
| | `scientist` | Opus | 연구·분석 |
| | `git-master` | Sonnet | Git 작업 |

### 에이전트 티어 시스템

OMC는 복잡도에 따라 에이전트를 3단계로 라우팅한다:

```
LOW  (Haiku)   → executor-low     : "Add type export for UserConfig"
MEDIUM (Sonnet) → executor         : "Add error handling to this module"
HIGH  (Opus)   → executor-high    : "Debug this race condition"
```

이 라우팅은 `src/features/model-routing/` 모듈이 담당한다. 어휘 신호(키워드), 구조 신호(파일 수·의존성), 컨텍스트 신호를 종합해 LOW/MEDIUM/HIGH 복잡도를 판단하고 해당 모델로 자동 분배한다.

---

## 4. 스킬 시스템 (38개)

### 스킬 파일 구조

각 스킬은 `skills/스킬명/SKILL.md` 형식. YAML 프론트매터 + 마크다운 본문:

```yaml
---
name: ralph
description: Self-referential loop until task completion with architect verification
---
```

### 핵심 스킬 계층 구조

OMC의 스킬들은 **계층적으로 합성**된다. 상위 스킬이 하위 스킬을 포함하는 구조:

```
autopilot (아이디어 → 완성 코드)
  └─ ralph (퍼시스턴스 루프 + architect 검증)
       └─ ultrawork (병렬 실행 엔진)
            └─ executor-{low,medium,high} (실제 구현 에이전트)
```

| 스킬 | 역할 | 핵심 특징 |
|------|------|-----------|
| `autopilot` | 아이디어 → 완성 코드 전 과정 | 6단계 파이프라인 (확장→계획→실행→QA→검증→정리) |
| `ralph` | 완료 보장 퍼시스턴스 루프 | 실패 시 재시도 + architect 서명 필수 |
| `ultrawork` | 병렬 실행 엔진 | 독립 태스크 동시 실행, 모델 티어 라우팅 |
| `team` | N개 에이전트 협업 | `team-plan→prd→exec→verify→fix` 스테이지 파이프라인 |
| `deep-executor` | 단일 에이전트 딥워커 | 탐색 우선, 패턴 발견, 검증 증거 필수 |
| `plan` | 인터뷰 기반 계획 수립 | planner 에이전트가 인터뷰 후 `.omc/plans/` 저장 |
| `ralplan` | 반복적 계획 + 컨센서스 | ralph + plan 합성 |
| `tdd` | 테스트 주도 개발 | RED-GREEN-REFACTOR 강제 |
| `omc-teams` | tmux CLI 워커 | Codex/Gemini CLI를 tmux 분할 창에서 실행 |
| `ccg` | 3모델 병렬 오케스트레이션 | Claude + Codex + Gemini 동시 실행 |

### 매직 키워드 자동 활성화

`keyword-detector.mjs`가 사용자 프롬프트에서 키워드를 감지하면 해당 스킬을 자동 주입한다:

| 키워드 | 활성화되는 스킬 |
|--------|----------------|
| `ralph`, `don't stop`, `must complete` | ralph (퍼시스턴스 루프) |
| `autopilot`, `build me`, `full auto` | autopilot (전체 파이프라인) |
| `team`, `swarm` | team (다중 에이전트) |
| `ultrawork`, `ulw` | ultrawork (병렬 실행) |
| `ultrathink`, `think` | think-mode (확장 추론) |
| `plan` | plan (인터뷰 계획) |
| `tdd` | tdd (테스트 주도) |

Superpowers가 `using-superpowers` 스킬의 "1%라도 관련 있으면 호출하라"는 확률적 강제에 의존하는 반면, **OMC는 키워드 정규식 매칭으로 프로그래밍 방식의 결정론적 강제**를 구현한다.

---

## 5. 모델 라우팅 시스템

`src/features/model-routing/` — 순수 코드 기반 모델 선택 로직.

### 복잡도 신호 3계층

```
LexicalSignals (어휘)
  - wordCount, filePathCount, codeBlockCount
  - hasArchitectureKeywords, hasDebuggingKeywords, hasRiskKeywords
  - questionDepth: 'why' > 'how' > 'what' > 'where'

StructuralSignals (구조)
  - estimatedSubtasks, crossFileDependencies
  - hasTestRequirements
  - domainSpecificity: generic | frontend | backend | infrastructure | security
  - impactScope: local | module | system-wide

ContextSignals (컨텍스트)
  - 세션 상태, 이전 실패 여부 등
```

### 티어 → 모델 매핑

```typescript
LOW    → claude-haiku-4-5-20251001   // 환경변수 OMC_MODEL_LOW로 오버라이드 가능
MEDIUM → claude-sonnet-4-6           // 환경변수 OMC_MODEL_MEDIUM
HIGH   → claude-opus-4-6             // 환경변수 OMC_MODEL_HIGH
```

모델은 환경변수로 완전히 교체 가능하다. 예를 들어 `OMC_MODEL_HIGH=gpt-5`로 설정하면 Opus 자리에 외부 모델을 배치할 수 있다.

---

## 6. 프로젝트 메모리 시스템

`src/hooks/project-memory/` — 세션 간 학습 지속 메커니즘.

세 훅 이벤트에 걸쳐 작동한다:

```
SessionStart  → project-memory-session.mjs    : 메모리 로드 → 컨텍스트 주입
PostToolUse   → project-memory-posttool.mjs   : 도구 결과에서 학습 추출
PreCompact    → project-memory-precompact.mjs : 압축 전 중요 내용 메모리에 저장
```

저장 위치: `.omc/memory/` (프로젝트별) 또는 `~/.claude/omc/memory/` (글로벌)

이 메커니즘은 **[Inside oh-my-opencode — Wisdom Accumulation 패턴](/posts/inside-oh-my-opencode)**에 직접 대응한다. OMC에서는 Node.js 스크립트로 구현되어 있고, 학습 전파가 훅 수준에서 자동으로 일어난다.

---

## 7. autopilot 심층 분석

autopilot은 OMC에서 가장 복잡한 스킬이다. "2-3줄 아이디어 → 검증된 완성 코드"를 목표로 한다.

### 6단계 파이프라인

```
Phase 0 — 확장 (Expansion)
  Analyst (Opus): 요구사항 추출
  Architect (Opus): 기술 스펙 작성
  → .omc/autopilot/spec.md

Phase 1 — 계획 (Planning)
  Architect (Opus): 구현 계획 생성
  Critic (Opus): 계획 검증
  → .omc/plans/autopilot-impl.md

Phase 2 — 실행 (Execution) [병렬]
  Executor-low (Haiku): 단순 태스크
  Executor (Sonnet): 표준 태스크
  Executor-high (Opus): 복잡 태스크
  (ralph + ultrawork 방식으로 실행)

Phase 3 — QA (최대 5사이클)
  빌드 → 린트 → 테스트 → 실패 수정 반복
  동일 오류 3회 반복 시 중단 (근본 문제 보고)

Phase 4 — 검증 (Validation) [병렬]
  Architect: 기능 완전성
  Security-reviewer: 취약점 검사
  Code-reviewer: 품질 검토
  → 3명 모두 승인 필수 (실패 시 수정 후 재검증)

Phase 5 — 정리 (Cleanup)
  상태 파일 삭제 (.omc/state/*.json)
  /cancel로 클린 종료
```

### 상태 지속성

각 단계는 `.omc/state/` 에 JSON 파일을 기록한다. 중단 후 재실행하면 중단 지점부터 재개된다.

---

## 8. team 스킬 심층 분석

v4.1.7부터 OMC의 핵심 오케스트레이션 표면. `swarm`, `ultrapilot`은 내부적으로 team으로 라우팅된다.

### 스테이지 파이프라인

```
team-plan → team-prd → team-exec → team-verify → team-fix (루프)
```

### tmux CLI 워커 (v4.4.0+)

v4.4.0에서 Codex/Gemini MCP 서버를 제거하고, tmux 분할 창에서 실제 CLI 프로세스를 실행하는 방식으로 전환했다:

```bash
/omc-teams 2:codex   "review auth module"   # Codex CLI를 2개 tmux 창에서 실행
/omc-teams 2:gemini  "redesign UI components" # Gemini CLI를 2개 tmux 창에서 실행
/ccg "Review this PR"                        # Claude + Codex + Gemini 동시 실행
```

워커는 태스크 완료 시 즉시 종료된다 (idle 리소스 없음). `codex` / `gemini` CLI가 설치되어 있고 tmux 세션이 활성 상태여야 한다.

---

## 9. Superpowers와의 비교

| 영역 | Superpowers | oh-my-claudecode |
|------|-------------|-----------------|
| 규모 | 마크다운 14개 + JS 유틸리티 | 592개 TS 파일, 145k LOC |
| 에이전트 | 1개 (code-reviewer) | 21개 전문 에이전트 |
| 스킬 | 14개 | 38개 |
| 훅 이벤트 | 1개 (SessionStart) | 10개, 핸들러 21개 |
| 모델 라우팅 | 없음 (사용자 위임) | 3단계 복잡도 자동 분류 (LOW/MEDIUM/HIGH) |
| 스킬 활성화 | 마크다운 규칙 (확률적) | 키워드 정규식 (결정론적) |
| 퍼시스턴스 | 없음 | ralph 루프 + 상태 파일 (.omc/state/) |
| 프로젝트 메모리 | 없음 | 3단계 훅 기반 자동 학습 |
| 외부 모델 | 없음 | tmux CLI (Codex, Gemini) |
| 강제 수단 | 마크다운 규칙 (Claude가 따르길 기대) | Node.js 스크립트 (시스템 수준 강제) |

### OMC의 상대적 강점

1. **완료 보장**: ralph 루프가 실패 시 재시도하고 architect 검증을 요구한다. "완료했다고 주장"이 아니라 "검증 증거 제출"을 강제한다.
2. **결정론적 워크플로우**: 키워드 → 스킬 매핑이 확실하다.
3. **멀티모델 오케스트레이션**: Codex, Gemini와의 tmux CLI 통합이 내장되어 있다.
4. **상태 지속성**: 세션이 끊겨도 `.omc/state/`에서 재개 가능하다.

### Superpowers의 상대적 강점

1. **투명성**: 모든 행동 규칙이 마크다운에 있다. OMC는 145k LOC TS 코드를 읽어야 내부 동작을 파악할 수 있다.
2. **Claude Code 네이티브**: 별도 런타임 없이 플러그인 마켓플레이스에서 설치된다.
3. **커스터마이징 용이성**: 개인 스킬(`~/.claude/skills/`)로 원본을 건드리지 않고 확장한다.
4. **경량**: 추가 컨텍스트 윈도우 소비 없이 마크다운 규칙만 사용한다.

---

## 시리즈

- **[Part 1. Oh My Bridge: Claude Code 멀티 LLM 오케스트레이션 전략](/posts/claude-code-multi-llm-orchestration)** — oh-my-bridge 배경, 대안 탐색, 전체 구조
- **[Part 2. Inside Superpowers](/posts/inside-superpowers)** — 스킬 시스템 동작 원리, SubAgent 패턴 상세
- **[Part 3. Inside Oh My Opencode](/posts/inside-oh-my-opencode)** — 설계 패턴 레퍼런스, 멀티 에이전트 오케스트레이션, 도구 혁신
- **[Part 4. Inside Oh My Claudecode](/posts/inside-oh-my-claudecode)** — 훅 기반 인터셉션, 에이전트 티어, autopilot 파이프라인
- **[Part 5. Oh My Bridge: 플러그인 구성과 작동 방식](/posts/oh-my-bridge)** — 플러그인 구성과 작동 방식
