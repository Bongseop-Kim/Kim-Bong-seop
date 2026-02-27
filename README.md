# Kim Bong-seop Blog

김봉섭의 개인 기술 블로그입니다.

**[kim-bong-seop.pages.dev](https://kim-bong-seop.pages.dev)**

## 스택

- [Astro](https://astro.build/) + [AstroPaper](https://github.com/satnaing/astro-paper) 테마
- TypeScript
- Cloudflare Pages 배포

## 로컬 실행

```bash
pnpm install
pnpm run dev
```

`localhost:4321`에서 확인 가능합니다.

## 포스트 작성

`src/data/blog/` 디렉토리에 `.md` 파일을 추가합니다.

```markdown
---
author: Kim Bong-seop
pubDatetime: YYYY-MM-DDTHH:MM:SSZ
title: 제목
slug: url-slug-kebab-case
featured: false
draft: false
tags:
  - 태그
description: 한 줄 요약
---
```

## 명령어

| 명령어 | 설명 |
| :--- | :--- |
| `pnpm run dev` | 개발 서버 실행 (`localhost:4321`) |
| `pnpm run build` | 프로덕션 빌드 |
| `pnpm run preview` | 빌드 결과 미리보기 |
| `pnpm run format` | Prettier 포맷팅 |
| `pnpm run lint` | ESLint 검사 |
