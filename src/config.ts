export const SITE = {
  website: "https://kim-bong-seop.pages.dev/",
  author: "Kim Bong-seop",
  profile: "https://github.com/Bongseop-Kim",
  desc: "김봉섭의 개인 블로그 & 포트폴리오",
  title: "Kim Bong-seop",

  lightAndDarkMode: true,
  postPerIndex: 4,
  postPerPage: 4,
  scheduledPostMargin: 15 * 60 * 1000, // 15 minutes
  showArchives: true,
  showBackButton: true, // show back button in post detail
  editPost: {
    enabled: true,
    text: "Edit page",
    url: "https://github.com/Bongseop-Kim/Kim-Bong-seop/edit/main/",
  },
  dynamicOgImage: true,
  dir: "ltr", // "rtl" | "auto"
  lang: "ko", // html lang code. Set this empty and default will be "en"
  timezone: "Asia/Seoul", // Default global timezone (IANA format) https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
} as const;
