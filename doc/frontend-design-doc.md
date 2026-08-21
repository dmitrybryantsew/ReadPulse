# Frontend Design Doc: ReadPulse — Micro-Learning Book Feed (TypeScript + React)

## 1. What This Is

This is the client application for **ReadPulse** — a habit-building, scrollable micro-learning feed. It delivers bite-sized insights, interactive quizzes, and practical code snippets parsed from technical and conceptual books via LLMs.

This doc covers the **MVP frontend architecture and UI**:
- Infinite scroll feed for multi-type book cards (`Insight`, `Quiz`, `ActionCode`)
- Clean Modern Reader UI theme
- Interactive quiz choice selection with instant feedback
- Syntax-highlighted code snippets with 1-click copy
- Category & Card Type filtering

**Deferred / Future Extensions** (Documented upgrade path):
- Spaced repetition review queue ("Review Later")
- User feedback / LLM card regeneration triggers
- Full Firebase / Google OAuth integration
- Interactive WebAssembly / sandboxed code execution

---

## 2. Tech Stack & Tools

| Tool / Library | Role & Purpose |
|---|---|
| **Vite** | Fast dev server, near-zero config, optimized build output. |
| **React 18 + TypeScript** | Strict type safety for multi-card schemas and state management. |
| **@tanstack/react-query v5** (`useInfiniteQuery`) | Manages infinite scroll pages, filter caching, and optimistic card scoring state. |
| **react-intersection-observer** | Triggers next page fetches efficiently via bottom sentinel element. |
| **Tailwind CSS + Lucide React** | Clean reader layout, badges, icons, and responsive card styling. |
| **Prism.js / Shiki** | Syntax highlighting for code snippets within `ActionCode` cards. |
| **Canvas Confetti** | Subtle delight/reward micro-animations on correct quiz responses. |

---

## 3. High-Level Architecture & UI Layout

```
main.tsx
  └─ QueryClientProvider
       └─ App.tsx
            ├─ Header & Category/Type Filter Bar
            └─ Feed.tsx
                 ├─ useInfiniteQuery -> calls fetchPosts(page, category, type)
                 ├─ renders <InsightCard />, <QuizCard />, or <CodeCard />
                 └─ sentinel <div> at bottom -> fetchNextPage() on scroll
```

```
┌────────────────────────────────────────────────────────┐
│ 📚 READPULSE               [ All ] [ System Design ]   │
├────────────────────────────────────────────────────────┤
│ 💡 BOOK INSIGHT                    📖 Designing Data-Intensive Apps
│                                    ✍️ Martin Kleppmann (Ch. 3)
│ ───────────────────────────────────────────────────────
│ "Indexes speed up reads, but slow down writes."
│
│ Every index you add to a database introduces overhead on
│ write operations because the index must be updated...
│
│ [🏷️ System Design]                    [👍 42]  [🔖 Save]
├────────────────────────────────────────────────────────┤
│ ❓ QUIZ / EXERCISE                  📖 Clean Code
│ ───────────────────────────────────────────────────────
│ What is the main downside of passing boolean flags to functions?
│
│  (A) It decreases performance
│  (B) It violates the Single Responsibility Principle  [✅ Correct!]
│  (C) Boolean flags are deprecated in C#
│
│  💡 Explanation: A boolean flag implies the function does one thing 
│     if true, and another if false.
├────────────────────────────────────────────────────────┤
│ ⚡ PRACTICAL CODE                   📖 Pragmatic Programmer
│ ───────────────────────────────────────────────────────
│ Avoid Magic Numbers with Descriptive Enums
│
│ ┌─ C# ──────────────────────────────────────── [📋 Copy] ┐
│ │ public enum OrderStatus {                              │
│ │     Pending = 1,                                       │
│ │     Processing = 2,                                    │
│ │     Shipped = 3                                        │
│ │ }                                                      │
│ └────────────────────────────────────────────────────────┘
└────────────────────────────────────────────────────────┘
```

---

## 4. Data Contract (Frontend - Backend Shared Interface)

```typescript
export type CardType = 'insight' | 'quiz' | 'action_code';

export interface QuizOption {
  id: string;
  text: string;
  isCorrect: boolean;
  explanation?: string;
}

export interface Post {
  id: number;
  type: CardType;
  title: string;
  content: string;
  category: string;
  bookTitle?: string;
  bookAuthor?: string;
  chapter?: string;
  
  // Quiz card properties
  quizOptions?: QuizOption[];

  // Code card properties
  codeSnippet?: string;
  codeLanguage?: string;

  likesCount: number;
  createdAt: string;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}
```

Endpoint: `GET /api/posts?page={n}&pageSize={n}&category={cat}&type={type}`

---

## 5. Folder Structure

```
frontend/
├── .env
├── index.html
├── package.json
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── types/
│   │   └── post.ts
│   ├── api/
│   │   └── posts.ts
│   └── components/
│       ├── Feed.tsx
│       ├── Header.tsx
│       ├── FilterBar.tsx
│       └── cards/
│           ├── InsightCard.tsx
│           ├── QuizCard.tsx
│           └── CodeCard.tsx
```

---

## 6. Implementation Steps

1. **Scaffold Project:** Vite React TypeScript setup.
2. **Install Core Dependencies:** `@tanstack/react-query`, `react-intersection-observer`, `lucide-react`, `canvas-confetti`.
3. **Types & API Client:** Define card models and `fetchPosts(page, category, type)` function.
4. **Card Component Architecture:** Separate rendering for `InsightCard`, `QuizCard` (interactive state), and `CodeCard` (copy-to-clipboard support).
5. **Feed & Sentinel Integration:** Hook up `useInfiniteQuery` and `useInView` for continuous habit scrolling.
6. **Styling & Polish:** Clean modern reader styling with clean typography, category tags, and responsive cards.

---

## 7. Manual Testing Checklist

- [ ] Feed loads initial page of mixed book cards.
- [ ] Quiz card options respond to clicks, revealing correct/incorrect states and explanations.
- [ ] Code card includes working "Copy Snippet" button with feedback toast/icon change.
- [ ] Scrolling to bottom smoothly triggers page 2 loading without duplicate cards.
- [ ] Category filter pills update feed query parameters and refresh content seamlessly.
