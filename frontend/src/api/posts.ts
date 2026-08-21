import type { Language, PagedResult, Post, QuizOption } from "../types/post";

const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:5159";

export async function fetchPosts(
  page: number,
  pageSize = 10,
  category?: string,
  type?: string,
  lang?: Language,
  q?: string,
): Promise<PagedResult<Post>> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (category && category !== "all") params.set("category", category);
  if (type && type !== "all") params.set("type", type);
  if (lang) params.set("lang", lang);
  if (q && q.length > 0) params.set("q", q);

  const response = await fetch(`${API_BASE_URL}/api/posts?${params}`, { credentials: "include" });

  if (!response.ok) {
    throw new Error(`Failed to fetch posts: ${response.status}`);
  }

  return response.json() as Promise<PagedResult<Post>>;
}

export interface CreatePostData {
  type?: string;
  title: string;
  content: string;
  category?: string;
  bookTitle?: string;
  bookAuthor?: string;
  chapter?: string;
  codeSnippet?: string;
  codeLanguage?: string;
  language?: Language;
  quizOptions?: QuizOption[];
  tags?: string[];
}

export async function searchPosts(query: string, lang?: Language, limit = 20): Promise<PagedResult<Post>> {
  const params = new URLSearchParams({ q: query.trim(), pageSize: String(limit) });
  if (lang) params.set("lang", lang);
  const response = await fetch(`${API_BASE_URL}/api/posts/search?${params}`, { credentials: "include" });
  if (!response.ok) throw new Error(`Search failed: ${response.status}`);
  return response.json() as Promise<PagedResult<Post>>;
}

export async function toggleSavePost(id: number): Promise<{ postId: number; saved: boolean }> {
  const response = await fetch(`${API_BASE_URL}/api/posts/${id}/save`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) throw new Error(`Save toggle failed: ${response.status}`);
  return response.json();
}

export async function createPost(data: CreatePostData): Promise<Post> {
  const response = await fetch(`${API_BASE_URL}/api/posts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      type: data.type ?? "insight",
      title: data.title,
      content: data.content,
      category: data.category ?? "other",
      bookTitle: data.bookTitle,
      bookAuthor: data.bookAuthor,
      chapter: data.chapter,
      codeSnippet: data.codeSnippet,
      codeLanguage: data.codeLanguage,
      language: data.language ?? "en",
      quizOptions: data.quizOptions,
      tags: data.tags,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to create post: ${response.status}`);
  }

  return response.json();
}

export async function updatePost(id: number, data: Partial<CreatePostData>): Promise<Post> {
  const response = await fetch(`${API_BASE_URL}/api/posts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      type: data.type,
      title: data.title,
      content: data.content,
      category: data.category,
      bookTitle: data.bookTitle,
      bookAuthor: data.bookAuthor,
      chapter: data.chapter,
      codeSnippet: data.codeSnippet,
      codeLanguage: data.codeLanguage,
      quizOptions: data.quizOptions,
      tags: data.tags,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to update post: ${response.status}`);
  }
  return response.json();
}

export async function deletePost(id: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/posts/${id}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok && response.status !== 204) {
    throw new Error(`Failed to delete post: ${response.status}`);
  }
}

export async function fetchCategories(): Promise<string[]> {
  const response = await fetch(`${API_BASE_URL}/api/posts/categories`, { credentials: "include" });

  if (!response.ok) {
    throw new Error(`Failed to fetch categories: ${response.status}`);
  }

  const data = await response.json();
  return (data as string[]).filter((c) => c !== "test-dedup");
}
