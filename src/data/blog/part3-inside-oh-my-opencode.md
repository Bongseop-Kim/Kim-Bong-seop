---
author: Kim Bong-seop
pubDatetime: 2026-02-28T02:00:00Z
title: "Part 3. Inside oh-my-opencode"
slug: inside-oh-my-opencode
featured: false
draft: false
tags:
  - claude-code
  - llm
  - multi-agent
  - workflow
description: oh-my-opencode의 아키텍처, 에이전트 시스템, 도구 설계를 소스코드 기반으로 분석한다. 직접 사용하지 않지만 설계 패턴의 참고 가치가 높은 레퍼런스 아키텍처다.
---

> 소스: [github.com/code-yeongyu/oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) (dev 브랜치, SUL-1.0 License)

이 글은 oh-my-opencode(이하 OmO)의 아키텍처, 에이전트 시스템, 도구 설계를 소스코드 기반으로 분석한다. oh-my-bridge에서 직접 사용하지 않기로 한 프레임워크지만, 설계 패턴의 참고 가치가 높아 별도 문서로 정리한다.

OmO는 **OpenCode**(Claude Code의 오픈소스 포크) 플러그인이다. Claude Code에서 직접 사용할 수 없다는 플랫폼 제약이 있지만, 멀티 에이전트 오케스트레이션의 설계 패턴을 가장 공격적으로 실험한 프로젝트이므로, "쓰지 않지만 참고하는" 레퍼런스 아키텍처로 포지셔닝한다.

---

## 1. 프로젝트 개요

TypeScript 기반 모노레포(1,208개 파일, 143k LOC). 단순한 설정 도구가 아닌 본격적인 플러그인 프레임워크다.

| 구성요소 | 내용 |
|----------|------|
| `src/agents/` | 11개 전문 에이전트 (Prometheus 계획, Atlas 오케스트레이터, Sisyphus-Junior 구현, Hephaestus 딥워커 등) |
| `src/hooks/` | 46개 라이프사이클 훅 (3계층: Core·Continuation·Skill) |
| `src/tools/` | 26개 커스텀 도구 (Hashline 해시 기반 편집기 포함) |
| `oh-my-opencode.jsonc` | Zod v4 스키마 기반 설정 (에이전트별 모델, 카테고리, fallback chain 정의) |

---

## 2. 하네스 문제(The Harness Problem) — 혁신적 도구 설계

OmO가 해결한 가장 독창적인 문제다. 대부분의 에이전트 실패 원인이 모델 능력이 아니라 **편집 도구의 한계**라는 통찰에서 출발한다.

### 문제

기존 편집 도구는 모델에게 "수정할 줄의 원문을 정확히 재현하라"고 요구한다. 공백, 들여쓰기, 유니코드까지 완벽히 일치해야 한다. 파일이 대화 중간에 변경되면 모델이 가진 줄 정보가 stale해져서 엉뚱한 위치를 수정한다.

### 해법: Hashline (해시 기반 편집)

모든 줄에 콘텐츠 해시 태그를 붙여서 읽기를 제공한다:

```
11#VK| function hello() {
22#XJ|   return "world";
33#MB| }
```

에이전트가 편집 시 이 `LINE#ID`를 참조한다. 마지막 읽기 이후 파일이 변경되었으면 해시가 불일치하여 편집이 거부된다. 원문을 재현할 필요 없이 해시 참조만으로 정확한 위치를 특정한다.

**결과:** Grok Code Fast 1 기준 편집 성공률 **6.7% → 68.3%**. 편집 도구 하나만 바꾼 결과다.

