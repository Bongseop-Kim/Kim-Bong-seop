---
author: Kim Bong-seop
pubDatetime: 2026-02-28T00:00:00Z
title: "Part 1. Oh My Bridge: Claude Code 멀티 LLM 오케스트레이션 전략"
slug: claude-code-multi-llm-orchestration
featured: true
draft: false
tags:
  - claude-code
  - llm
  - workflow
  - mcp
description: Claude Code 안에서 외부 모델(GPT-5.3-codex)을 호출하는 oh-my-bridge의 배경, 대안 탐색, 최종 구조를 정리한다.
---

## oh-my-bridge란

**oh-my-bridge**는 Claude Code 안에서 외부 모델(GPT-5.3-codex 등)을 호출하는 인프라다. Codex CLI MCP 서버 등록, SubAgent 정의, Hook 레이어, 커스텀 스킬 오버라이드를 단계적으로 쌓아, Superpowers 워크플로우를 수정하지 않고 그 위에 모델 라우팅을 얹는 구조다.

한 줄 요약: **Claude가 판단하고, GPT가 생성한다. 그 연결이 oh-my-bridge다.**

> oh-my-bridge의 구현 상세(MCP 등록, SubAgent 정의, Hook 비용 로깅, 안정성 설계)는 **[Part 5. Oh My Bridge — 플러그인 구성과 작동 방식](/posts/oh-my-bridge)**에서 다룬다.
>
> 구현 설계는 **[Part 3. Inside oh-my-opencode](/posts/inside-oh-my-opencode)**(멀티 에이전트 오케스트레이션 패턴), **[Part 4. Inside oh-my-claudecode](/posts/inside-oh-my-claudecode)**(훅 기반 인터셉션·에이전트 티어 설계) 두 프로젝트를 분석·참조하여 작성하였다.

---

## 1. 왜 만들었나

### 기존 워크플로우

특정 LLM에 종속되고 싶지 않다. Claude도 쓰고 GPT도 구독하면서, 각 모델의 강점을 분리 활용해왔다. 기존에는 **oh-my-opencode(OmO)**를 통해 GPT-Pro + Claude-Max를 동시에 사용했다.

### 두 가지 제약

그런데 두 가지 제약이 기존 워크플로우를 막았다.

1. **Anthropic의 서드파티 호출 제한** — Claude가 OAuth를 이용한 서드파티 호출을 제한하기 시작했다. 외부 호출을 금지하고 Claude API를 사용하도록 규정한다. OmO가 OpenCode 내부에서 Claude를 호출하는 구조가 이 정책과 충돌한다.
2. **플랫폼 제약** — OmO는 Claude Code의 오픈소스 포크인 OpenCode의 플러그인이다. Claude Code에서 직접 설치하여 사용할 수 없다.

결과적으로 OmO 기반 워크플로우를 Claude Code 환경에서 그대로 이어갈 방법이 없었다.

### 모델 역할에 대한 판단

제약이 생긴 시점에, 모델 성격에 대한 판단도 내렸다. **오케스트레이터(Brain)로는 GPT보다 Claude Opus 4.6이 더 적합하다**는 것이다.

OmO 분석에 따르면 Claude는 **mechanics-driven**(상세한 체크리스트, 절차를 충실히 따름), GPT는 **principle-driven**(간결한 원칙을 주고 자율에 맡김)이다. 실제로 OmO의 Prometheus 에이전트는 Claude 프롬프트가 약 1,100줄인 반면 GPT 프롬프트는 약 121줄로, 동일한 동작을 완전히 다른 방식으로 달성한다.

- 오케스트레이터는 복잡한 멀티스텝 명령을 정확히 따라야 하므로 → Claude의 mechanics-driven 특성이 유리
- 코드 생성은 목표를 주고 자율 실행시키는 것이 효율적이므로 → GPT의 principle-driven 특성이 적합

(상세: **[Part 3. Inside oh-my-opencode](/posts/inside-oh-my-opencode)**)

