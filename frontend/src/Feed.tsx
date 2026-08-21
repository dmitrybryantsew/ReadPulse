import { useCallback, useEffect, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useInView } from "react-intersection-observer";
import { deletePost, fetchCategories, fetchPosts, updatePost, type CreatePostData } from "./api/posts";
import PostCard from "./components/PostCard";
import { BookCopy, Hash, LayoutGrid, Loader2, X } from "lucide-react";
import { useLanguage } from "./i18n/LanguageContext";

const PAGE_SIZE = 10;

export default function Feed({ presetCategory, presetTag, onClearPreset }: {
  presetCategory?: string;
  presetTag?: string;
  onClearPreset?: () => void;
}) {
  const { lang, t } = useLanguage();
  const queryClient = useQueryClient();
  const { ref: sentinelRef, inView } = useInView();
  const [category, setCategory] = useState<string | undefined>(presetCategory);
  const [type, setType] = useState<string | undefined>(undefined);
  const [searchQ, setSearchQ] = useState<string>("");
  const [groupByBook, setGroupByBook] = useState(false);

  // Sync incoming presets from BooksPage "View in feed" or tag clicks
  useEffect(() => {
    if (presetCategory !== undefined) setCategory(presetCategory);
  }, [presetCategory]);
  useEffect(() => {
    if (presetTag !== undefined) setSearchQ(presetTag);
  }, [presetTag]);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    staleTime: 30_000,
  });

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ["posts", lang, category ?? "all", type ?? "all", searchQ || "all"],
    queryFn: ({ pageParam = 1 }) => fetchPosts(pageParam, PAGE_SIZE, category, type, lang, searchQ || undefined),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<CreatePostData> }) =>
      updatePost(id, data),
    onSuccess: (updated) => {
      queryClient.setQueriesData({ queryKey: ["posts"] }, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            items: page.items.map((p: any) => (p.id === updated.id ? updated : p)),
          })),
        };
      });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deletePost,
    onSuccess: (_, id) => {
      // remove deleted post from all cached "posts" pages
      queryClient.setQueriesData({ queryKey: ["posts"] }, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            items: page.items.filter((p: any) => p.id !== id),
          })),
        };
      });
      // refresh categories (may have lost a category entirely)
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });

  const handleSave = useCallback((id: number, data: Partial<CreatePostData>) => {
    updateMutation.mutate({ id, data });
  }, [updateMutation]);

  const handleDelete = useCallback((id: number) => {
    deleteMutation.mutate(id);
  }, [deleteMutation]);

  const handleTagClick = useCallback((tagName: string) => {
    setSearchQ(tagName);
    setCategory(undefined);
  }, []);

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <p className="text-gray-500 text-sm">{t.feed.loading}</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-20">
        <p className="text-red-500 font-medium">{t.feed.error}</p>
        <p className="text-gray-400 text-sm mt-1">{t.feed.errorHint}</p>
      </div>
    );
  }

  const posts = data?.pages.flatMap((page) => page.items) ?? [];

  const typeOpts = [
    { value: undefined, label: t.filters?.typeAll ?? "All types" },
    { value: "insight", label: t.filters?.typeInsight ?? "Insights" },
    { value: "quiz", label: t.filters?.typeQuiz ?? "Quizzes" },
    { value: "action_code", label: t.filters?.typeCode ?? "Code" },
  ];

  const hasFilter = category !== undefined || type !== undefined || searchQ !== "";

  return (
    <div className="space-y-4">
      {/* Book hero when a book category is preset (i.e. arrived from Books page) */}
      {presetCategory && (
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl shadow-md p-5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 p-2 bg-white/20 rounded-lg">
              <BookCopy size={20} />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-indigo-100 font-semibold">
                {lang === "ru" ? "Лента книги" : "Book feed"}
              </p>
              <h2 className="text-lg font-bold mt-0.5 leading-snug">
                {presetCategory.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" ")}
              </h2>
              <p className="text-xs text-indigo-200 mt-1">
                {posts.length} {lang === "ru" ? "карточек" : "cards"} · {lang === "ru" ? "прокрути вниз чтобы читать" : "scroll to read"}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setCategory(undefined);
              onClearPreset?.();
            }}
            className="p-1.5 hover:bg-white/20 rounded-md transition-colors flex-shrink-0"
            title={lang === "ru" ? "Закрыть книгу" : "Close book view"}
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 flex flex-wrap items-center gap-2">
        <select
          value={category ?? "all"}
          onChange={(e) => setCategory(e.target.value === "all" ? undefined : e.target.value)}
          className="px-3 py-1.5 text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg text-gray-700 cursor-pointer"
        >
          <option value="all">{t.filters?.allCategories ?? "All categories"}</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {typeOpts.map((o) => (
            <button
              key={o.label}
              onClick={() => setType(o.value)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                type === o.value
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* Group-by-book toggle */}
        <button
          onClick={() => setGroupByBook((g) => !g)}
          title={lang === "ru" ? "Группировать по книгам" : "Group by book"}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
            groupByBook ? "bg-indigo-600 text-white" : "text-gray-500 hover:bg-gray-100"
          }`}
        >
          <LayoutGrid size={12} />
          <span className="hidden sm:inline">{lang === "ru" ? "Книги" : "Books"}</span>
        </button>

        {hasFilter && (
          <button
            onClick={() => {
              setCategory(undefined);
              setType(undefined);
              setSearchQ("");
              onClearPreset?.();
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X size={12} />
            {lang === "ru" ? "Сбросить" : "Clear"}
          </button>
        )}

        {/* Active search chip */}
        {searchQ && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-full border border-indigo-200">
            <Hash size={11} />
            {searchQ}
            <button
              onClick={() => setSearchQ("")}
              className="p-0.5 hover:bg-indigo-100 rounded transition-colors"
            >
              <X size={10} />
            </button>
          </div>
        )}
      </div>

      {posts.length === 0 && (
        <p className="text-center text-gray-400 text-sm py-8">
          {lang === "ru" ? "Нет постов по фильтру." : "No posts match the filter."}
        </p>
      )}

      {/* Grouped-by-book rendering */}
      {groupByBook ? (
        (() => {
          const groups = new Map<string, typeof posts>();
          for (const p of posts) {
            const key = p.bookTitle || "Other";
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(p);
          }
          return [...groups.entries()].map(([bookTitle, items]) => (
            <div key={bookTitle} className="mb-6">
              <div className="flex items-baseline gap-2 mb-3 px-1">
                <p className="text-xs uppercase tracking-wider font-bold text-indigo-600">
                  {bookTitle}
                </p>
                <span className="text-[10px] text-gray-400">·</span>
                <p className="text-xs text-gray-500">{items.length} {lang === "ru" ? "карточек" : "cards"}</p>
              </div>
              <div className="space-y-4">
                {items.map((post) => (
                  <PostCard key={post.id} post={post} onSave={handleSave} onDelete={handleDelete} onTagClick={handleTagClick} />
                ))}
              </div>
            </div>
          ));
        })()
      ) : (
        posts.map((post) => (
          <PostCard key={post.id} post={post} onSave={handleSave} onDelete={handleDelete} onTagClick={handleTagClick} />
        ))
      )}

      <div ref={sentinelRef} className="py-8 flex justify-center">
        {isFetchingNextPage ? (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{t.feed.loadingMore}</span>
          </div>
        ) : !hasNextPage && posts.length > 0 ? (
          <p className="text-gray-400 text-sm italic">{t.feed.end}</p>
        ) : null}
      </div>
    </div>
  );
}
