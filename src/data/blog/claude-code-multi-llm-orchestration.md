---
author: Kim Bong-seop
pubDatetime: 2026-02-27T09:00:00Z
title: Claude Code 중심 멀티 LLM 오케스트레이션 설계
slug: claude-code-multi-llm-orchestration
featured: true
draft: false
tags:
  - Claude Code
  - LLM
  - AI
  - 개발 워크플로우
description: 서드파티 오케스트레이터 없이 Claude Code를 Brain으로 삼고 GPT를 독립 API로 통합하는 멀티 LLM 설계 전략을 정리합니다.
---

## 오케스트레이터가 외부에 있을 때 생기는 문제

oh-my-opencode로 GPT-Pro와 Claude-Max를 동시에 연결했습니다. 모델마다 잘하는 게 다르니, 역할에 맞는 모델을 붙이면 전체 품질이 올라갈 거라는 생각이었습니다.

그런데 Claude OAuth 정책이 바뀌었습니다. 제3자 오케스트레이터를 통한 Claude 출력 활용이 제한되었고, 외부 도구에 의존하는 구조 전체가 정책 리스크를 안게 됐습니다.

**자동화 수준이 높은 도구라도, 정책 변화 한 번에 무너질 수 있습니다.**

---

## oh-my-claudecode를 선택하지 않은 이유

oh-my-claudecode는 기능이 풍부합니다. tmux worker 기반 병렬 실행, Codex와 Gemini CLI 통합, 멀티 에이전트 자동 분배까지 갖추고 있습니다.

하지만 고민이 생겼습니다.

- 워커 spawn 구조는 공격 표면이 넓어집니다.
- 내부 동작을 추적하기 어렵습니다.
- 외부 프레임워크에 장기 의존하면 유지보수 리스크가 쌓입니다.

자동화 수준이 높다는 것은 곧 제어권이 낮다는 뜻이기도 합니다. 지금 필요한 건 완전히 통제 가능한 구조였습니다. 채택을 보류했습니다.

---

## Claude Code를 오케스트레이터로 세우다

> 생성은 GPT, 판단은 Claude, 통제는 내가 한다.

서드파티 오케스트레이터를 걷어내고 Claude Code 자체를 중앙으로 세웠습니다. GPT는 독립 API 호출 방식으로만 통합했습니다.

```text
User
  ↓
Claude Code (Orchestrator)
  ├─ Plan
  ├─ Task Routing
  ├─ call-codex (Custom Skill)
  │      └─ GPT-5.3-codex
  ├─ Review
  └─ Fix Loop
```

역할 분리는 단순하게 가져갔습니다.

| 역할 | 담당 |
| --- | --- |
| 문제 구조화 | Claude |
| 코드 생성 | GPT-5.3-codex |
| 리팩터링 | Claude |
| 테스트 생성 | GPT |
| 보안 검증 | Claude |

판단이 필요한 단계는 Claude가, 생성이 필요한 단계는 GPT가 맡습니다.

---

## Superpowers: 프로세스를 강제하는 도구

Superpowers는 Claude Code 워크플로우를 Skills 기반 규칙으로 강화하는 프레임워크입니다. 절차를 강제한다는 게 핵심입니다.

오케스트레이션 로직을 문서로 관리하고, 커스텀 스킬을 추가할 수 있습니다. 자동 분배 없이 명시적으로 호출하는 구조라 내부 동작을 그대로 추적할 수 있습니다.

**Superpowers는 프로세스를 강제하는 용도로, GPT 호출은 커스텀 스킬로 구현합니다.**

---

## call-codex: GPT를 명시적으로 부르는 스킬

코드 생성이 필요한 순간에만 GPT를 호출하도록 커스텀 스킬을 설계했습니다.

```text
brainstorm
→ plan
→ implement (codex 호출)
→ review (Claude)
→ test
→ fix loop
```

스킬 내부에는 다섯 가지 요소가 들어갑니다. 호출 트리거 조건, 입력 포맷, CLI/API 실행 명령, 결과 검증 단계, Claude 재검토 루프입니다. 생성과 검증 사이에 반드시 Claude 리뷰가 들어갑니다.

```text
IF task == "code_generation"
    → call GPT
    → return result
    → Claude review
    → IF fail → regenerate
```

---

## 비용과 보안, 두 가지 제약 조건

멀티 LLM 구조는 루프가 반복될수록 토큰 사용이 기하급수적으로 늘어납니다. GPT 호출을 코드 생성 단계로만 제한하고, 반복 횟수와 최대 토큰에 상한을 설정했습니다. 로그 기반으로 비용을 추적합니다.

보안은 키 분리에서 시작합니다. OpenAI 키와 Claude 토큰은 완전히 분리해서 관리하고, Claude 토큰은 외부로 전달하지 않습니다. 파일 접근 범위는 프로젝트 내부로 제한하고, 자동 쉘 실행은 승인을 유지합니다.

---

## 자동화보다 통제권이 중요하다

이 구조의 선택 기준은 하나였습니다. 내가 모든 단계를 이해하고 개입할 수 있는가.

| 기준 | 결과 |
| --- | --- |
| 통제권 | Superpowers로 확보 |
| 정책 안정성 | 서드파티 의존 제거 |
| 보안 표면 | 최소화 |
| 확장성 | Provider Router Layer 추가 예정 |

이후 Gemini, Local LLM, 자체 MCP 서버로 모델을 확장할 수 있습니다. 구조가 단순할수록 확장도 단순합니다.

**멀티 LLM은 기능의 문제가 아니라 설계의 문제입니다.** 오케스트레이션을 외부에 맡기지 않는 것, 그게 이 설계의 출발점이었습니다.
