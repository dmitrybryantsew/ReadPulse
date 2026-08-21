export type CardType = "insight" | "quiz" | "action_code";

export interface QuizOption {
  id: string;
  text: string;
  isCorrect: boolean;
  explanation?: string;
}

export type Language = "en" | "ru";

export interface Post {
  id: number;
  type: CardType;
  title: string;
  content: string;
  category: string;
  bookTitle?: string;
  bookAuthor?: string;
  chapter?: string;
  quizOptions?: QuizOption[];
  codeSnippet?: string;
  codeLanguage?: string;
  createdAt: string;
  language?: Language;
  tags?: string[];
  isSaved?: boolean;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}
