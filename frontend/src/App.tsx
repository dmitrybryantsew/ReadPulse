import Feed from "./Feed";
import BooksPage from "./BooksPage";
import AuthPage from "./AuthPage";
import SettingsPage from "./SettingsPage";
import AdminPage from "./AdminPage";
import SearchPalette from "./SearchPalette";
import { useCallback, useEffect, useState } from "react";
import { LanguageProvider, useLanguage } from "./i18n/LanguageContext";
import { AuthProvider, useAuth } from "./AuthContext";
import type { Language, Post } from "./types/post";
import { BookOpen, LayoutGrid, LogOut, Search, Settings, Shield, User } from "lucide-react";

function LanguageSwitcher() {
  const { lang, setLang } = useLanguage();
  const options: { code: Language; label: string }[] = [
    { code: "en", label: "EN" },
    { code: "ru", label: "RU" },
  ];
  return (
    <div className="flex items-center gap-1 bg-indigo-500/30 rounded-lg p-1">
      {options.map((opt) => (
        <button
          key={opt.code}
          onClick={() => setLang(opt.code)}
          className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors ${
            lang === opt.code
              ? "bg-white text-indigo-700"
              : "text-indigo-100 hover:bg-indigo-500/50"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

type Page = "feed" | "books" | "settings" | "admin";

function UserMenu({ user, onNavigate, onLogout }: {
  user: { name: string; role: string; email: string };
  onNavigate: (p: Page) => void;
  onLogout: () => Promise<void>;
}) {
  const { lang } = useLanguage();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-indigo-500/30 text-white hover:bg-white/20 transition-colors"
      >
        <User size={16} />
        <span className="max-w-[140px] truncate">{user.name}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 p-2 z-50">
            <div className="px-3 py-2 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-900">{user.name}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
              {user.role === "admin" && (
                <p className="text-[10px] uppercase tracking-wider text-indigo-600 font-bold mt-1">
                  {lang === "ru" ? "Админ" : "Admin"}
                </p>
              )}
            </div>
            <MenuItem icon={<Settings size={14} />} label={lang === "ru" ? "Настройки" : "Settings"} onClick={() => { onNavigate("settings"); setOpen(false); }} />
            {user.role === "admin" && (
              <MenuItem icon={<Shield size={14} />} label={lang === "ru" ? "Админ-панель" : "Admin Panel"} onClick={() => { onNavigate("admin"); setOpen(false); }} />
            )}
            <div className="border-t border-gray-100 mt-1 pt-1">
              <MenuItem
                icon={<LogOut size={14} />}
                label={lang === "ru" ? "Выйти" : "Log out"}
                onClick={() => { onLogout(); setOpen(false); }}
                danger
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors ${
        danger ? "text-red-600 hover:bg-red-50" : "text-gray-700 hover:bg-gray-100"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function AppBody() {
  const { t, lang } = useLanguage();
  const { user, loading, logout } = useAuth();
  const [page, setPage] = useState<Page>("feed");
  const [feedCategory, setFeedCategory] = useState<string | undefined>(undefined);
  const [searchOpen, setSearchOpen] = useState(false);
  const [feedTag, setFeedTag] = useState<string | undefined>(undefined);

  const openBookInFeed = (category: string) => {
    setFeedCategory(category);
    setFeedTag(undefined);
    setPage("feed");
  };

  // Ctrl+K to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handlePostSelect = useCallback((p: Post) => {
    // Snap feed to that category so user lands near the card
    setFeedCategory(p.category);
    setPage("feed");
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">{t.feed.loading}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-indigo-600 text-white shadow-sm">
          <div className="max-w-3xl mx-auto px-4 py-5">
            <h1 className="text-xl font-bold tracking-tight">📚 ReadPulse</h1>
            <p className="text-indigo-200 text-sm mt-0.5">{t.header.tagline}</p>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 py-8">
          <AuthPage />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <header className="bg-indigo-600 text-white shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">📚 ReadPulse</h1>
            <p className="text-indigo-200 text-sm mt-0.5">{t.header.tagline}</p>
          </div>

          {/* Inline search bar (desktop) */}
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-indigo-500/40 hover:bg-indigo-500/60 rounded-lg text-indigo-100 text-sm transition-colors min-w-[220px]"
          >
            <Search size={14} />
            <span className="flex-1 text-left text-indigo-100/80">
              {lang === "ru" ? "Поиск…" : "Search…"}
            </span>
            <kbd className="text-[10px] bg-indigo-700/50 border border-indigo-400/30 rounded px-1 py-0.5 font-mono">
              ⌘K
            </kbd>
          </button>

          <div className="flex items-center gap-3">
            {/* Mobile search button */}
            <button
              onClick={() => setSearchOpen(true)}
              className="md:hidden p-2 bg-indigo-500/40 hover:bg-indigo-500/60 rounded-lg text-indigo-100"
            >
              <Search size={16} />
            </button>
            <div className="flex items-center gap-1 bg-indigo-500/30 rounded-lg p-1">
              <NavButton
                icon={<LayoutGrid size={16} />}
                label="Feed"
                active={page === "feed"}
                onClick={() => setPage("feed")}
              />
              <NavButton
                icon={<BookOpen size={16} />}
                label={lang === "ru" ? "Книги" : "Books"}
                active={page === "books"}
                onClick={() => setPage("books")}
              />
            </div>
            <LanguageSwitcher />
            <UserMenu user={user} onNavigate={setPage} onLogout={logout} />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 md:py-12">
        {page === "feed" && (
          <Feed
            presetCategory={feedCategory}
            presetTag={feedTag}
            onClearPreset={() => {
              setFeedCategory(undefined);
              setFeedTag(undefined);
            }}
          />
        )}
        {page === "books" && <BooksPage onOpenInFeed={openBookInFeed} />}
        {page === "settings" && <SettingsPage />}
        {page === "admin" && user.role === "admin" && <AdminPage />}
        {page === "admin" && user.role !== "admin" && (
          <p className="text-gray-500 text-sm">Access denied.</p>
        )}
      </main>

      <footer className="text-center text-gray-400 text-xs py-10 border-t border-gray-200">
        Powered by ReadPulse API
      </footer>

      <SearchPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        lang={lang}
        onSelectPost={handlePostSelect}
      />
    </div>
  );
}

function NavButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
        active ? "bg-white text-indigo-700" : "text-indigo-100 hover:bg-indigo-500/50"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AppBody />
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;
