import { useEffect, useState } from "react";
import { userApi } from "./api/auth";
import { fetchModels, modelLabel } from "./api/models";
import { useAuth } from "./AuthContext";
import { useLanguage } from "./i18n/LanguageContext";
import { Key, Loader2, Save, Languages, Infinity, FileText, RotateCcw, Cpu, X } from "lucide-react";

interface Props {
  // empty
}

// Fallback if /api/models is unreachable
const FALLBACK_MODELS: string[] = ["moonshotai/Kimi-K2.6-TEE"];

export default function SettingsPage(_props: Props) {
  const { user, refresh } = useAuth();
  const { lang, setLang } = useLanguage();
  const [apiKey, setApiKey] = useState("");
  const [pageSize, setPageSize] = useState(user?.pageSize ?? 10);
  const [promptOverride, setPromptOverride] = useState("");
  const [model, setModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>(FALLBACK_MODELS);
  const [modelsLoading, setModelsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      setPageSize(user.pageSize);
      setLang(user.defaultLanguage);
      setModel(user.model ?? "");
      // PromptOverride is not returned by /me; leave blank for privacy; user can re-paste to replace
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Fetch live model list from Chutes (via backend proxy)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchModels();
        if (!cancelled && list.length > 0) setModels(list.map((m) => m.id));
      } catch {
        // keep fallback
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await userApi.saveAll({
        apiKey: apiKey || null,
        promptOverride: promptOverride || null,
        defaultLanguage: lang,
        pageSize,
        model: model || "",
      });
      await refresh();
      setMsg(lang === "ru" ? "Сохранено" : "Saved");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleResetPrompt = () => {
    setPromptOverride("");
  };

  const handleResetModel = () => {
    setModel("");
  };

  if (!user) return null;

  const defaultPromptInsertText = lang === "ru"
    ? 'Оставьте пустым, чтобы использовать встроенный промпт. Используйте {text} в качестве метки для замены на текст книги.'
    : 'Leave empty to use the built-in prompt. Use {text} placeholder where book text should go.';

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">
        {lang === "ru" ? "Настройки" : "Settings"}
      </h2>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
            <Key size={16} className="text-indigo-600" />
            {lang === "ru" ? "Ключ Chutes AI" : "Chutes AI API key"}
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={user.hasApiKey ? (lang === "ru" ? "••• (уже сохранён)" : "••• (saved — leave blank to keep)") : "cpk_..."}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            {lang === "ru"
              ? "Приоритетнее глобального ключа из конфига. Используется для генерации карточек."
              : "Used instead of the global key from server config when generating cards."}
          </p>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
            <FileText size={16} className="text-indigo-600" />
            {lang === "ru" ? "Свой LLM промпт (опционально)" : "Custom LLM prompt (optional)"}
          </label>
          <textarea
            value={promptOverride}
            onChange={(e) => setPromptOverride(e.target.value)}
            rows={6}
            placeholder={lang === "ru"
              ? "Пример:\nТы — фокус-ассистент. Извлекай факты из текста и возвращай СТРОГО JSON-массив. Используй {text} как метку."
              : "Example:\nYou are a focused assistant. Extract facts from the text and return ONLY a JSON array. Use {text} as a placeholder."}
            className="w-full px-3 py-2 text-xs font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
          />
          <p className="text-xs text-gray-500 mt-1">
            {defaultPromptInsertText}
            {promptOverride && (
              <button
                onClick={handleResetPrompt}
                className="ml-2 inline-flex items-center gap-1 text-indigo-600 hover:underline"
              >
                <RotateCcw size={11} />
                {lang === "ru" ? "Сбросить на встроенный" : "Reset to built-in"}
              </button>
            )}
          </p>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
            <Cpu size={16} className="text-indigo-600" />
            {lang === "ru" ? "Модель Chutes" : "Chutes model"}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={lang === "ru" ? "По умолчанию: moonshotai/Kimi-K2.6-TEE" : "Default: moonshotai/Kimi-K2.6-TEE"}
              className="flex-1 px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {model && (
              <button
                onClick={handleResetModel}
                title={lang === "ru" ? "Сбросить на умолчание" : "Reset to default"}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {modelsLoading ? (
              <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                <Loader2 size={12} className="animate-spin" />
                {lang === "ru" ? "Загрузка моделей…" : "Loading models…"}
              </span>
            ) : (
              models.map((id) => (
                <button
                  key={id}
                  onClick={() => setModel(id)}
                  className={`px-2.5 py-1 text-[11px] font-mono rounded-md border transition-colors ${
                    model === id
                      ? "bg-indigo-600 border-indigo-600 text-white"
                      : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                  title={id}
                >
                  {modelLabel(id)}
                </button>
              ))
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1.5">
            {lang === "ru"
              ? "Пусто = глобальная модель из конфига сервера. Любое значение здесь переопределяет её для ваших карточек."
              : "Empty = global model from server config. Any value here overrides it for your card generations."}
          </p>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
            <Languages size={16} className="text-indigo-600" />
            {lang === "ru" ? "Язык интерфейса" : "Interface language"}
          </label>
          <div className="flex gap-2">
            {(["en", "ru"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-4 py-2 text-xs font-bold rounded-lg border transition-colors ${
                  lang === l
                    ? "bg-indigo-600 border-indigo-600 text-white"
                    : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {l === "en" ? "English" : "Русский"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
            <Infinity size={16} className="text-indigo-600" />
            {lang === "ru" ? "Карточек на странице" : "Cards per page"}
          </label>
          <div className="flex gap-2">
            {[5, 10, 20, 30].map((n) => (
              <button
                key={n}
                onClick={() => setPageSize(n)}
                className={`px-4 py-2 text-xs font-bold rounded-lg border transition-colors ${
                  pageSize === n
                    ? "bg-indigo-600 border-indigo-600 text-white"
                    : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-3 border-t border-gray-100 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {lang === "ru" ? "Сохранить" : "Save"}
          </button>
          {msg && <span className="text-sm text-gray-600">{msg}</span>}
        </div>
      </div>
    </div>
  );
}
