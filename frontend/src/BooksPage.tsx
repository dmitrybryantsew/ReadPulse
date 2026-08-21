import { useState, useRef } from "react";
import type { ChangeEvent } from "react";
import { uploadBook, uploadBookFromUrl, extractParagraphs, generateCards, type BookUploadResult, type OutlineNode, type ParagraphsResponse, type GeneratedCard } from "./api/books";
import { createPost } from "./api/posts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, BookOpen, BookCopy, ChevronRight, ChevronDown, FileText, Plus, Sparkles, X, Pencil, Link2 } from "lucide-react";
import { useLanguage } from "./i18n/LanguageContext";

interface SelectedNode {
  node: OutlineNode;
  ancestors: string[];
}

interface AiCardItem {
  key: number;
  paragraphIndex: number;
  card: GeneratedCard;
}


const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:5159";

function nodeTitleToCategory(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50) || "chapter";
}

export default function BooksPage({ onOpenInFeed }: { onOpenInFeed?: (category: string) => void }) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<BookUploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [paragraphsResult, setParagraphsResult] = useState<ParagraphsResponse | null>(null);
  const [addedParagraphs, setAddedParagraphs] = useState<Set<number>>(new Set());
  const [cardLanguage, setCardLanguage] = useState<"en" | "ru">("en");
  const [manualRange, setManualRange] = useState({ start: 1, end: 1 });
  // AI-generated card preview state (keyed by paragraph index)
  const [aiCards, setAiCards] = useState<AiCardItem[]>([]);
  const [generatingFor, setGeneratingFor] = useState<Set<number>>(new Set());
  const [addedAiCards, setAddedAiCards] = useState<Set<number>>(new Set());
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [uploadingUrl, setUploadingUrl] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const createCardMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      content: string;
      type?: string;
      bookTitle?: string;
      bookAuthor?: string;
      chapter?: string;
      language: "en" | "ru";
      quizOptions?: { id: string; text: string; isCorrect: boolean; explanation?: string }[];
      codeSnippet?: string | null;
      codeLanguage?: string | null;
      paragraphIndex?: number;
      aiCardKey?: number;
    }) => {
      const fullTitle = data.chapter ? `${data.title} (${data.chapter})` : data.title;
      return createPost({
        title: fullTitle,
        content: data.content,
        type: data.type ?? "insight",
        category: "book-extract",
        bookTitle: data.bookTitle,
        bookAuthor: data.bookAuthor,
        chapter: data.chapter,
        language: data.language,
        quizOptions: data.quizOptions,
        codeSnippet: data.codeSnippet ?? undefined,
        codeLanguage: data.codeLanguage ?? undefined,
      });
    },
    onSuccess: (newPost, variables) => {
      if (variables.paragraphIndex !== undefined) {
        setAddedParagraphs((prev) => new Set(prev).add(variables.paragraphIndex!));
      }
      if (variables.aiCardKey !== undefined) {
        setAddedAiCards((prev) => new Set(prev).add(variables.aiCardKey!));
      }
      queryClient.invalidateQueries({ queryKey: ["posts", newPost.language] });
    },
  });

  const getBookMeta = () => ({
    chapter: selectedNode?.node.title,
    bookTitle: uploadResult?.fileName.replace(/_/g, " ").replace(/\.pdf$/i, ""),
  });

  const handleAddCard = (paragraphIndex: number, text: string) => {
    // Manual card: extract first sentence as title, rest as content
    const firstSentenceEnd = text.indexOf(". ");
    const title = firstSentenceEnd > 0 && firstSentenceEnd < 80
      ? text.substring(0, firstSentenceEnd).trim()
      : text.substring(0, 80).trim() + "...";

    createCardMutation.mutate({
      title,
      content: text.trim(),
      ...getBookMeta(),
      language: cardLanguage,
      paragraphIndex,
    });
  };

  const handleGenerateAi = async (paragraphIndex: number, text: string) => {
    if (!uploadResult) return;
    setGeneratingFor((prev) => new Set(prev).add(paragraphIndex));
    setError(null);
    try {
      const result = await generateCards(uploadResult.filePath, text, cardLanguage);
      const newItems: AiCardItem[] = result.cards.map((card, i) => ({
        key: paragraphIndex * 100 + i,
        paragraphIndex,
        card,
      }));
      setAiCards((prev) => [...prev.filter((a) => a.paragraphIndex !== paragraphIndex), ...newItems]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI generation failed");
    } finally {
      setGeneratingFor((prev) => {
        const next = new Set(prev);
        next.delete(paragraphIndex);
        return next;
      });
    }
  };

  const handleAddAiCard = (item: AiCardItem) => {
    createCardMutation.mutate({
      title: item.card.title,
      content: item.card.content,
      type: item.card.type,
      quizOptions: item.card.quizOptions,
      codeSnippet: item.card.codeSnippet,
      codeLanguage: item.card.codeLanguage,
      ...getBookMeta(),
      language: (item.card.language === "ru" ? "ru" : "en") as "en" | "ru",
      aiCardKey: item.key,
    });
  };

  const handleDismissAiCard = (key: number) => {
    setAiCards((prev) => prev.filter((a) => a.key !== key));
    setEditingCard((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const [editingCard, setEditingCard] = useState<Record<number, GeneratedCard>>({});

  const startEditCard = (item: AiCardItem) => {
    setEditingCard((prev) => ({ ...prev, [item.key]: { ...item.card } }));
  };

  const cancelEditCard = (key: number) => {
    setEditingCard((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const saveEditCard = (key: number) => {
    const edited = editingCard[key];
    if (!edited) return;
    setAiCards((prev) => prev.map((a) => (a.key === key ? { ...a, card: edited } : a)));
    cancelEditCard(key);
  };

  // #2 Batch: run AI over ALL extracted paragraphs sequentially
  const handleGenerateAll = async () => {
    if (!uploadResult || !paragraphsResult || batchGenerating) return;
    const eligible = paragraphsResult.paragraphs.filter((p) => p.text.length >= 50);
    if (eligible.length === 0) return;

    setBatchGenerating(true);
    setBatchProgress({ done: 0, total: eligible.length });
    setError(null);
    setAiCards([]);
    setAddedAiCards(new Set());

    try {
      for (let i = 0; i < eligible.length; i++) {
        const p = eligible[i];
        try {
          const result = await generateCards(uploadResult.filePath, p.text, cardLanguage);
          const newItems: AiCardItem[] = result.cards.map((card, j) => ({
            key: p.index * 100 + j,
            paragraphIndex: p.index,
            card,
          }));
          setAiCards((prev) => [...prev, ...newItems]);
        } catch {
          // tolerate single-paragraph failures, keep going
        } finally {
          setBatchProgress({ done: i + 1, total: eligible.length });
        }
      }
    } finally {
      setBatchGenerating(false);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const result = await uploadBook(file);
      setUploadResult(result);
      setSelectedNode(null);
      setParagraphsResult(null);
      setAiCards([]);
      setAddedAiCards(new Set());
      setAddedParagraphs(new Set());

      // For .txt / .md there is no outline — auto-extract whole text and prep for LLM
      const isText = file.name.toLowerCase().endsWith(".txt") || file.name.toLowerCase().endsWith(".md");
      if (isText) {
        const r = await fetch(`${API_BASE_URL}/api/books/extract-text-raw`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ filePath: result.filePath, startPage: 1, endPage: 1 }),
        });
        if (r.ok) {
          const { text } = await r.json() as { text: string };
          // Create 1 pseudo-paragraph so the AI pipeline can run
          setParagraphsResult({
            count: 1,
            paragraphs: [{ index: 0, pageNumber: 1, text }],
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleNodeClick = (node: OutlineNode) => {
    setSelectedNode({ node, ancestors: [] });
    setParagraphsResult(null);
    setManualRange({ start: node.pageNumber, end: node.endPage });
  };

  const handleExtract = async (start: number, end: number) => {
    if (!uploadResult) return;
    setExtracting(true);
    setError(null);
    setParagraphsResult(null);
    setAiCards([]);
    setAddedAiCards(new Set());
    setAddedParagraphs(new Set());
    try {
      const result = await extractParagraphs(uploadResult.filePath, start, end, 20);
      setParagraphsResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extract failed");
    } finally {
      setExtracting(false);
    }
  };

  const tBooks = {
    upload: "Upload PDF / TXT / MD",
    uploading: "Analyzing...",
    selectFile: "Select PDF file",
    loaded: "PDF loaded",
    pages: "pages",
    outline: "Outline",
    noOutline: "No bookmarks found — use manual page range extraction.",
    extract: "Extract Text",
    extracting: "Extracting...",
    paragraphs: "paragraphs",
    noContent: "No paragraphs found.",
    startPage: "Start Page",
    endPage: "End Page",
    manual: "Manual Extraction",
    selectNode: "Click a chapter/section to see its content range.",
    aiGenerate: "AI Generate",
    aiGenerating: "Generating...",
    aiCards: "AI-generated cards",
    aiAddToFeed: "Add to Feed",
    aiAdded: "Added",
    dismiss: "Dismiss",
    edit: "Edit",
    save: "Save",
    cancel: "Cancel",
  };

  const tBooksRu = {
    upload: "Загрузить PDF",
    uploading: "Анализ...",
    selectFile: "Выберите PDF",
    loaded: "PDF загружен",
    pages: "страниц",
    outline: "Оглавление",
    noOutline: "Закладки не найдены — используйте ручной выбор диапазона.",
    extract: "Извлечь текст",
    extracting: "Извлечение...",
    paragraphs: "абзацев",
    noContent: "Абзацы не найдены.",
    startPage: "Страница с",
    endPage: "Страница по",
    manual: "Ручное извлечение",
    selectNode: "Нажмите на раздел, чтобы увидеть диапазон страниц.",
    aiGenerate: "ИИ-генерация",
    aiGenerating: "Генерация...",
    aiCards: "Карточки от ИИ",
    aiAddToFeed: "В ленту",
    aiAdded: "Добавлено",
    dismiss: "Скрыть",
    edit: "Редактировать",
    save: "Сохранить",
    cancel: "Отмена",
  };

  const handleUrlUpload = async () => {
    if (!urlInput.trim()) return;
    setUploadingUrl(true);
    setError(null);
    try {
      const result = await uploadBookFromUrl(urlInput.trim());
      setUploadResult(result);
      setUrlInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "URL upload failed");
    } finally {
      setUploadingUrl(false);
    }
  };

  const isRu = t.feed.loading.includes("Загрузка");
  const tBook = isRu ? tBooksRu : tBooks;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">📂 {tBook.upload}</h2>
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md"
            onChange={handleFileChange}
            className="flex-1 text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
          />
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <BookOpen size={16} />}
            {uploading ? tBook.uploading : tBook.upload}
          </button>
        </div>
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

        {/* URL upload */}
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
          <Link2 size={16} className="text-gray-400 flex-shrink-0" />
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder={isRu ? "https://…/book.pdf" : "https://…/book.pdf"}
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/30"
            onKeyDown={(e) => { if (e.key === 'Enter') handleUrlUpload(); }}
          />
          <button
            onClick={handleUrlUpload}
            disabled={!urlInput.trim() || uploadingUrl}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {uploadingUrl ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
            {isRu ? "Скачать" : "Fetch"}
          </button>
        </div>

        {uploadResult && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
            ✓ {tBook.loaded}: "{uploadResult.fileName}" — {uploadResult.pageCount} {tBook.pages}
          </div>
        )}
      </div>

      {uploadResult && uploadResult.outline.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <BookOpen size={18} /> {tBook.outline}
          </h3>
          <div className="max-h-96 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
            <OutlineTree nodes={uploadResult.outline} onNodeClick={handleNodeClick} selectedId={selectedNode?.node.id} onOpenInFeed={onOpenInFeed} />
          </div>
        </div>
      )}

      {uploadResult && uploadResult.outline.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
          {tBook.noOutline}
        </div>
      )}

      {uploadResult && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText size={18} /> {tBook.extract} {selectedNode && `(${selectedNode.node.title})`}
          </h3>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500">{tBook.startPage}:</label>
              <input
                type="number"
                min={1}
                max={uploadResult.pageCount}
                value={manualRange.start}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setManualRange((p) => ({ ...p, start: Number(e.target.value) }))}
                className="w-20 px-2 py-1.5 txt-gray-700 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500">{tBook.endPage}:</label>
              <input
                type="number"
                min={1}
                max={uploadResult.pageCount}
                value={manualRange.end}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setManualRange((p) => ({ ...p, end: Number(e.target.value) }))}
                className="w-20 px-2 py-1.5 txt-gray-700 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <button
              onClick={() => handleExtract(manualRange.start, manualRange.end)}
              disabled={extracting}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
            >
              {extracting ? <Loader2 size={16} className="animate-spin" /> : null}
              {extracting ? tBook.extracting : tBook.extract}
            </button>
          </div>
          {!selectedNode && !paragraphsResult && (
            <p className="text-sm text-gray-400">{tBook.selectNode}</p>
          )}
        </div>
      )}

      {extracting && (
        <div className="flex justify-center py-6">
          <Loader2 size={24} className="animate-spin text-indigo-600" />
        </div>
      )}

      {paragraphsResult && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Found {paragraphsResult.count} paragraphs ({selectedNode ? `pages ${selectedNode.node.pageNumber}-${selectedNode.node.endPage}` : `pages ${manualRange.start}-${manualRange.end}`})
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">{isRu ? "Язык карточек:" : "Card language:"}</span>
              <button
                onClick={() => setCardLanguage(cardLanguage === "en" ? "ru" : "en")}
                className={`px-3 py-1 text-xs font-bold rounded-full transition-colors ${
                  cardLanguage === "en"
                    ? "bg-indigo-600 text-white"
                    : "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                }`}
              >
                {cardLanguage === "en" ? "EN" : "RU"}
              </button>
              <button
                onClick={handleGenerateAll}
                disabled={batchGenerating || paragraphsResult.paragraphs.every((p) => p.text.length < 50)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 bg-violet-600 text-white hover:bg-violet-700"
              >
                {batchGenerating ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    {batchProgress
                      ? `${batchProgress.done}/${batchProgress.total}`
                      : (isRu ? "Генерация..." : "Generating...")}
                  </>
                ) : (
                  <>
                    <Sparkles size={12} />
                    {isRu ? "Сгенерировать всё" : "Generate All"}
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
            {paragraphsResult.paragraphs.map((p) => (
              <div key={p.index} className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-gray-400">#{p.index} · Page {p.pageNumber} · {p.text.length} chars</span>
                    <p className="text-sm text-gray-700 mt-1 line-clamp-6">{p.text}</p>
                  </div>
                  <div className="flex-shrink-0 flex flex-col gap-2">
                    <button
                      onClick={() => handleGenerateAi(p.index, p.text)}
                      disabled={generatingFor.has(p.index) || p.text.length < 50}
                      title={p.text.length < 50 ? "Paragraph too short for AI" : undefined}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-violet-600 text-white hover:bg-violet-700"
                    >
                      {generatingFor.has(p.index) ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          {tBook.aiGenerating}
                        </>
                      ) : (
                        <>
                          <Sparkles size={14} />
                          {tBook.aiGenerate}
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleAddCard(p.index, p.text)}
                      disabled={createCardMutation.isPending || addedParagraphs.has(p.index)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      {addedParagraphs.has(p.index) ? (
                        <>
                          <span className="text-green-200">✓</span>
                          {isRu ? "Добавлено" : "Added"}
                        </>
                      ) : (
                        <>
                          <Plus size={14} />
                          {cardLanguage === "ru" ? "+ Карточка" : "+ Card"}
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {aiCards.filter((a) => a.paragraphIndex === p.index).length > 0 && (
                  <div className="mt-3 space-y-2 border-t border-gray-200 pt-3">
                    <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide">
                      ✨ {tBook.aiCards}
                    </p>
                    {aiCards
                      .filter((a) => a.paragraphIndex === p.index)
                      .map((item) => (
                        <AiCardPreview
                          key={item.key}
                          item={item}
                          editing={editingCard[item.key]}
                          added={addedAiCards.has(item.key)}
                          pending={createCardMutation.isPending}
                          tBook={tBook}
                          onStartEdit={() => startEditCard(item)}
                          onCancelEdit={() => cancelEditCard(item.key)}
                          onSaveEdit={() => saveEditCard(item.key)}
                          onChangeEditing={(card) => setEditingCard((prev) => ({ ...prev, [item.key]: card }))}
                          onAdd={() => handleAddAiCard(item)}
                          onDismiss={() => handleDismissAiCard(item.key)}
                        />
                      ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OutlineTree({ nodes, onNodeClick, selectedId, onOpenInFeed }: {
  nodes: OutlineNode[];
  onNodeClick: (node: OutlineNode) => void;
  selectedId?: string;
  onOpenInFeed?: (category: string) => void;
}) {
  return (
    <div className="divide-y divide-gray-100">
      {nodes.map((node) => (
        <OutlineTreeNode key={node.id} node={node} onNodeClick={onNodeClick} selectedId={selectedId} onOpenInFeed={onOpenInFeed} />
      ))}
    </div>
  );
}

function OutlineTreeNode({ node, onNodeClick, selectedId, onOpenInFeed }: {
  node: OutlineNode;
  onNodeClick: (node: OutlineNode) => void;
  selectedId?: string;
  onOpenInFeed?: (category: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;

  const indent = node.level * 20;

  return (
    <>
      <button
        onClick={() => onNodeClick(node)}
        className={`w-full text-left flex items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-indigo-50 ${
          isSelected ? "bg-indigo-50 border-l-2 border-indigo-500" : ""
        }`}
        style={{ paddingLeft: `${16 + indent}px` }}
      >
        {hasChildren ? (
          <button
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              setOpen(!open);
            }}
            className="text-gray-400 hover:text-gray-600"
          >
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        ) : (
          <span className="w-6" />
        )}
        <span className={`font-medium ${isSelected ? "text-indigo-700" : "text-gray-700"}`}>
          {node.title}
        </span>
        <span className="text-xs text-gray-400 ml-auto">
          p{node.pageNumber}{node.endPage > node.pageNumber ? `-${node.endPage}` : ""}
        </span>
        {onOpenInFeed && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenInFeed(nodeTitleToCategory(node.title));
            }}
            className="ml-1 p-1 text-indigo-500 hover:bg-indigo-50 rounded transition-colors flex-shrink-0"
            title="View chapter feed"
          >
            <BookCopy size={14} />
          </button>
        )}
      </button>
      {hasChildren && open && (
        <div className="border-l border-gray-100" style={{ marginLeft: `${16 + indent}px` }}>
          <OutlineTree nodes={node.children} onNodeClick={onNodeClick} selectedId={selectedId} onOpenInFeed={onOpenInFeed} />
        </div>
      )}
    </>
  );
}

interface AiCardPreviewProps {
  item: AiCardItem;
  editing?: GeneratedCard;
  added: boolean;
  pending: boolean;
  tBook: Record<string, string>;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onChangeEditing: (card: GeneratedCard) => void;
  onAdd: () => void;
  onDismiss: () => void;
}

function AiCardPreview({
  item, editing, added, pending, tBook,
  onStartEdit, onCancelEdit, onSaveEdit, onChangeEditing, onAdd, onDismiss,
}: AiCardPreviewProps) {
  const card = editing ?? item.card;
  const isEditing = !!editing;

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-lg p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-violet-200 text-violet-800">
              {card.type}
            </span>
            {isEditing ? (
              <input
                value={card.title}
                onChange={(e) => onChangeEditing({ ...editing!, title: e.target.value })}
                className="flex-1 min-w-0 px-2 py-1 text-sm font-semibold border border-violet-300 rounded bg-white"
              />
            ) : (
              <span className="text-sm font-semibold text-gray-900">{card.title}</span>
            )}
          </div>
          {isEditing ? (
            <textarea
              value={card.content}
              onChange={(e) => onChangeEditing({ ...editing!, content: e.target.value })}
              rows={3}
              className="w-full mt-2 px-2 py-1 text-xs text-gray-700 border border-violet-300 rounded bg-white"
            />
          ) : (
            <p className="text-sm text-gray-600 mt-1">{card.content}</p>
          )}
          {card.quizOptions && card.quizOptions.length > 0 && !isEditing && (
            <ul className="mt-2 space-y-1">
              {card.quizOptions.map((opt) => (
                <li key={opt.id} className="text-xs text-gray-600 flex items-center gap-1.5">
                  <span className={`inline-block w-2 h-2 rounded-full ${opt.isCorrect ? "bg-green-500" : "bg-gray-300"}`} />
                  {opt.text}
                </li>
              ))}
            </ul>
          )}
          {card.codeSnippet && !isEditing && (
            <pre className="mt-2 p-2 bg-gray-900 text-gray-100 text-xs rounded-md overflow-x-auto max-h-32">
              {card.codeSnippet}
            </pre>
          )}
        </div>
        <div className="flex-shrink-0 flex flex-col gap-1.5">
          {isEditing ? (
            <>
              <button onClick={onSaveEdit} className="px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700">
                {tBook.save}
              </button>
              <button onClick={onCancelEdit} className="px-2.5 py-1 rounded-md text-xs font-medium text-gray-500 hover:bg-gray-200">
                {tBook.cancel}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onAdd}
                disabled={pending || added}
                className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-50 bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {added ? `✓ ${tBook.aiAdded}` : tBook.aiAddToFeed}
              </button>
              <button
                onClick={onStartEdit}
                disabled={added}
                className="flex items-center justify-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-violet-600 hover:bg-violet-100 disabled:opacity-50"
              >
                <Pencil size={12} />
                {tBook.edit}
              </button>
              <button
                onClick={onDismiss}
                className="flex items-center justify-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-gray-500 hover:bg-gray-200"
              >
                <X size={12} />
                {tBook.dismiss}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
