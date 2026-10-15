export type Lang = "en" | "ar";
export type PageKey = "home" | "privacy" | "support";

// Contact address shown on the privacy and support pages, from website/.env (not tracked)
export const EMAIL: string = import.meta.env.PUBLIC_CONTACT_EMAIL;
if (!EMAIL) throw new Error("Set PUBLIC_CONTACT_EMAIL in website/.env (docs/HOSTING.md)");
export const DOWNLOAD_HOST = "dl.lexnur.com";

const paths: Record<Lang, Record<PageKey, string>> = {
  en: { home: "/", privacy: "/privacy", support: "/support" },
  ar: { home: "/ar", privacy: "/ar/privacy", support: "/ar/support" },
};

export const pathFor = (lang: Lang, page: PageKey) => paths[lang][page];

export const ui = {
  en: {
    dir: "ltr",
    switchLabel: "العربية",
    switchLang: "ar",
    nav: { home: "Home", privacy: "Privacy", support: "Support" },
    tagline: "Free offline dictionaries for Android and iOS",
    footer: "Lexnur — free offline dictionaries.",
  },
  ar: {
    dir: "rtl",
    switchLabel: "English",
    switchLang: "en",
    nav: { home: "الرئيسية", privacy: "الخصوصية", support: "الدعم" },
    tagline: "قواميس مجانية تعمل دون اتصال على أندرويد وiOS",
    footer: "Lexnur — قواميس مجانية تعمل دون اتصال.",
  },
} as const;
