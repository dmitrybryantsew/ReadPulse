import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { LogIn, UserPlus } from "lucide-react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (el: HTMLElement, opts: any) => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID as string | undefined;
const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:5159";

type View = "login" | "register" | "forgot" | "reset";

export default function AuthPage() {
  const { login, register, loginWithGoogle } = useAuth();
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [devToken, setDevToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(null);
    setLoading(true);
    try {
      if (view === "login") {
        await login(email, password);
      } else if (view === "register") {
        await register(email, name, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(null);
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/auth/forgot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!r.ok) throw new Error(await r.text());
      const body = await r.json() as { ok: boolean; devToken?: string };
      setDevToken(body.devToken ?? null);
      setOk(body.devToken
        ? `Reset token (dev): ${body.devToken}. Check your email in production.`
        : "If this email exists, a reset link was sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setError(null);
    setOk(null);
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/auth/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token: resetToken, newPassword }),
      });
      if (!r.ok) throw new Error(await r.text());
      setOk("Password changed! Sign in with the new password.");
      setView("login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  // Google Sign-In button — load GSI script once inside this component
  const googleBtnRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const scriptId = "google-gsi-script";
    if (!document.getElementById(scriptId)) {
      const s = document.createElement("script");
      s.id = scriptId;
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
      s.onload = initGoogle;
    } else {
      initGoogle();
    }

    function initGoogle() {
      if (!window.google || !googleBtnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response: { credential: string }) => {
          try {
            await loginWithGoogle(response.credential);
            setError(null);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Google sign-in failed");
          }
        },
      });
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: "outline",
        size: "large",
        shape: "rectangular",
        text: "signin_with",
        width: "100%",
      });
    }
  }, [loginWithGoogle]);

  if (view === "forgot") {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Reset password</h2>
          <p className="text-sm text-gray-500 mb-6">Enter your email to get a reset token.</p>

          <form onSubmit={handleForgot} className="space-y-4">
            <input
              type="email" placeholder="Email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {devToken && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
                <p className="font-semibold mb-1">🔑 Dev-only token:</p>
                <code className="font-mono text-xs break-all">{devToken}</code>
              </div>
            )}
            {ok && !devToken && (
              <div className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg p-2.5">{ok}</div>
            )}
            {error && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">{error}</div>
            )}
            <button
              type="submit" disabled={loading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors text-sm"
            >
              {loading ? "…" : "Send reset token"}
            </button>
            {devToken && (
              <button
                type="button"
                onClick={() => setView("reset")}
                className="w-full py-2 text-sm text-indigo-600 hover:underline"
              >
                Continue to set new password →
              </button>
            )}
            <button
              type="button" onClick={() => { setView("login"); setError(null); setOk(null); setDevToken(null); }}
              className="w-full py-2 text-xs text-gray-500 hover:text-gray-700"
            >
              ← Back to sign in
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (view === "reset") {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Set new password</h2>
          <p className="text-sm text-gray-500 mb-6">Use the token from the previous step.</p>

          <form onSubmit={handleReset} className="space-y-4">
            <input
              type="email" placeholder="Email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="text" placeholder="Reset token" required
              value={resetToken} onChange={(e) => setResetToken(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs"
            />
            <input
              type="password" placeholder="New password (min 6 chars)" required minLength={6}
              value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {ok && (
              <div className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg p-2.5">{ok}</div>
            )}
            {error && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">{error}</div>
            )}
            <button
              type="submit" disabled={loading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors text-sm"
            >
              {loading ? "…" : "Set new password"}
            </button>
            <button
              type="button" onClick={() => { setView("forgot"); setError(null); setOk(null); }}
              className="w-full py-2 text-xs text-gray-500 hover:text-gray-700"
            >
              ← Back
            </button>
          </form>
        </div>
      </div>
    );
  }

  const isLogin = view === "login";

  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center">
            {isLogin ? <LogIn size={20} /> : <UserPlus size={20} />}
          </div>
          <h2 className="text-xl font-bold text-gray-900">
            {isLogin ? "Sign in" : "Create account"}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <input
              type="text" placeholder="Name"
              value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          )}
          <input
            type="email" placeholder="Email" required
            value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="password" placeholder="Password" required minLength={6}
            value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">
              {error}
            </div>
          )}

          <button
            type="submit" disabled={loading}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors text-sm"
          >
            {loading ? "…" : isLogin ? "Sign in" : "Create account"}
          </button>
        </form>

        {isLogin && (
          <button
            type="button" onClick={() => { setView("forgot"); setError(null); }}
            className="mt-2 w-full text-center text-xs text-gray-500 hover:text-indigo-600"
          >
            Forgot password?
          </button>
        )}

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setView(isLogin ? "register" : "login")}
            className="text-xs text-indigo-600 hover:underline"
          >
            {isLogin ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        </div>

        {GOOGLE_CLIENT_ID ? (
          <>
            <div className="flex items-center gap-2 my-4">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400">OR</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
            <div ref={googleBtnRef} />
          </>
        ) : (
          <p className="mt-4 text-center text-[11px] text-gray-400 italic">
            Set VITE_GOOGLE_CLIENT_ID to enable Google sign-in
          </p>
        )}
      </div>
    </div>
  );
}
