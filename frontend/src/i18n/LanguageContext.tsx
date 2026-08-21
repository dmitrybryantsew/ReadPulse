import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Language } from "../types/post";

interface Dictionary {
  header: { tagline: string };
  feed: {
    loading: string;
    error: string;
    errorHint: string;
    loadingMore: string;
    end: string;
  };
  card: {
    unknownAuthor: string;
    likes: (n: number) => string;
    copyTitle: string;
    explanation: string;
    explanationFallback: string;
    categoryLabel: (cat: string) => string;
    typeBadge: (t: string) => string;
  };
  filters: {
    allCategories: string;
    typeAll: string;
    typeInsight: string;
    typeQuiz: string;
    typeCode: string;
    clear: string;
    noMatch: string;
  };
}

const dictionaries: Record<Language, Dictionary> = {
  en: {
    header: { tagline: "Learn a little, every day." },
    feed: {
      loading: "Loading ReadPulse...",
      error: "Failed to load feed.",
      errorHint: "Is the backend running?",
      loadingMore: "Loading more insights...",
      end: "You've reached the end of this topic.",
    },
    card: {
      unknownAuthor: "Unknown Author",
      likes: (n) => `${n} Likes`,
      copyTitle: "Copy snippet",
      explanation: "Explanation",
      explanationFallback: "Consider the core principles discussed in the chapter.",
      categoryLabel: (cat) => cat,
      typeBadge: (t) => t,
    },
    filters: {
      allCategories: "All categories",
      typeAll: "All types",
      typeInsight: "Insights",
      typeQuiz: "Quizzes",
      typeCode: "Code",
      clear: "Clear",
      noMatch: "No posts match the filter.",
    },
  },
  ru: {
    header: { tagline: "Учись понемногу каждый день." },
    feed: {
      loading: "Загрузка ReadPulse...",
      error: "Не удалось загрузить ленту.",
      errorHint: "Бэкенд запущен?",
      loadingMore: "Загружаем ещё...",
      end: "Вы дошли до конца темы.",
    },
    card: {
      unknownAuthor: "Автор неизвестен",
      likes: (n) => `${n} лайков`,
      copyTitle: "Копировать код",
      explanation: "Пояснение",
      explanationFallback: "Вспомните ключевые принципы, обсуждаемые в этой главе.",
      categoryLabel: (cat) => categoryRu[cat] ?? cat,
      typeBadge: (t) => typeRu[t] ?? t,
    },
    filters: {
      allCategories: "Все категории",
      typeAll: "Все типы",
      typeInsight: "Идеи",
      typeQuiz: "Викторины",
      typeCode: "Код",
      clear: "Сбросить",
      noMatch: "Нет постов по фильтру.",
    },
  },
};

const categoryRu: Record<string, string> = {
  "clean-code": "чистый код",
  pragmatic: "прагматика",
  refactoring: "рефакторинг",
  "system-design": "архитектура",
};

const typeRu: Record<string, string> = {
  insight: "идея",
  quiz: "викторина",
  action_code: "код",
};

interface LanguageContextValue {
  lang: Language;
  setLang: (l: Language) => void;
  t: Dictionary;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "readpulse-lang";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    if (typeof window === "undefined") return "en";
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "ru" || stored === "en" ? stored : "en";
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      setLang: setLangState,
      t: dictionaries[lang],
    }),
    [lang],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
