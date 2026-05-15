import React, { useEffect, useState } from "react";
import { Chrome, KeyRound, LogOut, Mail, UserPlus } from "lucide-react";
import { hasSupabaseConfig, supabase } from "../supabaseClient";

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [approved, setApproved] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return undefined;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      setSession(nextSession);
      setLoading(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session?.user?.id) {
      setApproved(null);
      return;
    }
    supabase
      .from("profiles")
      .select("is_approved")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setApproved(Boolean(data?.is_approved)));
  }, [session?.user?.id]);

  async function handleSignIn(event) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setBusy(false);
    if (error) setMessage(error.message);
  }

  async function handleSignUp(event) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: email.trim().toLowerCase().split("@")[0] },
      },
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage(data.session ? "Account created. If your email is approved, your workspace will open." : "Check your email to confirm your account, then sign in.");
  }

  async function handlePasswordReset(event) {
    event.preventDefault();
    setMessage("");
    if (!email.trim()) {
      setMessage("Enter your email first, then request a reset link.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: window.location.origin,
    });
    setBusy(false);
    setMessage(error ? error.message : "Password reset email sent. Check your inbox.");
  }

  async function handleUpdatePassword(event) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setPasswordRecovery(false);
    setNewPassword("");
    setMessage("Password updated. You can keep using the dashboard.");
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
          <p className="muted">
            Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then redeploy.
          </p>
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

  if (passwordRecovery) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">Password reset</p>
          <h1>Choose a new password</h1>
          <form className="authForm" onSubmit={handleUpdatePassword}>
            <label>
              <span>New password</span>
              <div>
                <KeyRound size={17} />
                <input
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  type="password"
                  placeholder="New password"
                  required
                  minLength={6}
                />
              </div>
            </label>
            <button className="primaryButton authButton" type="submit" disabled={busy}>
              {busy ? "Updating..." : "Update password"}
            </button>
          </form>
          {message && <p className="authMessage">{message}</p>}
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">CommuteRank</p>
          <h1>{mode === "signup" ? "Create your account" : "Sign in"}</h1>
          <p className="muted">
            {mode === "signup"
              ? "Use an email and password. Your listings stay in your own workspace."
              : "Welcome back. Sign in to compare your saved apartments."}
          </p>

          <div className="authTabs">
            <button type="button" className={mode === "signin" ? "active" : ""} onClick={() => { setMode("signin"); setMessage(""); }}>
              Sign in
            </button>
            <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setMessage(""); }}>
              Sign up
            </button>
          </div>

          <form className="authForm" onSubmit={mode === "signup" ? handleSignUp : handleSignIn}>
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
                <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Password" required minLength={6} />
              </div>
            </label>
            <button className="primaryButton authButton" type="submit" disabled={busy}>
              {busy ? "Working..." : mode === "signup" ? "Create account" : "Sign in"}
            </button>
            {mode === "signin" && (
              <button className="ghostButton authButton" type="button" disabled={busy} onClick={handlePasswordReset}>
                Forgot password?
              </button>
            )}
          </form>

          {message && <p className="authMessage">{message}</p>}
        </section>
      </main>
    );
  }

  if (approved === false) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">Waiting for approval</p>
          <h1>This email is not approved yet</h1>
          <p className="muted">
            Ask the admin to add your email to the approved users list. After that, sign out and sign in again.
          </p>
          <button className="primaryButton authButton" type="button" onClick={() => supabase.auth.signOut()}>
            <LogOut size={15} />
            Sign out
          </button>
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
      {message && <div className="sessionToast"><UserPlus size={15} />{message}</div>}
      {children}
    </>
  );
}
