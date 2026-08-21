import { useState } from "react";
import type { Post } from "../types/post";
import { BookCopy, Bookmark, ClipboardCheck, ClipboardList, Hash, Pencil, Trash2 } from "lucide-react";
import { Highlight, themes } from "prism-react-renderer";
import { useLanguage } from "../i18n/LanguageContext";
import { toggleSavePost } from "../api/posts";

interface Props {
  post: Post;
  onSave?: (id: number, data: { title: string; content: string; category: string; tags: string[] }) => void;
  onDelete?: (id: number) => void;
  onTagClick?: (tag: string) => void;
}

export default function PostCard({ post, onSave, onDelete, onTagClick }: Props) {
  const { t, lang } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [isSaved, setIsSaved] = useState(post.isSaved ?? false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(post.title);
  const [editContent, setEditContent] = useState(post.content);
  const [editCategory, setEditCategory] = useState(post.category);
  const [editTags, setEditTags] = useState(post.tags?.join(", ") ?? "");

  const handleCopy = () => {
    if (!post.codeSnippet) return;
    navigator.clipboard.writeText(post.codeSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBookmark = async () => {
    try {
      const result = await toggleSavePost(post.id);
      setIsSaved(result.saved);
    } catch (e) {
      // ignore — maybe not authenticated
    }
  };

  const startEdit = () => {
    setEditTitle(post.title);
    setEditContent(post.content);
    setEditCategory(post.category);
    setEditTags(post.tags?.join(", ") ?? "");
    setEditing(true);
  };

  const handleSave = () => {
    if (!onSave) { setEditing(false); return; }
    onSave(post.id, {
      title: editTitle,
      content: editContent,
      category: editCategory,
      tags: editTags.split(",").map(s => s.trim()).filter(Boolean),
    });
    setEditing(false);
  };

  return (
    <article className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center">
            <BookCopy size={20} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{post.bookTitle || "ReadPulse"}</p>
            <p className="text-xs text-gray-500">{post.bookAuthor || t.card.unknownAuthor}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 bg-indigo-50 px-2 py-1 rounded">
            {t.card.categoryLabel(post.category)}
          </span>
          <button
            onClick={handleBookmark}
            className={`p-1.5 rounded-md transition-colors ${
              isSaved ? "text-indigo-600 bg-indigo-50" : "text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
            }`}
            title={isSaved ? (lang === "ru" ? "Убрать из сохранённых" : "Unsave") : (lang === "ru" ? "Сохранить" : "Save for later")}
          >
            <Bookmark size={14} fill={isSaved ? "currentColor" : "none"} />
          </button>
          <button
            onClick={startEdit}
            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
            title={lang === "ru" ? "Редактировать" : "Edit"}
          >
            <Pencil size={14} />
          </button>
          {onDelete && (
            <button
              onClick={() => {
                if (window.confirm(lang === "ru" ? "Удалить карточку?" : "Delete this card?")) {
                  onDelete(post.id);
                }
              }}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
              title={lang === "ru" ? "Удалить" : "Delete"}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {editing ? (
        <div className="space-y-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full px-3 py-2 text-sm font-semibold border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Title"
          />
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={5}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
            placeholder="Content"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
              className="px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="category (e.g. clean-code)"
            />
            <input
              value={editTags}
              onChange={(e) => setEditTags(e.target.value)}
              className="px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="tags, comma, separated"
            />
          </div>
          <div className="flex gap-2 text-xs">
            <button
              onClick={handleSave}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium"
            >
              {lang === "ru" ? "Сохранить" : "Save"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
            >
              {lang === "ru" ? "Отмена" : "Cancel"}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{post.title}</h3>

          {post.type === "quiz" ? (
            <QuizBody post={post} />
          ) : (
            <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">{post.content}</p>
          )}

          {post.codeSnippet && (
            <div className="mt-4 bg-gray-900 rounded-lg overflow-hidden border border-gray-800 relative group">
              <div className="absolute top-2 right-2 z-10">
                <button
                  onClick={handleCopy}
                  className="p-2 text-gray-400 hover:text-white bg-gray-800 rounded-md transition-colors"
                  title={t.card.copyTitle}
                >
                  {copied ? <ClipboardCheck size={16} className="text-green-400" /> : <ClipboardList size={16} />}
                </button>
              </div>
              <Highlight code={post.codeSnippet} language={post.codeLanguage ?? "csharp"} theme={themes.vsDark}>
                {({ className, style, tokens, getLineProps, getTokenProps }) => (
                  <pre className={`${className} p-4 text-sm overflow-x-auto`} style={style}>
                    {tokens.map((line, i) => (
                      <div key={i} {...getLineProps({ line })}>
                        {line.map((token, key) => (
                          <span key={key} {...getTokenProps({ token })} />
                        ))}
                      </div>
                    ))}
                  </pre>
                )}
              </Highlight>
            </div>
          )}

          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {post.tags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => onTagClick?.(tag)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600 bg-gray-100 hover:bg-indigo-50 hover:text-indigo-700 px-2 py-0.5 rounded-full transition-colors cursor-pointer"
                >
                  <Hash size={10} />
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-end pt-3 border-t border-gray-100">
        <span
          className={`text-[10px] uppercase font-bold tracking-wide px-2 py-1 rounded ${
            post.type === "quiz"
              ? "bg-amber-100 text-amber-800"
              : post.type === "action_code"
              ? "bg-emerald-100 text-emerald-800"
              : "bg-indigo-100 text-indigo-700"
          }`}
        >
          {post.type}
        </span>
      </div>
    </article>
  );
}

function QuizBody({ post }: { post: Post }) {
  const { t } = useLanguage();
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  const handleSelect = (optId: string) => {
    setSelected(optId);
    setRevealed(true);
  };

  return (
    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-2">
      {post.quizOptions?.map((opt, idx) => {
        const isCorrect = opt.isCorrect;
        const isSelected = selected === opt.id;

        let styleClass = "w-full text-left px-4 py-2.5 rounded-md text-sm font-medium transition-all ";

        if (!revealed) {
          styleClass += "bg-white hover:bg-gray-100 text-gray-700 border border-gray-200";
        } else {
          if (isCorrect) {
            styleClass += "bg-green-100 text-green-800 border border-green-200";
          } else if (isSelected) {
            styleClass += "bg-red-100 text-red-800 border border-red-200";
          } else {
            styleClass += "bg-gray-100 text-gray-400 border border-transparent";
          }
        }

        return (
          <button
            key={idx}
            onClick={() => handleSelect(opt.id)}
            className={styleClass}
            disabled={revealed}
          >
            {opt.text}
          </button>
        );
      })}

      {revealed && (
        <div className="mt-2 text-xs text-gray-500 italic pl-1">
          {t.card.explanation}: {post.quizOptions?.find((o) => o.id === selected)?.explanation || t.card.explanationFallback}
        </div>
      )}
    </div>
  );
}
