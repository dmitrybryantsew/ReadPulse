import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Loader2, Search } from "lucide-react";
import { searchPosts } from "./api/posts";
import type { Language, Post } from "./types/post";

interface Props {
  open: boolean;
  onClose: () => void;
  lang: Language;
  onSelectPost: (post: Post) => void;
}

export default function SearchPalette({ open, onClose, lang, onSelectPost }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setSelected(0);
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await searchPosts(query, lang, 20);
        setResults(result.items);
        setError(null);
        setSelected(0);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [query, lang]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected(s => Math.min(s + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected(s => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && results[selected]) {
      e.preventDefault();
      onSelectPost(results[selected]);
      onClose();
    }
  }, [open, results, selected, onClose, onSelectPost]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Also Ctrl+K / Cmd+K globally
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        onClose(); // toggle
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <Search size={18} className="text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={lang === "ru" ? "Поиск карточек…" : "Search cards, tags, categories…"}
            className="flex-1 outline-none text-lg bg-transparent placeholder:text-gray-400"
          />
          {loading && <Loader2 size={16} className="animate-spin text-indigo-600" />}
          <kbd className="text-[10px] font-mono text-gray-500 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        {/* Results */}
        {error ? (
          <div className="p-4 text-center text-red-500 text-sm">{error}</div>
        ) : results.length > 0 ? (
          <div className="max-h-[50vh] overflow-y-auto py-1">
            {results.map((post, idx) => (
              <div
                key={post.id}
                className={`px-4 py-2.5 cursor-pointer transition-colors flex items-center gap-3 ${
                  idx === selected ? "bg-indigo-50" : "hover:bg-gray-50"
                }`}
                onMouseEnter={() => setSelected(idx)}
                onClick={() => {
                  onSelectPost(post);
                  onClose();
                }}
              >
                <div className="w-7 h-7 bg-indigo-100 text-indigo-600 rounded flex items-center justify-center flex-shrink-0 text-xs font-bold">
                  {post.type === "quiz" ? "?" : post.type === "action_code" ? "</>" : "i"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{post.title}</p>
                  <p className="text-xs text-gray-500 truncate">{post.content.replace(/\n/g, " ").substring(0, 90)}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-indigo-600 font-medium uppercase tracking-wide">
                      {post.category.replace(/-/g, " ")}
                    </span>
                    {post.tags && post.tags.length > 0 && (
                      <>
                        <span className="text-gray-300">·</span>
                        {post.tags.slice(0, 3).map(t => (
                          <span key={t} className="text-[10px] text-gray-400">#{t}</span>
                        ))}
                      </>
                    )}
                  </div>
                </div>
                {idx === selected && <ArrowRight size={16} className="text-indigo-400 flex-shrink-0" />}
              </div>
            ))}
          </div>
        ) : query.trim() && !loading ? (
          <div className="p-6 text-center text-gray-400 text-sm italic">
            {lang === "ru" ? "Ничего не найдено" : "No results"}
          </div>
        ) : (
          <div className="p-6 text-center text-gray-400 text-sm italic">
            {lang === "ru" ? "Начните печатать" : "Start typing…"}
          </div>
        )}

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-[10px] text-gray-500">
          <div className="flex items-center gap-3">
            <span><kbd className="font-mono bg-white border border-gray-200 rounded px-1">↑</kbd><kbd className="font-mono bg-white border border-gray-200 rounded px-1">↓</kbd> navigate</span>
            <span><kbd className="font-mono bg-white border border-gray-200 rounded px-1">Enter</kbd> jump to</span>
          </div>
          <span>⌘K / Ctrl+K</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