이 판단이 전략 전환으로 이어졌다. 서드파티가 LLM을 호출하는 구조는 쓸 수 없고, Claude Opus가 Brain 역할을 맡는 것이 맞다면 → **Claude Code 안에서 GPT를 직접 호출하는 구조**가 필요하다. 이를 구현한 것이 oh-my-bridge다.

---

## 2. 무엇을 검토하고 왜 기각했나

Oh My Bridge를 만들기 전에 한 가지 대안을 검토했다.

### 검토한 대안: OmO 아키텍처를 Claude Code 플러그인으로 재구현

OmO와 Superpowers의 장점을 모두 가져와 통합하는 방향도 고려했다. OmO의 멀티 에이전트 오케스트레이션 패턴(Category 기반 모델 라우팅, Wisdom Accumulation, 3계층 계획 시스템)을 분석해 Claude Code 전용 플러그인으로 포팅하는 것이다.

구조적으로 매력적인 시도지만, 현실적으로 무리한 방향이었다. OmO 전체를 충분히 분석하고 포팅하는 데 드는 비용이 크고, 이후 Superpowers와 OmO가 각자 업데이트될 때마다 커스텀 플러그인에도 그 변경을 반영해야 하는 유지보수 부담이 지속된다.

**기각 이유**: OmO를 전부 분석해서 가져오기에는 부담이 크다. 워크플로우 스킬(계획, 리뷰, 디버깅)이 이미 잘 갖춰진 Superpowers라는 훌륭한 대안이 존재한다.

### 채택: Superpowers + oh-my-bridge

이 대안을 기각한 후 도달한 결론이다.

**oh-my-bridge는 기본적으로 Claude Code에서 외부 모델을 호출하는 플러그인이다.** MCP 서버 등록, SubAgent 정의, Hook 레이어를 조합해 Claude Code 안에서 GPT를 선택적으로 호출하는 구조를 만든다.

여기에 Superpowers가 설치된 경우, oh-my-bridge는 Superpowers의 스킬을 오버라이드하여 함께 작동하도록 설계했다. Superpowers의 `~/.claude/skills/`(개인 스킬)가 Superpowers 번들 스킬보다 우선 매칭되는 메커니즘을 활용해, Superpowers 원본을 수정하지 않고 코드 생성 단계만 GPT로 라우팅한다.

Superpowers를 베이스로 선택한 이유:

- Claude Code 플러그인 마켓플레이스에서 즉시 설치 가능
- 스킬(SKILL.md) 기반 — 마크다운으로 에이전트 행동을 규칙화
- 자동 에이전트 분배 없이 명시적 호출 구조
- **개인 스킬(`~/.claude/skills/`)이 Superpowers 스킬보다 우선 매칭** — 수정 없이 오버라이드 가능

> Superpowers 내부 구조에 대한 상세 분석은 **[Part 2. Inside Superpowers](/posts/inside-superpowers)**에서 다룬다.