> 원문: [Can Bölük, The Harness Problem](https://blog.can.ac/2026/02/12/the-harness-problem/)
> 구현 영감: [oh-my-pi](https://github.com/can1357/oh-my-pi)

### 우리 전략과의 연결

Hashline은 OmO의 기능 중 가장 혁신적인 것이지만, 이번 프로젝트(oh-my-bridge)에는 적용하지 못했다.

| 기능 | oh-my-opencode | Claude Code |
|------|----------------|-------------|
| Read 출력 자동 변환 | Hook 시스템으로 가능 | 불가 (Read 툴 가로채기 없음) |
| 커스텀 편집 툴 | 자체 툴로 구현 | MCP 서버로 가능 |
| 해시 기반 검증 | 내장 | MCP 서버에서 구현 가능 |

[MCP 서버](https://code.claude.com/docs/en/mcp)로 `hashline_read`와 `hashline_edit` 두 도구를 만들면 부분 구현은 가능하다. 하지만 OmO처럼 완전히 자동화하려면 **Read 툴 출력을 프레임워크 레벨에서 가로채는 Hook**이 필요하다. Claude Code [플러그인](https://code.claude.com/docs/en/plugins)은 skills, agents, hooks, MCP 서버, LSP 서버를 제공할 수 있지만, 내장 도구의 출력을 가로채는 기능은 없다. 결국 CLAUDE.md에 "항상 hashline_read를 써라"고 명시해야 하고, 모델이 실수로 기본 Read를 쓰면 해시 태그가 없는 일반 출력이 나온다. 구현 자체는 가능하지만 OmO 수준의 완성도는 어렵다.

---

## 3. 모델 라우팅과 역할 배분

### OmO의 카테고리 기반 라우팅

OmO의 모델 선택은 태스크의 **카테고리**를 기반으로 동작한다. `oh-my-opencode.jsonc`에서 카테고리별 기본 모델을 설정하면, 에이전트가 태스크를 수행할 때 해당 카테고리의 모델이 자동 선택된다.

```jsonc
{
  "categories": {
    "coding": { "model": "claude-opus-4-6" },
    "analysis": { "model": "gpt-5.2" },
    "deep": { "model": "claude-opus-4-6", "requiresModel": true },
    "artistry": { "model": "gemini-3.1-pro", "requiresModel": true }
  }
}
```

`requiresModel: true`가 설정된 카테고리(deep, artistry)는 해당 모델이 실제로 연결되어 있을 때만 에이전트가 활성화된다. 카테고리 기본값은 Model Resolution Pipeline의 **3단계**에 해당한다.

### 라우팅의 근거: 모델 성격 차이

카테고리별로 다른 모델을 배정하는 이유는 단순한 성능 차이가 아니라 **접근법의 근본적인 차이**에 있다.

| 모델 | 성격 | 프롬프트 스타일 |
|------|------|----------------|
| **Claude** | mechanics-driven | 상세한 체크리스트와 단계별 절차를 명시. "정확히 이 순서대로 하라" |
| **GPT** | principle-driven | 간결한 원칙과 목표만 제시. "이 목적을 달성하라, 방법은 자율" |

OmO의 실제 데이터가 이를 뒷받침한다. Prometheus 에이전트(계획 담당)의 Claude 프롬프트는 **약 1,100줄**인 반면, GPT 프롬프트는 **약 121줄**이다. 동일한 계획 작업을 Claude에게는 세밀한 절차로, GPT에게는 간결한 원칙으로 지시한다.

이 성격 차이로부터 역할 배분이 도출된다:

- **오케스트레이터 → Claude**: 복잡한 멀티스텝 워크플로우를 정확히 따라야 하므로 mechanics-driven 특성이 유리
- **코드 생성 → GPT**: 구체적인 목표를 주고 자율 실행시키는 것이 효율적이므로 principle-driven 특성이 적합

### 우리 전략과의 비교

OmO는 카테고리 → 모델 매핑을 설정 파일 코드로 강제하지만, Claude Code에서는 동일한 방식을 사용할 수 없다. 대신 두 가지 메커니즘으로 모델 라우팅을 구현한다.

- **opusplan** — 설계·계획 단계는 Opus 4.6, 코드 수정·리팩터링 단계는 Sonnet 4.6으로 자동 배분한다. 설정 없이 Claude Code 내장 모드로 동작한다.
- **oh-my-bridge SubAgent** — `codex-generator.md`로 정의된 SubAgent가 코드 생성·테스트 생성 작업을 Codex CLI(GPT-5.3-codex)로 명시적으로 라우팅한다.

OmO의 카테고리 기반 라우팅처럼 런타임에 모델 가용 여부를 검증하거나 fallback chain을 자동으로 탐색하는 기능은 없다. 하지만 opusplan + SubAgent 조합으로 역할별 모델 배분 자체는 명시적으로 달성한다.

모델 성격 차이는 SubAgent 프롬프트 설계에도 직접 반영된다. Claude 에이전트(리뷰어, 아키텍트)에는 상세한 체크리스트와 단계별 절차를 작성하고, GPT 에이전트(codex-generator)에는 간결한 목표와 제약만 제시한다.

---

## 4. 46개 Hook 시스템

OmO의 Hook 시스템은 Superpowers의 session-start 단일 훅과 비교할 수 없는 규모다.

### 3계층 Hook 구조

| 계층 | 수량 | 역할 |
|------|------|------|
| **Core** | 37개 | 세션 라이프사이클, 파일 가드, 규칙 주입 |
| **Continuation** | 7개 | Todo 강제 집행, Ralph Loop 등 작업 연속성 보장 |
| **Skill** | 2개 | 스킬별 동적 훅 |

### 주목할 훅들

**Todo Enforcer (Continuation):** 서브에이전트가 할 일을 남겨두고 응답하려 하면 시스템 리마인더를 주입하여 완료를 강제한다. "모든 todo가 완료될 때까지 응답하지 마라"는 메시지가 삽입된다.

**Comment Checker:** 코드에 AI 생성 특유의 불필요한 주석(slop)이 있으면 감지하고 제거를 강제한다.

**IntentGate:** 모든 메시지에 대해 의도를 먼저 분류한 후 행동을 결정한다. 문자 그대로 오해해서 의도치 않은 작업을 시작하는 문제를 방지한다.

### 우리 전략과의 비교

oh-my-bridge의 Hook 레이어에서 `PostToolUse` Hook으로 비용 로깅과 fallback을 구현한다. OmO의 Todo Enforcer와 IntentGate 패턴은 Hook 레이어에서 추가로 구현할 수 있는 아이디어다.

---

## 5. Model Fallback Chain

OmO의 모든 에이전트는 **다단계 fallback chain**을 가진다. 우선순위 순서대로 모델을 시도하여 사용 가능한 첫 번째 모델을 선택한다.

### 예시

| 에이전트 | Fallback Chain |
|----------|---------------|
| Sisyphus | Claude Opus → Kimi K2.5 → GLM 5 |
| Hephaestus | GPT-5.3 Codex (단일, fallback 없음) |
| Atlas | Kimi K2.5 → Claude Sonnet → GPT-5.2 |
| Explore | Grok Code Fast → MiniMax → Haiku → GPT-5-Nano |
| Librarian | Gemini Flash → MiniMax → GLM |

### FallbackEntry 타입 구조

Fallback chain은 `FallbackEntry[]` 배열로 정의된다. 각 entry는 "이 모델을 제공할 수 있는 프로바이더 목록"과 "모델 ID"를 묶는다.

```typescript
type FallbackEntry = {
  providers: string[]  // 이 모델을 제공하는 프로바이더 목록 (순서대로 시도)
  model: string        // 모델 ID (provider prefix 없음)
  variant?: string     // 이 entry 전용 실행 강도 ("max", "high", "medium" 등)
}

type ModelRequirement = {
  fallbackChain: FallbackEntry[]
  requiresAnyModel?: boolean   // fallbackChain 중 하나라도 가용해야 에이전트 활성화
  requiresModel?: string       // 특정 모델 가용 시에만 활성화 (deep, artistry 카테고리)
  requiresProvider?: string[]  // 특정 프로바이더 연결 시에만 활성화 (hephaestus)
}
```

실제 코드에서 에이전트별 요구사항은 `AGENT_MODEL_REQUIREMENTS` 상수로 정의된다. 예시:

```typescript
// Hephaestus: GPT 전용 딥 워커, GPT 프로바이더 없으면 에이전트 자체가 비활성화
hephaestus: {
  fallbackChain: [
    { providers: ["openai", "venice", "opencode"], model: "gpt-5.3-codex", variant: "medium" },
    { providers: ["github-copilot"],               model: "gpt-5.2",       variant: "medium" },
  ],
  requiresProvider: ["openai", "github-copilot", "venice", "opencode"],
}

// Explore: 속도/비용 우선, 4단계 fallback
explore: {
  fallbackChain: [
    { providers: ["github-copilot"],           model: "grok-code-fast-1" },
    { providers: ["opencode"],                 model: "minimax-m2.5-free" },
    { providers: ["anthropic", "opencode"],    model: "claude-haiku-4-5" },
    { providers: ["opencode"],                 model: "gpt-5-nano" },
  ],
}

// Oracle: GPT 우선이지만 Gemini, Claude로 graceful fallback
oracle: {
  fallbackChain: [
    { providers: ["openai", "github-copilot", "opencode"], model: "gpt-5.2",        variant: "high" },
    { providers: ["google", "github-copilot", "opencode"], model: "gemini-3.1-pro",  variant: "high" },
    { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-opus-4-6", variant: "max" },
  ],
}
```

`requiresProvider`, `requiresModel` 조건이 충족되지 않으면 에이전트가 **비활성화**된다. 이를 통해 "설치된 프로바이더에 따라 에이전트 풀이 달라진다"는 동적 에이전트 구성이 가능하다.

### 동시성 제어

백그라운드 에이전트의 동시 실행을 프로바이더별/모델별로 제한한다:

```jsonc
{
  "background_task": {
    "providerConcurrency": { "anthropic": 3, "openai": 3, "opencode": 10 },
    "modelConcurrency": { "anthropic/claude-opus-4-6": 2, "opencode/gpt-5-nano": 20 }
  }
}
```

### 우리 전략과의 비교

oh-my-bridge에서는 fallback을 "장애 시 Claude SubAgent로 전환"으로 단순화했다. OmO처럼 다단계 fallback + 프로바이더별 동시성 제어를 도입하면 안정성이 더 강화된다. Hook 레이어에서 fallback chain 로직을 구현하거나, 플러그인에 내장할 수 있다.

---

## 6. Model Resolution Pipeline

모델이 어떻게 결정되는지를 6단계 우선순위로 정의한 런타임 파이프라인이다. 가용 모델 목록과 연결된 프로바이더를 실시간으로 확인하면서 높은 우선순위부터 순서대로 시도한다.

```
단계 1: UI Selection       사용자가 UI에서 직접 선택한 모델  (provenance: "override")
단계 2: Config Override    oh-my-opencode.jsonc agents.xxx.model 설정  (provenance: "override")
단계 3: Category Default   categories.xxx.model 설정, fuzzy match 적용  (provenance: "category-default")
단계 4: User Fallback List agents.xxx.fallback_models 목록, 순서대로 시도  (provenance: "provider-fallback")
단계 5: Hardcoded Chain    AGENT_MODEL_REQUIREMENTS의 fallbackChain  (provenance: "provider-fallback")
단계 6: System Default     시스템 기본값  (provenance: "system-default")
```

단계 1부터 2는 가용 모델 목록과 무관하게 즉시 적용된다. 단계 3부터 5는 실제 연결된 프로바이더와 가용 모델 목록을 확인한 뒤 fuzzy match를 시도한다.

### Fuzzy Model Matching

모델 ID를 정규화한 뒤 가용 모델 목록에서 근접 매칭을 사용한다. 설정에 `"anthropic/claude-opus-4-6"` 이 있고 실제로 `"anthropic/claude-opus-4-6-20251101"` 이 가용하면 매칭된다. 모델 ID에 버전 suffix가 붙어도 설정을 수정할 필요가 없다.

### Provenance 추적

| 값 | 의미 |
|----|------|
| `override` | UI 선택 또는 설정 직접 지정 |
| `category-default` | 카테고리 기본값 |
| `provider-fallback` | fallback chain(사용자 정의 또는 hardcoded) |
| `system-default` | 시스템 기본값 |

### 우리 전략과의 비교

oh-my-bridge의 단일 fallback(GPT 실패 시 Claude Sonnet)은 이 파이프라인의 5단계에만 해당한다. provenance 추적 방식을 적용하면 비용 로깅 시 "어떤 경로로 이 모델이 선택됐는지"를 기록할 수 있다.

---

## 시리즈

- **[Part 1. Oh My Bridge: Claude Code 멀티 LLM 오케스트레이션 전략](/posts/claude-code-multi-llm-orchestration)** — oh-my-bridge 배경, 대안 탐색, 전체 구조
- **[Part 2. Inside Superpowers](/posts/inside-superpowers)** — 스킬 시스템 동작 원리, SubAgent 패턴 상세
- **[Part 3. Inside Oh My Opencode](/posts/inside-oh-my-opencode)** — 설계 패턴 레퍼런스, 멀티 에이전트 오케스트레이션, 도구 혁신
- **[Part 4. Inside Oh My Claudecode](/posts/inside-oh-my-claudecode)** — 훅 기반 인터셉션, 에이전트 티어, autopilot 파이프라인
- **[Part 5. Oh My Bridge: 플러그인 구성과 작동 방식](/posts/oh-my-bridge)** — Skill 기반 라우팅, MCP + SubAgent 구성, 안정성 설계
