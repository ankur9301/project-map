import React, { useEffect, useState } from "react";
import { Chrome, KeyRound, LogOut, Mail, MessageSquare, Send, UserRoundCheck } from "lucide-react";
import { hasSupabaseConfig, supabase } from "../supabaseClient";

/**
 * AuthGate — invite-only access.
 *
 * Three flows live here:
 *   1) "Sign in"        Existing approved users sign in with email + password.
 *   2) "Request access" Strangers submit email/name/reason. Goes into the
 *                       public.access_requests table; Ankur reviews via the
 *                       /admin/access-requests/{id}/review backend endpoint.
 *                       On approval, Supabase emails them an invite link.
 *   3) "Pending review" A pseudo-state shown after request submission OR when
 *                       the signed-in user's profile row has is_approved=false
 *                       (their auth exists, but the gate isn't open yet).
 */
export default function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);          // { is_approved } | null
  const [profileLoading, setProfileLoading] = useState(false);
  const [mode, setMode] = useState("signin");            // 'signin' | 'request'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [submittedRequest, setSubmittedRequest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // --- session bootstrap ---------------------------------------------------
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

  // --- pull profile.is_approved whenever the session changes ---------------
  useEffect(() => {
    if (!supabase || !session?.user?.id) {
      setProfile(null);
      return;
    }
    setProfileLoading(true);
    supabase
      .from("profiles")
      .select("is_approved, email, full_name")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        setProfile(data || { is_approved: false });
        setProfileLoading(false);
      });
  }, [session?.user?.id]);

  // --- handlers ------------------------------------------------------------
  async function handleSignIn(event) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMessage(error.message);
  }

  async function handleRequestAccess(event) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    // Goes through the RLS-protected anon insert policy in migration 0003.
    const { error } = await supabase
      .from("access_requests")
      .insert({ email: email.trim().toLowerCase(), full_name: fullName || null, reason: reason || null });
    setBusy(false);
    if (error && error.code !== "23505") {
      // 23505 = unique violation = duplicate. Treat as success so we don't
      // leak which emails have requested.
      setMessage(error.message);
      return;
    }
    setSubmittedRequest(true);
  }

  async function copyExtensionToken() {
    if (!session?.access_token) return;
    await navigator.clipboard.writeText(session.access_token);
    setMessage("Auth token copied for the extension.");
  }

  // --- render guards -------------------------------------------------------
  if (!hasSupabaseConfig) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">Setup needed</p>
          <h1>Supabase Auth is not configured</h1>
          <p className="muted">
            Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your
            environment (or as GitHub Actions secrets for the deployed build), then redeploy.
          </p>
        </section>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="authShell">
        <section className="authCard"><h1>Loading workspace…</h1></section>
      </main>
    );
  }

  // Just submitted a request — show the confirmation card.
  if (!session && submittedRequest) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">Request received</p>
          <h1>Thanks — I'll take a look soon.</h1>
          <p className="muted">
            If your request is approved you'll get an invite email with a link to set a
            password. This is a personal workspace, so approvals are manual.
          </p>
          <button
            type="button"
            className="primaryButton authButton"
            onClick={() => { setSubmittedRequest(false); setMode("signin"); setMessage(""); }}
          >
            Back to sign in
          </button>
        </section>
      </main>
    );
  }

  // Not signed in → show sign-in / request-access form.
  if (!session) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">Invite-only workspace</p>
          <h1>{mode === "request" ? "Request access" : "Sign in to CommuteRank"}</h1>
          <p className="muted">
            {mode === "request"
              ? "Tell me who you are and why you'd like in. I review requests manually."
              : "Already approved? Sign in with the password you set from the invite email."}
          </p>

          <div className="authTabs">
            <button type="button" className={mode === "signin" ? "active" : ""} onClick={() => { setMode("signin"); setMessage(""); }}>
              Sign in
            </button>
            <button type="button" className={mode === "request" ? "active" : ""} onClick={() => { setMode("request"); setMessage(""); }}>
              Request access
            </button>
          </div>

          {mode === "signin" ? (
            <form className="authForm" onSubmit={handleSignIn}>
              <label>
                <span>Email</span>
                <div>
                  <Mail size={17} />
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" required />
                </div>
              </label>
              <label>
                <span>Password</span>
                <div>
                  <KeyRound size={17} />
                  <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Your password" required minLength={6} />
                </div>
              </label>
              <button className="primaryButton authButton" type="submit" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
          ) : (
            <form className="authForm" onSubmit={handleRequestAccess}>
              <label>
                <span>Email</span>
                <div>
                  <Mail size={17} />
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" required />
                </div>
              </label>
              <label>
                <span>Your name</span>
                <div>
                  <UserRoundCheck size={17} />
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} type="text" placeholder="First Last" maxLength={200} />
                </div>
              </label>
              <label>
                <span>Why you'd like in (optional)</span>
                <div>
                  <MessageSquare size={17} />
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} placeholder="A sentence or two helps me decide." />
                </div>
              </label>
              <button className="primaryButton authButton" type="submit" disabled={busy}>
                <Send size={15} />
                {busy ? "Sending…" : "Submit request"}
              </button>
            </form>
          )}

          {message && <p className="authMessage">{message}</p>}
        </section>
      </main>
    );
  }

  // Signed in but profile not yet approved → pending state.
  if (!profileLoading && profile && !profile.is_approved) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">Awaiting approval</p>
          <h1>You're invited but not yet approved.</h1>
          <p className="muted">
            Your account exists but the data gate is still closed. This usually clears within a
            few minutes after the invite is issued. Try signing out and back in — if it persists,
            ping me.
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
      {message && <div className="sessionToast"><KeyRound size={15} />{message}</div>}
      {children}
    </>
  );
}
