import React, { useEffect, useState } from "react";
import { Chrome, KeyRound, LogOut, Mail } from "lucide-react";
import { hasSupabaseConfig, supabase } from "../supabaseClient";

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("signin");

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return undefined;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleEmailPassword(event) {
    event.preventDefault();
    setMessage("");
    const action = mode === "signup"
      ? supabase.auth.signUp({ email, password })
      : supabase.auth.signInWithPassword({ email, password });
    const { error } = await action;
    if (error) setMessage(error.message);
    else setMessage(mode === "signup" ? "Account created. You can sign in now." : "");
  }

  async function copyExtensionToken() {
    if (!session?.access_token) return;
    await navigator.clipboard.writeText(session.access_token);
    setMessage("Auth token copied for the extension.");
  }

  if (!hasSupabaseConfig) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">Setup needed</p>
          <h1>Supabase Auth is not configured</h1>
          <p className="muted">Create `frontend/.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then restart the frontend.</p>
        </section>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="authShell">
        <section className="authCard"><h1>Loading workspace...</h1></section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">Personal workspace</p>
          <h1>Sign in to CommuteRank</h1>
          <p className="muted">Save apartments, compare commute burden, and keep your decision workspace tied to your account.</p>
          <div className="authTabs">
            <button className={mode === "signin" ? "active" : ""} type="button" onClick={() => setMode("signin")}>Sign in</button>
            <button className={mode === "signup" ? "active" : ""} type="button" onClick={() => setMode("signup")}>Create account</button>
          </div>
          <form className="authForm" onSubmit={handleEmailPassword}>
            <label>
              <span>Email</span>
              <div>
                <Mail size={17} />
                <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="you@example.com" required />
              </div>
            </label>
            <label>
              <span>Password</span>
              <div>
                <KeyRound size={17} />
                <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="At least 6 characters" required minLength={6} />
              </div>
            </label>
            <button className="primaryButton authButton" type="submit">
              {mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>
          {message && <p className="authMessage">{message}</p>}
        </section>
      </main>
    );
  }

  return (
    <>
      <div className="sessionBar">
        <span>{session.user.email || "Signed in"}</span>
        <button type="button" onClick={copyExtensionToken}><Chrome size={15} />Copy extension token</button>
        <button type="button" onClick={() => supabase.auth.signOut()}><LogOut size={15} />Sign out</button>
      </div>
      {message && <div className="sessionToast"><KeyRound size={15} />{message}</div>}
      {children}
    </>
  );
}
