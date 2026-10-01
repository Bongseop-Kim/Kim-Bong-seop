---
author: Kim Bong-seop
pubDatetime: 2026-02-28T01:00:00Z
title: "Part 2. Inside Superpowers"
slug: inside-superpowers
featured: false
draft: false
tags:
  - claude-code
  - superpowers
  - llm
  - workflow
description: Superpowers의 프로젝트 구조, 동작 원리, 스킬 시스템을 실제 소스코드 기반으로 정리한다.
---

> 소스: [github.com/obra/superpowers](https://github.com/obra/superpowers) (v4.3.1, MIT License)

이 글은 oh-my-bridge 프레임워크 선택 근거를 뒷받침하는 기술 분석이다. Superpowers의 프로젝트 구조, 동작 원리, 스킬 시스템을 실제 소스코드 기반으로 정리한다.

---

## 1. 전체 프로젝트 구조

```
obra/superpowers/
├─ .claude-plugin/      ← Claude Code 플러그인 등록 정보
│   ├─ plugin.json      ← 이름, 버전, 키워드 정의
│   └─ marketplace.json ← 마켓플레이스 메타데이터
├─ skills/              ← 스킬 라이브러리 (14개, 마크다운)
├─ commands/            ← 슬래시 명령어 (3개, 마크다운)
├─ agents/              ← 에이전트 프롬프트 (1개, 마크다운)
├─ hooks/               ← 세션 시작 훅 (bash + JSON)
├─ lib/                 ← 스킬 유틸리티 (JS)
├─ tests/               ← 테스트
└─ docs/                ← 문서
```

> [.claude-plugin/plugin.json](https://github.com/obra/superpowers/blob/main/.claude-plugin/plugin.json) — 플러그인 정의 파일

---

## 2. 동작 원리: 마크다운 + JS 인프라

Superpowers의 구조를 정확히 이해하려면 **마크다운 스킬 문서**와 **JS/bash 인프라**를 구분해야 한다.

### 마크다운 — 행동 규칙 (what to do)

- `skills/*/SKILL.md` — 14개 스킬 정의 (워크플로우, 트리거 조건, 절차)
- `commands/*.md` — 3개 슬래시 명령어
- `agents/code-reviewer.md` — 코드 리뷰 에이전트 프롬프트

### JS/bash — 인프라 (how to load)

- [`hooks/session-start`](https://github.com/obra/superpowers/blob/main/hooks/session-start) — 세션 시작 시 `using-superpowers/SKILL.md` 내용을 읽어 `<EXTREMELY_IMPORTANT>` 태그로 감싼 뒤 Claude의 `additionalContext`로 주입하는 bash 스크립트
- [`hooks/hooks.json`](https://github.com/obra/superpowers/blob/main/hooks/hooks.json) — 세션 이벤트(startup/resume/clear/compact)에 session-start 훅을 바인딩
- [`lib/skills-core.js`](https://github.com/obra/superpowers/blob/main/lib/skills-core.js) — 스킬 파일 검색, YAML 프론트매터 파싱, 스킬 이름→경로 매핑, 업데이트 확인 유틸리티 (순수 ESM 모듈)

### 동작 흐름

```
1. 세션 시작 (startup/resume/clear/compact)
   ↓
2. hooks.json이 session-start 스크립트를 동기 실행
   ↓
3. session-start가 using-superpowers/SKILL.md를 읽어
   <EXTREMELY_IMPORTANT> 태그로 감싸서 additionalContext에 주입
   ↓
4. Claude 모델이 주입된 using-superpowers 규칙을 컨텍스트에서 읽음
   → "1%라도 관련 스킬이 있으면 반드시 Skill 도구로 호출하라"
   ↓
5. 이후 작업마다 Claude가 Skill 도구로 관련 스킬을 호출
   → skills-core.js가 스킬 파일을 찾아 내용을 반환
   → Claude가 스킬 내용(마크다운)을 읽고 따름
```

**결론: Superpowers의 행동 규칙은 전부 마크다운에 있고, JS/bash는 그 마크다운을 Claude 컨텍스트에 전달하는 인프라다. 스킬을 해석하고 따르는 주체는 Claude Code 세션의 모델이다.**

> 근거:
> - `session-start` 스크립트 원문: `using-superpowers` 내용을 `additionalContext`로 JSON 출력 ([원문](https://github.com/obra/superpowers/blob/main/hooks/session-start))
> - `skills-core.js` 원문: `extractFrontmatter()`, `findSkillsInDir()`, `resolveSkillPath()`, `stripFrontmatter()` 등 파일 I/O 유틸리티만 포함, 행동 로직 없음 ([원문](https://github.com/obra/superpowers/blob/main/lib/skills-core.js))

---

## 3. 스킬 시스템

### 스킬 파일 형식

각 스킬은 `skills/스킬명/SKILL.md` 구조이며, YAML 프론트매터 + 마크다운 본문으로 구성:

```yaml
---
name: skill-name
description: Use when [트리거 조건]
---
```

> [skills/ 디렉토리](https://github.com/obra/superpowers/tree/main/skills)

### 강제 호출 메커니즘

`using-superpowers` 스킬([원문](https://github.com/obra/superpowers/blob/main/skills/using-superpowers/SKILL.md))이 모든 대화 시작 시 관련 스킬을 **강제 호출**한다:

> *"If you think there is even a 1% chance a skill might apply to what you are doing, you ABSOLUTELY MUST invoke the skill."*

스킬 호출은 Claude Code의 Skill 도구를 통해 이루어지며, 파일을 직접 Read하지 않고 Skill 도구로 로딩하는 것이 규칙이다.

### 기존 스킬 라이브러리 (14개)

| 카테고리 | 스킬 | 역할 | 링크 |
|----------|------|------|------|
| **협업** | brainstorming | 코드 작성 전 설계 검증, 소크라틱 질의 | [원문](https://github.com/obra/superpowers/tree/main/skills/brainstorming) |
| | writing-plans | 2분부터 5분 단위 태스크로 분해한 구현 계획 | [원문](https://github.com/obra/superpowers/tree/main/skills/writing-plans) |
| | executing-plans | 배치 실행 + 체크포인트 | [원문](https://github.com/obra/superpowers/tree/main/skills/executing-plans) |
| | dispatching-parallel-agents | 독립 태스크 병렬 서브에이전트 디스패치 | [원문](https://github.com/obra/superpowers/tree/main/skills/dispatching-parallel-agents) |
| | subagent-driven-development | 태스크별 서브에이전트 + 2단계 리뷰 | [원문](https://github.com/obra/superpowers/tree/main/skills/subagent-driven-development) |
| | requesting-code-review | 코드 리뷰 체크리스트 | [원문](https://github.com/obra/superpowers/tree/main/skills/requesting-code-review) |
| | receiving-code-review | 리뷰 피드백 대응 | [원문](https://github.com/obra/superpowers/tree/main/skills/receiving-code-review) |
| **테스트** | test-driven-development | RED-GREEN-REFACTOR 강제 | [원문](https://github.com/obra/superpowers/tree/main/skills/test-driven-development) |
| **디버깅** | systematic-debugging | 4단계 근본원인 추적 | [원문](https://github.com/obra/superpowers/tree/main/skills/systematic-debugging) |
| | verification-before-completion | 수정 완료 전 실제 검증 | [원문](https://github.com/obra/superpowers/tree/main/skills/verification-before-completion) |
| **Git** | using-git-worktrees | 격리 워크스페이스 생성 | [원문](https://github.com/obra/superpowers/tree/main/skills/using-git-worktrees) |
| | finishing-a-development-branch | merge/PR 결정 워크플로우 | [원문](https://github.com/obra/superpowers/tree/main/skills/finishing-a-development-branch) |
| **메타** | using-superpowers | 스킬 시스템 사용 규칙 (강제 호출) | [원문](https://github.com/obra/superpowers/blob/main/skills/using-superpowers/SKILL.md) |
| | writing-skills | 새 스킬 작성 가이드 (TDD 적용) | [원문](https://github.com/obra/superpowers/blob/main/skills/writing-skills/SKILL.md) |

---

## 4. 세션 훅: 스킬 주입 메커니즘

[hooks/hooks.json](https://github.com/obra/superpowers/blob/main/hooks/hooks.json)이 세션 이벤트에 [session-start](https://github.com/obra/superpowers/blob/main/hooks/session-start) 스크립트를 바인딩한다.

`session-start` 스크립트가 하는 일:
1. `using-superpowers/SKILL.md` 파일을 읽는다
2. 내용을 `<EXTREMELY_IMPORTANT>` 태그로 감싼다
3. JSON 형태로 `additionalContext`에 출력한다
4. Claude Code가 이 컨텍스트를 세션에 주입한다

이것이 **Superpowers 전체 시스템의 진입점**이다. 이후 Claude가 `using-superpowers` 규칙에 따라 관련 스킬을 Skill 도구로 호출하면서 나머지 스킬들이 활성화된다.

---

## 5. 스킬 코어 로직

[lib/skills-core.js](https://github.com/obra/superpowers/blob/main/lib/skills-core.js) — 순수 ESM 유틸리티 모듈. 행동 로직 없이 파일 I/O만 담당:

| 함수 | 기능 |
|------|------|
| `extractFrontmatter()` | SKILL.md에서 YAML name/description 파싱 |
| `findSkillsInDir()` | 디렉토리에서 SKILL.md 파일 재귀 검색 (maxDepth 3) |
| `resolveSkillPath()` | 스킬 이름 → 파일 경로 매핑. 개인 스킬(`~/.claude/skills/`)이 superpowers 스킬을 오버라이드 |
| `checkForUpdates()` | git fetch로 업데이트 확인 (3초 타임아웃) |
| `stripFrontmatter()` | 프론트매터 제거 후 본문만 반환 |

---

## 6. subagent-driven-development 심층 분석

이 스킬이 **[Part 1](/posts/claude-code-multi-llm-orchestration)**에서 설계한 `codex-generator` SubAgent 기반 워크플로우 변형에 가장 직접적으로 참고된다.

> [skills/subagent-driven-development/](https://github.com/obra/superpowers/tree/main/skills/subagent-driven-development)

### 디렉토리 구성 (4개 파일)

| 파일 | 역할 | 링크 |
|------|------|------|
| SKILL.md | 워크플로우 전체 정의 | [원문](https://github.com/obra/superpowers/blob/main/skills/subagent-driven-development/SKILL.md) |
| implementer-prompt.md | 구현 서브에이전트 프롬프트 템플릿 | [원문](https://github.com/obra/superpowers/blob/main/skills/subagent-driven-development/implementer-prompt.md) |
| spec-reviewer-prompt.md | 스펙 준수 리뷰어 프롬프트 | [원문](https://github.com/obra/superpowers/blob/main/skills/subagent-driven-development/spec-reviewer-prompt.md) |
| code-quality-reviewer-prompt.md | 코드 품질 리뷰어 프롬프트 | [원문](https://github.com/obra/superpowers/blob/main/skills/subagent-driven-development/code-quality-reviewer-prompt.md) |

### 워크플로우

```
Plan 읽기 → 태스크 추출 → TodoWrite 생성
  → 태스크마다:
    1. Implementer 서브에이전트 디스패치 (implementer-prompt.md)
       → 질문이 있으면 답변 후 재디스패치
       → 구현 + 테스트 + 커밋 + 셀프리뷰
    2. Spec Reviewer 디스패치 (spec-reviewer-prompt.md)
       → 실패 시 Implementer가 수정 → 다시 Spec Review
    3. Code Quality Reviewer 디스패치 (code-quality-reviewer-prompt.md)
       → 실패 시 Implementer가 수정 → 다시 Quality Review
    4. 태스크 완료 마킹
  → 전체 완료 후 최종 코드 리뷰 디스패치
  → finishing-a-development-branch 스킬로 이동
```

### codex-generator SubAgent와의 연결점

Superpowers는 이미 "서브에이전트에게 태스크 위임 → 2단계 리뷰 → fix 루프" 패턴을 가지고 있다. `codex-generator` SubAgent는 이 패턴에서 **Implementer 서브에이전트(Claude) 대신 GPT-5.3-codex를 호출**하는 변형이다.

---

## 7. 커스텀 스킬 추가 방식

[writing-skills](https://github.com/obra/superpowers/blob/main/skills/writing-skills/SKILL.md) 스킬에 따르면:

- 개인 스킬은 `~/.claude/skills/` 에 배치 (Claude Code 기준)
- `skills-core.js`의 `resolveSkillPath()`가 개인 스킬을 superpowers 스킬보다 우선 매칭한다 ([원문](https://github.com/obra/superpowers/blob/main/lib/skills-core.js))
- SKILL.md 하나가 핵심 (프론트매터 name + description + 본문)
- description은 "Use when..."으로 시작, 트리거 조건만 기술 (워크플로우 요약 금지)
- **스킬 작성 자체도 TDD 적용**: 스킬 없이 에이전트가 실패하는 시나리오를 먼저 관찰 → 스킬 작성 → 검증
- 프론트매터 name + description 합계 최대 1024자
- 필요시 보조 파일(프롬프트 템플릿, 스크립트 등) 추가 가능

### 개인 스킬 우선 매칭을 활용한 오버라이드 패턴

이 우선 매칭 구조는 **Superpowers를 수정하지 않고 행동을 확장하는 핵심 메커니즘**이다.

**중요: `resolveSkillPath()`는 디렉토리 이름의 정확한 일치(exact match)로 동작한다.** 소스 분석 결과, 이 함수는 `path.join(personalDir, skillName)`으로 경로를 직접 조합하며, YAML 프론트매터의 `name` 필드는 메타데이터 표시용일 뿐 매칭에 사용되지 않는다. 따라서 오버라이드를 하려면 **반드시 원본과 동일한 디렉토리 이름**을 사용해야 한다.

예를 들어 멀티 LLM 전략에서 Implementer를 외부 모델(GPT)로 교체하려면, `~/.claude/skills/subagent-driven-development/SKILL.md`를 배치한다. 원본과 동일한 디렉토리 이름이므로 `resolveSkillPath()`가 개인 스킬을 먼저 반환하고, Superpowers 원본은 그대로 유지되면서 행동만 바뀐다.

```
~/.claude/skills/subagent-driven-development/SKILL.md     ← 동일 이름, 우선 매칭됨
superpowers/skills/subagent-driven-development/SKILL.md   ← 원본 유지, 무시됨
```

> **다른 이름(예: `codex-subagent-development`)을 사용하면 오버라이드가 아닌 별도 스킬로 등록된다.** 이 경우 원본과 커스텀 스킬이 공존하며, Claude가 어느 스킬을 호출할지는 description 기반 판단에 의존하므로 비결정적이다.

> **보조 파일 경로 주의:** 원본 `subagent-driven-development`는 `implementer-prompt.md`, `spec-reviewer-prompt.md` 등 보조 파일을 포함한다. 개인 스킬로 오버라이드할 때 SKILL.md 본문의 상대 경로는 개인 스킬 디렉토리 기준으로 해석되므로, 변형이 필요한 보조 파일은 개인 스킬 디렉토리에 복사 후 수정한다. 이 경로 해석 동작은 구현 시(Phase 3) 실제 테스트로 확정한다.

이 패턴의 장점은 Superpowers 업데이트가 개인 스킬과 충돌하지 않으며, 개인 스킬을 삭제하면 즉시 Superpowers 원본 동작으로 복귀한다는 것이다.

---

## 8. Superpowers에 모델 선택 스킬이 없다

[github.com/obra/superpowers](https://github.com/obra/superpowers) repo 전체를 `model` 키워드로 검색한 결과([검색 결과](https://github.com/search?q=repo%3Aobra%2Fsuperpowers+model&type=code)), **어떤 모델을 사용하라는 스킬이나 가이드는 존재하지 않는다.**

모델 관련 설정은 딱 2가지뿐이다:

| 설정 | 위치 | 의미 |
|------|------|------|
| `model: inherit` | `agents/code-reviewer.md` | 부모 세션의 모델을 그대로 상속 |
| `disable-model-invocation: true` | `commands/*.md` | 슬래시 명령어의 모델 자동 호출 금지 |

이는 **Superpowers가 모델 선택을 전적으로 사용자에게 위임**한다는 뜻이다. 어떤 모델로 실행하든 스킬 내용은 동일하게 주입되며, 그 내용을 해석하고 따르는 주체는 사용자가 선택한 모델이다.

Superpowers의 스킬 규칙은 어떤 모델에서도 동일하게 동작하므로, 설계·계획에는 Opus를, 코드 수정에는 Sonnet을 자동 배분하는 opusplan을 얹어도 Superpowers가 이를 방해하지 않는다.

---

## 시리즈

- **[Part 1. Oh My Bridge: Claude Code 멀티 LLM 오케스트레이션 전략](/posts/claude-code-multi-llm-orchestration)** — oh-my-bridge 배경, 대안 탐색, 전체 구조
- **[Part 2. Inside Superpowers](/posts/inside-superpowers)** — 스킬 시스템 동작 원리, SubAgent 패턴 상세
- **[Part 3. Inside Oh My Opencode](/posts/inside-oh-my-opencode)** — 설계 패턴 레퍼런스, 멀티 에이전트 오케스트레이션, 도구 혁신
- **[Part 4. Inside Oh My Claudecode](/posts/inside-oh-my-claudecode)** — 훅 기반 인터셉션, 에이전트 티어, autopilot 파이프라인
- **[Part 5. Oh My Bridge: 플러그인 구성과 작동 방식](/posts/oh-my-bridge)** — Skill 기반 라우팅, MCP + SubAgent 구성, 안정성 설계
