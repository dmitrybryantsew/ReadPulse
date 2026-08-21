import { useEffect, useState } from "react";
import { adminApi, type AdminUser, type AdminStats } from "./api/auth";
import { useLanguage } from "./i18n/LanguageContext";
import { Loader2 } from "lucide-react";

export default function AdminPage() {
  const { lang } = useLanguage();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([adminApi.listUsers(), adminApi.getStats()])
      .then(([u, s]) => { setUsers(u); setStats(s); })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const handleToggleActive = async (u: AdminUser) => {
    const res = await adminApi.updateUser(u.id, { isActive: !u.isActive });
    if (res.ok) {
      setUsers(users.map(x => x.id === u.id ? { ...x, isActive: !x.isActive } : x));
    }
  };

  const handleToggleRole = async (u: AdminUser) => {
    const newRole = u.role === "admin" ? "user" : "admin";
    const res = await adminApi.updateUser(u.id, { role: newRole });
    if (res.ok) {
      setUsers(users.map(x => x.id === u.id ? { ...x, role: newRole } : x));
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-indigo-600" /></div>;
  if (error) return <p className="text-red-600 p-6">{error}</p>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">
        {lang === "ru" ? "Админ-панель" : "Admin Panel"}
      </h2>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label={lang === "ru" ? "Пользователи" : "Users"} value={stats.totalUsers} />
          <Stat label={lang === "ru" ? "Активные" : "Active"} value={stats.activeUsers} />
          <Stat label={lang === "ru" ? "Карточки" : "Posts"} value={stats.totalPosts} />
          <Stat label={lang === "ru" ? "Книги" : "Books"} value={stats.totalBooks} />
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">{lang === "ru" ? "Пользователь" : "User"}</th>
              <th className="px-4 py-3 text-left">{lang === "ru" ? "Роль" : "Role"}</th>
              <th className="px-4 py-3 text-left">{lang === "ru" ? "Карточки" : "Posts"}</th>
              <th className="px-4 py-3 text-left">{lang === "ru" ? "Ключ" : "API key"}</th>
              <th className="px-4 py-3 text-left">{lang === "ru" ? "Действия" : "Actions"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-gray-900">{u.name}</p>
                    <p className="text-xs text-gray-500">{u.email}</p>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase rounded ${
                    u.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"
                  }`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{u.postCount}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs ${u.hasApiKey ? "text-green-600" : "text-gray-400"}`}>
                    {u.hasApiKey ? "✓" : "—"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleToggleRole(u)}
                      className="px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded"
                    >
                      {u.role === "admin" ? "Demote" : "Promote"}
                    </button>
                    <button
                      onClick={() => handleToggleActive(u)}
                      className={`px-2 py-1 text-xs font-medium rounded ${
                        u.isActive ? "text-red-600 hover:bg-red-50" : "text-green-600 hover:bg-green-50"
                      }`}
                    >
                      {u.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <p className="text-xs uppercase tracking-wider text-gray-500 font-medium">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}
