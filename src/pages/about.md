---
layout: ../layouts/AboutLayout.astro
title: "About"
---

안녕하세요, **김봉섭**입니다.
응용 소프트웨어 개발자로 안전보건 관리 시스템, 모바일 앱, 클라우드 전환 사업 등 다양한 프로젝트에 참여해 왔습니다.

## 이렇게 일합니다

AI 도구를 단순 활용하는 차원을 넘어, **개발 환경의 생산성을 극대화하는 인프라와 워크플로우를 직접 설계**합니다.

| 분야 | 내용 | 성과 |
| :--- | :--- | :--- |
| **AI 기반 CI/CD 및 품질 자동화** | Git Pre-commit(로컬 검증) 및 GitHub Actions(Lint, Vitest, Playwright)를 연계하여, AI 생성 코드의 기능적 정합성과 운영 효율성(비용/속도)을 동시에 관리하는 실무 중심의 피드백 루프 운영 | 코드 정합성 확보 및 배포 안정성 극대화 |
| **멀티 LLM 오케스트레이션** | Claude Code에서 작업을 분석해 Claude·Codex·Gemini 중 최적의 모델로 자동 위임하는 [oh-my-bridge](https://github.com/Bongseop-Kim/oh-my-bridge) MCP 서버 개발 | Opus 단독 대비 비용 **약 50% 절감**, 품질 향상 |
| **사내 디자인 시스템 구축** | 사내 DDS(Duego Design System) 도입을 제안·설계하고, 팀원 배포용 Claude Code 플러그인으로 패키징하여 UI 일관성 유지 | 반복 UI 개발 시간 **약 60% 단축** |
| **BFF-less 아키텍처** | Supabase의 RLS, RPC, Trigger를 적극 활용해 별도의 백엔드 서버 없이도 보안과 데이터 무결성을 보장하는 효율적 아키텍처 지향 | 시스템 복잡도 감소 및 배포 속도 개선 |

### 개인 프로젝트

| 프로젝트 | 설명 |
| :--- | :--- |
| [oh-my-bridge](https://github.com/Bongseop-Kim/oh-my-bridge) | **Go 기반 멀티 모델 라우팅 도구.** 작업 의도(UI, Logic, Docs 등)를 분류해 최적의 AI 모델에 위임하는 MCP 서버. TUI 설정과 성능 진단 도구 포함. |
| [YeongSeon](https://github.com/Bongseop-Kim/YeongSeon) | **AI-Native 이커머스 프로토타입.** Turborepo 기반 모노레포에서 Supabase를 백엔드로 사용하며, AI 에이전트와 함께 협업하여 개발하는 워크플로우 실증 프로젝트. |

## 기술 스택

- **Languages** — TypeScript, Go, SQL (PostgreSQL)
- **Mobile** — React Native, Expo
- **Web** — React, Astro, Vite
- **Backend** — Supabase (Auth, DB, Storage, Edge Functions, RLS/RPC)
- **AI/LLM** — Claude Code, MCP, Codex CLI, Gemini CLI, CodeRabbit, Pencil
- **Tooling** — Turborepo, pnpm, Vitest, Playwright, GitHub Actions, Docker, Git Hooks

---

## 근무 경력

### 주식회사 되고시스템 <span style="font-size: 0.8em; color: #22c55e;">재직중</span>

**2024.11.12 ~ 현재** | SW개발 > 응용SW개발

---

### 콜라보스튜디오

**2023.08.14 ~ 2024.10.28** | SW개발 > 응용SW개발

---

## 프로젝트 경력

### 주식회사 되고시스템

전사 산업안전보건 시스템의 **모바일 파트 설계를 전담**하여 다수의 구축 프로젝트를 성공적으로 수행했습니다. 특히, **AI 도입을 통한 공수 절감을 근거로 사내 디자인 시스템(DDS) 구축의 타당성을 직접 제안 및 설득**하여 프로젝트를 성사시켰으며, 이를 통해 반복적인 요구사항을 표준화하고 전사적 개발 생산성을 극대화했습니다.

| 프로젝트 | 수행 기간 | 기술 |
| :--- | :--- | :--- |
| 에스원 안전보건 전산시스템 구축 | 2025.08.19 ~ 2025.11.13 | Expo |
| 성신양회 안전보건 전산시스템 구축 | 2025.07.22 ~ 2025.11.13 | Expo |
| 한국철도공사 산업안전보건관리시스템 구축 용역 | 2025.05.30 ~ 2025.11.13 | Next.js, WebView |
| 현대아이에스씨&현대아이엠씨 안전보건관리시스템 구축 | 2024.11.12 ~ 2025.04.30 | Expo |
| 동국씨엠 안전관리시스템 구축 | 2024.12.01 ~ 2025.05.31 | Expo |
| 삼구아이앤씨 안전점검 관리자시스템 구축 | 2024.11.12 ~ 2024.12.31 | Expo |

### 콜라보스튜디오

신입 개발자로 시작하여 프론트엔드부터 백엔드(Full-stack)까지 폭넓은 실무 경험을 쌓았습니다. 특히 정부 사업의 클라우드 전환 참여와 더불어, 스타트업 프로젝트의 초기 기획부터 **고객사 미팅, 비즈니스 정책 조정, 스토어 배포**까지 서비스 전체 생명주기를 주도하며 탄탄한 기본기를 다졌습니다.

| 프로젝트 | 수행 기간 | 기술 |
| :--- | :--- | :--- |
| 세종 행정안전부 클라우드 네이티브 기반 시스템 시범전환 사업 | 2024.06.03 ~ 2024.10.28 | React, MSA, 웹 표준 준수 |
| 디오션 포인트 기반 SNS 어플리케이션 개발 | 2024.03.01 ~ 2024.06.01 | Expo, Node.js, Prisma (Full-stack) |
| 필미 AI 손톱 진단 어플리케이션 개발 | 2023.08.14 ~ 2024.03.01 | Expo, Spring Boot, 카메라 UI/차트 구현 |
