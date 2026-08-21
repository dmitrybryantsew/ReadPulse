export interface OutlineNode {
  id: string;
  title: string;
  level: number;
  pageNumber: number;
  endPage: number;
  children: OutlineNode[];
}

export interface BookUploadResult {
  bookId: number;
  fileName: string;
  filePath: string;
  pageCount: number;
  outline: OutlineNode[];
}

export interface ParagraphResult {
  index: number;
  pageNumber: number;
  text: string;
}

export interface ParagraphsResponse {
  count: number;
  paragraphs: ParagraphResult[];
}

export interface GeneratedQuizOption {
  id: string;
  text: string;
  isCorrect: boolean;
  explanation?: string;
}

export interface GeneratedCard {
  type: string;
  title: string;
  content: string;
  language: string;
  quizOptions?: GeneratedQuizOption[];
  codeSnippet?: string | null;
  codeLanguage?: string | null;
}

export interface GenerateCardsResponse {
  count: number;
  cards: GeneratedCard[];
}

const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:5159";

export async function uploadBook(file: File): Promise<BookUploadResult> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/books/upload`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Upload failed: ${response.status}`);
  }

  return response.json() as Promise<BookUploadResult>;
}

export async function uploadBookFromUrl(url: string): Promise<BookUploadResult> {
  const response = await fetch(`${API_BASE_URL}/api/books/upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ url }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `URL upload failed: ${response.status}`);
  }
  return response.json() as Promise<BookUploadResult>;
}

export async function extractParagraphs(
  filePath: string,
  startPage: number,
  endPage: number,
  minChars = 20,
): Promise<ParagraphsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/books/extract-paragraphs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ filePath, startPage, endPage, minChars }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Extract failed: ${response.status}`);
  }

  return response.json() as Promise<ParagraphsResponse>;
}

export async function generateCards(
  filePath: string,
  text: string,
  language: "en" | "ru",
): Promise<GenerateCardsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/books/generate-cards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ filePath, text, language }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Generate cards failed: ${response.status}`);
  }

  return response.json() as Promise<GenerateCardsResponse>;
}