> 참고: [claude-delegator](https://github.com/jarrodwatts/claude-delegator)는 Codex CLI의 `mcp-server` 모드로 GPT를 호출하는 플러그인이다. 역할 배분은 다르지만, MCP 서버 등록·Stateless delegation 패턴을 참고했다 (상세: **[Part 5. oh-my-bridge 구현 가이드](/posts/oh-my-bridge)**).  

---

## 3. Claude Code 멀티 LLM 오케스트레이션 구조

### 전체 아키텍처

```
User
  ↓
Claude Code (Brain) — opusplan 모델 권장
  ├─ 설계·계획·보안 판단  → Claude Opus 4.6
  ├─ 코드 수정·리뷰       → Claude Sonnet 4.6
  └─ 코드 생성·테스트 생성 → GPT-5.3-codex
                               ↑
                         oh-my-bridge
                    (Codex CLI MCP + SubAgent + Hook)
```

GPT-5.3-codex는 **로컬 Codex CLI**(`@openai/codex`)를 통해 호출한다. 비대화형(non-interactive) 모드를 지원하므로 Claude Code에서 Bash 한 줄로 호출 가능하며, `full-auto` 모드에서는 파일을 직접 수정하므로 결과물 파싱이 불필요하다.

> CLI 설치, 상세 옵션, 호출 예시는 **[Part 5. oh-my-bridge 구현 가이드](/posts/oh-my-bridge)**를 참조한다.

### OmO의 모델 라우팅 방식

oh-my-bridge 설계의 레퍼런스인 [oh-my-opencode(OmO)](https://github.com/code-yeongyu/oh-my-opencode)는 11개의 전담 에이전트를 정의하고, 각각에 기본 모델과 fallback 체인을 명시적으로 매핑한다([AGENTS.md](https://github.com/code-yeongyu/oh-my-opencode/blob/dev/src/agents/AGENTS.md)).

| 에이전트 | 기본 모델 | 역할 |
|----------|-----------|------|
| **Sisyphus** | Claude Opus 4.6 | 메인 오케스트레이터, 계획·위임 |
| **Atlas** | Claude Sonnet 4.6 | Todo-list 오케스트레이터 |
| **Prometheus** | Claude Opus 4.6 | 내부 전략 플래너 |
| **Hephaestus** | GPT-5.3-codex | 자율 코드 실행 전담 (fallback 없음) |
| **Metis** | Claude Opus 4.6 | 사전 계획 컨설턴트 |
| **Momus** | GPT-5.2 | 계획 리뷰어 |
| **Oracle** | GPT-5.2 | 읽기 전용 참조 |
| **Librarian** | GLM-4.7 | 외부 문서·코드 검색 |
| **Explore** | Grok-code-fast | 코드베이스 grep |
| **Multimodal-Looker** | Gemini-3-flash | PDF·이미지 분석 |
| **Sisyphus-Junior** | Claude Sonnet 4.6 | 카테고리로 생성되는 실행 에이전트 |

에이전트마다 `primary`(UI 선택 모델 존중) / `subagent`(자체 fallback 체인 사용) 모드가 있고, 각각 다른 모델의 fallback 체인을 갖는다. Hephaestus만 fallback 없이 GPT-5.3-codex가 필수로 지정돼 있다.

이 구조는 정교하지만 Claude Code에 포팅하기에는 비용이 크다(2장에서 기각한 이유). oh-my-bridge는 같은 목표—오케스트레이터는 Claude, 생성은 GPT—를 훨씬 단순한 레이어로 달성한다.

### opusplan — 외부 모델 없이도 작동하는 모델 배분

Superpowers에는 모델 선택 스킬이 없다. repo 전체를 검색해도 유일한 모델 관련 설정은 `agents/code-reviewer.md`의 `model: inherit`(부모 세션 모델 상속)뿐이다 (상세: **[Part 2. Inside Superpowers](/posts/inside-superpowers)**).

Claude Code의 `opusplan` 옵션이 이 공백을 채운다. **설계·계획 단계에는 Opus를, 코드 수정·실행 단계에는 Sonnet을 자동 배분**하는 Claude Code 내장 모드다. Superpowers의 brainstorming, writing-plans 같은 설계 스킬은 Opus가, 실제 코드 작업은 Sonnet이 처리한다.

oh-my-bridge를 통해 외부 모델(GPT, Gemini 등)이 연결된 경우, 코드 생성 작업은 그쪽으로 오프로딩된다. 외부 모델 없이 Superpowers만 쓰는 경우에도 opusplan이 Opus/Sonnet을 알아서 배분하므로 동작 자체는 유지된다.

```
opusplan + Superpowers (외부 모델 없는 기본 구성)
  ├─ 설계·계획·보안 판단 → Opus 4.6 (자동)
  └─ 코드 수정·리뷰·리팩터링 → Sonnet 4.6 (자동)

opusplan + Superpowers + oh-my-bridge (외부 모델 연결)
  ├─ 설계·계획·보안 판단 → Opus 4.6 (자동)
  ├─ 코드 수정·리뷰·리팩터링 → Sonnet 4.6 (자동)
  └─ 코드 생성·테스트 생성 → GPT-5.3-codex (Codex CLI, 모델 설정 무관)
```

---

## 4. Superpowers를 수정하지 않고 행동을 바꾸는 원리

oh-my-bridge는 별도의 플러그인을 설치하는 것이 아니다. Claude Code의 시스템 메커니즘(MCP, SubAgent, Hook, Skill)을 활용해 Superpowers 위에 레이어를 쌓는다. Superpowers는 마켓플레이스에서 설치만 하면 되고, 원본 파일은 건드리지 않는다.

### 스킬 오버라이드 메커니즘

Superpowers의 `resolveSkillPath()`는 **`~/.claude/skills/`(개인 스킬)을 Superpowers 번들 스킬보다 우선 매칭**한다. 이 매칭은 **디렉토리 이름의 정확한 일치(exact match)**로 동작한다.

> 매칭 메커니즘의 소스 분석 상세는 **[Part 2. Inside Superpowers](/posts/inside-superpowers)**을 참조한다.

`~/.claude/skills/subagent-driven-development/SKILL.md`를 배치하면, Superpowers 원본은 그대로 유지되면서 코드 생성 단계만 GPT로 라우팅된다. 오버라이드를 원복하려면 해당 파일을 지우면 된다.

### 구현 레이어

oh-my-bridge의 구현은 **MCP Server + SubAgent + Hook**을 순서대로 쌓는 구조다.

```
Superpowers (설치만, 수정 안 함)
  └─ 워크플로우 스킬 제공 (계획, 리뷰, 디버깅 등)

oh-my-bridge (직접 구축):
  ├─ MCP 등록 (codex mcp-server)          ← Phase 1a
  ├─ SubAgent (codex-generator.md)        ← Phase 1b
  ├─ Hook (비용 로깅, fallback)             ← Phase 2
  └─ 커스텀 스킬 (~/.claude/skills/)        ← Phase 3
      → 동일 디렉토리 이름으로 Superpowers 스킬 오버라이드
```

- **MCP Server** — Codex CLI 내장 `mcp-server` 모드로 네이티브 도구 등록 (래퍼 개발 0)
- **SubAgent** — `.claude/agents/codex-generator.md`로 독립 컨텍스트, `maxTurns` 강제, 기존 리뷰 루프 재사용
- **Hook** — `PostToolUse`로 비용 로깅, 에러 핸들링, 장애 시 Sonnet fallback 자동 전환

### 이 구조의 장점

1. **Superpowers 업데이트와 충돌 없음** — 원본을 건드리지 않으므로 Superpowers가 버전업되어도 커스텀 레이어에 영향이 없다.
2. **즉시 원복 가능** — 커스텀 스킬을 삭제하면 Superpowers 원본 동작으로 즉시 복귀한다.
3. **교체 가능한 모델 슬롯** — MCP 등록 한 줄, SubAgent 프론트매터 수정만으로 코드 생성 모델을 교체할 수 있다.
4. **관심사 분리** — Superpowers는 "워크플로우 패턴"(계획, 리뷰, 디버깅)을 담당하고, oh-my-bridge는 "모델 라우팅과 비용 제어"를 담당한다.

통제 수단과 안정성 설계의 상세는 **[Part 5. oh-my-bridge 구현 가이드](/posts/oh-my-bridge)**를 참조한다.

---

## 시리즈

- **[Part 1. Oh My Bridge: Claude Code 멀티 LLM 오케스트레이션 전략](/posts/claude-code-multi-llm-orchestration)** — oh-my-bridge 배경, 대안 탐색, 전체 구조
- **[Part 2. Inside Superpowers](/posts/inside-superpowers)** — 스킬 시스템 동작 원리, SubAgent 패턴 상세
- **[Part 3. Inside Oh My Opencode](/posts/inside-oh-my-opencode)** — 설계 패턴 레퍼런스, 멀티 에이전트 오케스트레이션, 도구 혁신
- **[Part 4. Inside Oh My Claudecode](/posts/inside-oh-my-claudecode)** — 훅 기반 인터셉션, 에이전트 티어, autopilot 파이프라인
- **[Part 5. Oh My Bridge: 플러그인 구성과 작동 방식](/posts/oh-my-bridge)** — 플러그인 구성과 작동 방식
