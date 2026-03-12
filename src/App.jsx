import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabaseClient";

const SYSTEM_PROMPT = `You are acting as a **Latent Intent Interrogator**.

Your role is not to design, implement, or optimize a solution.
Your role is to **surface, pressure-test, and collapse latent intent** that would otherwise be deferred to costly iteration.

Assume the provided requirements are a **lossy projection** of stakeholder intent.

### Operating Principles
- Favor clarity over completeness.
- Favor early commitment on expensive-to-change decisions.
- Preserve philosophy while eliminating ambiguity that would cause downstream failure.
- Do not smooth over uncertainty; name it and decide or defer it explicitly.

---

### Phase 1 — Latent Space Identification

Analyze the requirements document and identify **latent dimensions** where intent is:
- Unstated
- Ambiguous
- Conflicting
- Assumed
- Implicitly deferred

Prioritize latent dimensions by **downstream cost of change**, not by interest.

Typical high-cost dimensions include (but are not limited to):
- Authority and decision boundaries
- Generation vs. completion limits
- Evaluation and honesty calibration
- Mode or context switching
- Memory and time-awareness
- Repetition thresholds
- Legal / ethical posture
- User dependency risk

For each selected latent dimension:
1. Name it clearly.
2. Cite the text that signals its presence.
3. Explain why getting this wrong would be expensive later.

---

### Phase 2 — Guided Discovery (Targeted, Not Exhaustive)

Engage the stakeholder in a **structured discovery conversation**.

Rules:
- Ask **forced-choice questions** wherever possible.
- For each question, **recommend a default** aligned with the stated philosophy.
- Frame questions around **trade-offs**, not abstractions.
- Surface "unknown unknowns" by analogy to similar complex projects.

For each question:
- Make clear what decision is being asked.
- Explain what failure looks like if the wrong choice is made.
- Avoid asking questions whose answers can be cheaply changed later.

Do **not** probe everything.
Explicitly state what you are choosing **not** to probe and why.

---

### Phase 3 — Decision Classification

After the conversation, summarize clarified intent and classify each outcome as:
- **Decision** — locked for this phase
- **Position** — default stance, revisitable
- **Open Question** — intentionally deferred

For each **Decision**, briefly note:
- The most likely failure mode if this assumption proves wrong in practice

This is not for pessimism — it is for future learning.

---

### Phase 4 — Artifact Refinement

Generate a revised requirements document that:
- Incorporates clarified decisions explicitly
- Converts implicit assumptions into stated constraints
- Preserves intentionally open questions as such
- Includes a short **Decision Log** documenting what changed and why

Do not erase philosophical language.
Translate it into **behavioral and architectural commitments**.

---

### Stopping Rule

Stop discovery when:
- Remaining ambiguity primarily affects elegance or preference, not correctness or identity.
- Further questioning would produce diminishing returns.

Explicitly state why you are stopping.

---

### Tone and Stance

- Architect-to-stakeholder, not consultant-to-client
- Calm, precise, non-performative
- Willing to recommend, willing to disagree
- Curiosity without flattery

Your success is measured by:
- Reduction of unacknowledged ambiguity
- Earlier surfacing of costly trade-offs
- Fewer identity-level reversals after implementation

---

IMPORTANT BEHAVIORAL NOTES:
- You are operating inside a brainstorming application. The user will first provide their source material (requirements, ideas, briefs, etc.) and then you will conduct the interrogation conversationally.
- Begin Phase 1 immediately upon receiving source material. Present your latent space identification, then transition into Phase 2 by asking your first set of forced-choice questions.
- Ask only 2-4 questions at a time to keep the conversation manageable. Wait for answers before proceeding.
- When you have gathered enough clarity, move to Phase 3 (Decision Classification) and then Phase 4 (Artifact Refinement).
- Use markdown formatting for structure and readability.`;

const PHASES = [
  { id: 1, label: "Latent Space ID", icon: "◇" },
  { id: 2, label: "Guided Discovery", icon: "◈" },
  { id: 3, label: "Decision Classification", icon: "◆" },
  { id: 4, label: "Artifact Refinement", icon: "▣" },
];

function detectPhase(text) {
  const lower = text.toLowerCase();
  if (lower.includes("phase 4") || lower.includes("artifact refinement") || lower.includes("revised requirements") || lower.includes("decision log"))
    return 4;
  if (lower.includes("phase 3") || lower.includes("decision classification") || lower.includes("**decision**") || lower.includes("**position**") || lower.includes("**open question**"))
    return 3;
  if (lower.includes("phase 2") || lower.includes("guided discovery") || lower.includes("forced-choice") || lower.includes("recommend a default") || lower.includes("which of the following"))
    return 2;
  if (lower.includes("phase 1") || lower.includes("latent") || lower.includes("unstated") || lower.includes("ambiguous") || lower.includes("latent dimension"))
    return 1;
  return null;
}

function MarkdownRenderer({ text }) {
  const lines = text.split("\n");
  const elements = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("### ")) {
      elements.push(<h3 key={key++} style={styles.mdH3}>{line.slice(4)}</h3>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={key++} style={styles.mdH2}>{line.slice(3)}</h2>);
    } else if (line.startsWith("# ")) {
      elements.push(<h1 key={key++} style={styles.mdH1}>{line.slice(2)}</h1>);
    } else if (line.startsWith("---")) {
      elements.push(<hr key={key++} style={styles.mdHr} />);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      const items = [];
      let j = i;
      while (j < lines.length && (lines[j].startsWith("- ") || lines[j].startsWith("* ") || lines[j].startsWith("  "))) {
        items.push(lines[j].replace(/^[-*]\s/, "").replace(/^\s+/, ""));
        j++;
      }
      elements.push(
        <ul key={key++} style={styles.mdUl}>
          {items.map((item, idx) => (
            <li key={idx} style={styles.mdLi}><InlineMarkdown text={item} /></li>
          ))}
        </ul>
      );
      i = j - 1;
    } else if (/^\d+\.\s/.test(line)) {
      const items = [];
      let j = i;
      while (j < lines.length && (/^\d+\.\s/.test(lines[j]) || lines[j].startsWith("   "))) {
        items.push(lines[j].replace(/^\d+\.\s/, "").replace(/^\s+/, ""));
        j++;
      }
      elements.push(
        <ol key={key++} style={styles.mdOl}>
          {items.map((item, idx) => (
            <li key={idx} style={styles.mdLi}><InlineMarkdown text={item} /></li>
          ))}
        </ol>
      );
      i = j - 1;
    } else if (line.startsWith("```")) {
      const codeLines = [];
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith("```")) {
        codeLines.push(lines[j]);
        j++;
      }
      elements.push(
        <pre key={key++} style={styles.mdPre}>
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      i = j;
    } else if (line.startsWith("> ")) {
      const quoteLines = [];
      let j = i;
      while (j < lines.length && lines[j].startsWith("> ")) {
        quoteLines.push(lines[j].slice(2));
        j++;
      }
      elements.push(
        <blockquote key={key++} style={styles.mdBlockquote}>
          <InlineMarkdown text={quoteLines.join(" ")} />
        </blockquote>
      );
      i = j - 1;
    } else if (line.trim() === "") {
      elements.push(<div key={key++} style={{ height: 8 }} />);
    } else {
      elements.push(<p key={key++} style={styles.mdP}><InlineMarkdown text={line} /></p>);
    }
    i++;
  }
  return <>{elements}</>;
}

function InlineMarkdown({ text }) {
  const parts = [];
  let remaining = text;
  let k = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const codeMatch = remaining.match(/`([^`]+)`/);

    let firstMatch = null;
    let matchType = null;

    if (boldMatch && (!codeMatch || boldMatch.index <= codeMatch.index)) {
      firstMatch = boldMatch;
      matchType = "bold";
    } else if (codeMatch) {
      firstMatch = codeMatch;
      matchType = "code";
    }

    if (!firstMatch) {
      parts.push(<span key={k++}>{remaining}</span>);
      break;
    }

    if (firstMatch.index > 0) {
      parts.push(<span key={k++}>{remaining.slice(0, firstMatch.index)}</span>);
    }

    if (matchType === "bold") {
      parts.push(<strong key={k++} style={styles.mdBold}>{firstMatch[1]}</strong>);
    } else {
      parts.push(<code key={k++} style={styles.mdInlineCode}>{firstMatch[1]}</code>);
    }

    remaining = remaining.slice(firstMatch.index + firstMatch[0].length);
  }

  return <>{parts}</>;
}

export default function BrainstormApp() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [authMode, setAuthMode] = useState("login"); // login | signup
  const [signupName, setSignupName] = useState("");
  const [stage, setStage] = useState("input"); // input | session
  const [sourceText, setSourceText] = useState("");
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentPhase, setCurrentPhase] = useState(0);
  const [error, setError] = useState(null);
  const [streamingText, setStreamingText] = useState("");
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);
  const inputTextareaRef = useRef(null);

  // Check auth session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Load past sessions when user is available
  useEffect(() => {
    if (user) loadSessions();
  }, [user]);

  async function loadSessions() {
    setSessionsLoading(true);
    const { data, error } = await supabase
      .from("brainstorm_sessions")
      .select("id, title, source_text, current_phase, status, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (!error) setSessions(data || []);
    setSessionsLoading(false);
  }

  async function createDBSession(text) {
    const title = text.slice(0, 80).replace(/\n/g, " ").trim() || "Untitled Session";
    const { data, error } = await supabase
      .from("brainstorm_sessions")
      .insert({ user_id: user.id, title, source_text: text, current_phase: 1 })
      .select("id")
      .single();
    if (error) console.error("Failed to create session:", error);
    return data?.id || null;
  }

  async function saveDBMessage(sessionId, role, content, isSource = false) {
    if (!sessionId) return;
    const { error } = await supabase
      .from("brainstorm_messages")
      .insert({ session_id: sessionId, role, content, is_source: isSource });
    if (error) console.error("Failed to save message:", error);
  }

  async function updateDBSessionPhase(sessionId, phase) {
    if (!sessionId) return;
    await supabase
      .from("brainstorm_sessions")
      .update({ current_phase: phase })
      .eq("id", sessionId);
  }

  async function resumeSession(session) {
    const { data: msgs, error } = await supabase
      .from("brainstorm_messages")
      .select("role, content, is_source, created_at")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("Failed to load messages:", error);
      return;
    }
    setCurrentSessionId(session.id);
    setCurrentPhase(session.current_phase || 0);
    setSourceText(session.source_text);
    setMessages(
      (msgs || []).map((m) => ({
        role: m.role,
        text: m.content,
        isSource: m.is_source,
      }))
    );
    setStage("session");
  }

  async function deleteSession(sessionId) {
    await supabase.from("brainstorm_sessions").delete().eq("id", sessionId);
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (currentSessionId === sessionId) resetSession();
  }

  async function handleLogin(e) {
    e.preventDefault();
    setLoginLoading(true);
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });
    if (error) setAuthError(error.message);
    setLoginLoading(false);
  }

  async function handleSignUp(e) {
    e.preventDefault();
    setLoginLoading(true);
    setAuthError(null);
    const { error } = await supabase.auth.signUp({
      email: loginEmail,
      password: loginPassword,
      options: {
        data: { full_name: signupName },
      },
    });
    if (error) {
      setAuthError(error.message);
    } else {
      setAuthError(null);
      setAuthMode("confirm");
    }
    setLoginLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    resetSession();
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  useEffect(() => {
    if (stage === "session" && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [stage, loading]);

  async function callAPI(apiMessages) {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session?.access_token || ""}`,
      },
      body: JSON.stringify({
        messages: apiMessages,
        system: SYSTEM_PROMPT,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `API error: ${response.status}`);
    }

    return data.text;
  }

  async function startSession() {
    if (!sourceText.trim()) return;
    setStage("session");
    setLoading(true);
    setError(null);

    // Create DB session
    const sessionId = await createDBSession(sourceText);
    setCurrentSessionId(sessionId);

    const userContent = `Here is my source material for interrogation:\n\n${sourceText}`;
    const userMsg = { role: "user", content: userContent };
    const newMessages = [userMsg];
    setMessages([{ role: "user", text: sourceText, isSource: true }]);

    // Save source message
    await saveDBMessage(sessionId, "user", sourceText, true);

    try {
      const reply = await callAPI(newMessages.map((m) => ({ role: m.role, content: m.content })));
      const phase = detectPhase(reply);
      if (phase) {
        setCurrentPhase(phase);
        await updateDBSessionPhase(sessionId, phase);
      }
      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
      await saveDBMessage(sessionId, "assistant", reply);
      newMessages.push({ role: "assistant", content: reply });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      loadSessions();
    }
  }

  async function sendMessage() {
    if (!userInput.trim() || loading) return;
    const text = userInput.trim();
    setUserInput("");
    setLoading(true);
    setError(null);

    const updatedMessages = [...messages, { role: "user", text }];
    setMessages(updatedMessages);

    // Save user message
    await saveDBMessage(currentSessionId, "user", text);

    const apiMessages = buildAPIMessages(updatedMessages);

    try {
      const reply = await callAPI(apiMessages);
      const phase = detectPhase(reply);
      if (phase) {
        setCurrentPhase(phase);
        await updateDBSessionPhase(currentSessionId, phase);
      }
      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
      await saveDBMessage(currentSessionId, "assistant", reply);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function buildAPIMessages(msgs) {
    return msgs.map((m) => ({
      role: m.role,
      content: m.isSource
        ? `Here is my source material for interrogation:\n\n${m.text}`
        : m.text,
    }));
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (stage === "input") startSession();
      else sendMessage();
    }
  }

  function resetSession() {
    setStage("input");
    setSourceText("");
    setMessages([]);
    setUserInput("");
    setCurrentPhase(0);
    setError(null);
    setStreamingText("");
    setCurrentSessionId(null);
    loadSessions();
  }

  // AUTH LOADING
  if (authLoading) {
    return (
      <div style={styles.root}>
        <div style={{ ...styles.inputStage, justifyContent: "center" }}>
          <div style={styles.brandMark}>
            <div style={styles.brandIcon}>
              <img src="/tq-logo.png" alt="Texas Quantitative" width="48" height="48" style={{ borderRadius: 8 }} />
            </div>
            <h1 style={styles.brandTitle}>Brainstorm</h1>
            <p style={styles.brandSub}>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // LOGIN SCREEN
  if (!user) {
    return (
      <div style={styles.root}>
        <div style={styles.inputStage}>
          <div style={styles.brandMark}>
            <div style={styles.brandIcon}>
              <img src="/tq-logo.png" alt="Texas Quantitative" width="48" height="48" style={{ borderRadius: 8 }} />
            </div>
            <h1 style={styles.brandTitle}>Brainstorm</h1>
            <p style={styles.brandSub}>Latent Intent Interrogator</p>
          </div>

          <div style={styles.inputCard}>
            <label style={styles.inputLabel}>{authMode === "signup" ? "Create Account" : "Sign In"}</label>
            <p style={styles.inputHint}>
              {authMode === "signup"
                ? "Create a new Texas Quantitative account."
                : "Sign in with your Texas Quantitative account to continue."}
            </p>
            {authMode === "confirm" ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <p style={{ color: "#c4a265", fontSize: 15, marginBottom: 12 }}>Check your email</p>
                <p style={{ color: "#8a8780", fontSize: 13 }}>We sent a confirmation link to <strong style={{ color: "#d4d0c8" }}>{loginEmail}</strong>. Click it to activate your account, then come back and sign in.</p>
                <button
                  type="button"
                  style={{ ...styles.resetBtn, marginTop: 20 }}
                  onClick={() => { setAuthMode("login"); setAuthError(null); }}
                >
                  Back to Sign In
                </button>
              </div>
            ) : (
            <form onSubmit={authMode === "signup" ? handleSignUp : handleLogin} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {authMode === "signup" && (
                <input
                  type="text"
                  placeholder="Full Name"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  style={styles.authInput}
                  required
                  autoFocus
                />
              )}
              <input
                type="email"
                placeholder="Email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                style={styles.authInput}
                required
                autoFocus={authMode !== "signup"}
              />
              <input
                type="password"
                placeholder="Password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                style={styles.authInput}
                required
              />
              {authError && (
                <div style={styles.errorBanner}>{authError}</div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button
                  type="button"
                  style={{ background: "none", border: "none", color: "#c4a265", fontSize: 13, cursor: "pointer", padding: 0, fontFamily: "'IBM Plex Sans', sans-serif" }}
                  onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setAuthError(null); }}
                >
                  {authMode === "login" ? "Create an account" : "Already have an account? Sign in"}
                </button>
                <button
                  type="submit"
                  style={{ ...styles.startBtn, opacity: loginLoading ? 0.5 : 1 }}
                  disabled={loginLoading}
                >
                  {loginLoading ? (authMode === "signup" ? "Creating..." : "Signing in...") : (authMode === "signup" ? "Create Account" : "Sign In")}
                  <span style={styles.btnArrow}>→</span>
                </button>
              </div>
            </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // INPUT STAGE
  if (stage === "input") {
    return (
      <div style={styles.root}>
        <div style={styles.inputStage}>
          <div style={styles.brandMark}>
            <div style={styles.brandIcon}>
              <img src="/tq-logo.png" alt="Texas Quantitative" width="48" height="48" style={{ borderRadius: 8 }} />
            </div>
            <h1 style={styles.brandTitle}>Brainstorm</h1>
            <p style={styles.brandSub}>Latent Intent Interrogator</p>
          </div>

          <div style={styles.inputCard}>
            <label style={styles.inputLabel}>Source Material</label>
            <p style={styles.inputHint}>
              Paste your requirements document, project brief, feature spec, or any source idea below. 
              The interrogator will surface hidden assumptions, ambiguities, and costly trade-offs.
            </p>
            <textarea
              ref={inputTextareaRef}
              style={styles.sourceTextarea}
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Paste your requirements, brief, or idea here..."
              spellCheck={false}
            />
            <div style={styles.inputActions}>
              <span style={styles.charCount}>{sourceText.length.toLocaleString()} characters</span>
              <button
                style={{
                  ...styles.startBtn,
                  opacity: sourceText.trim() ? 1 : 0.4,
                  cursor: sourceText.trim() ? "pointer" : "default",
                }}
                onClick={startSession}
                disabled={!sourceText.trim()}
              >
                Begin Brainstorming
                <span style={styles.btnArrow}>→</span>
              </button>
            </div>
          </div>

          <div style={styles.phasePreview}>
            {PHASES.map((p) => (
              <div key={p.id} style={styles.phasePreviewItem}>
                <span style={styles.phasePreviewIcon}>{p.icon}</span>
                <span style={styles.phasePreviewLabel}>{p.label}</span>
              </div>
            ))}
          </div>

          {/* Past Sessions */}
          {sessions.length > 0 && (
            <div style={styles.sessionListCard}>
              <label style={styles.inputLabel}>Past Sessions</label>
              <div style={styles.sessionList}>
                {sessions.map((s) => (
                  <div key={s.id} style={styles.sessionListItem}>
                    <div
                      style={styles.sessionListContent}
                      onClick={() => resumeSession(s)}
                      role="button"
                      tabIndex={0}
                    >
                      <div style={styles.sessionListTitle}>{s.title}</div>
                      <div style={styles.sessionListMeta}>
                        <span>{PHASES[s.current_phase - 1]?.icon || "◇"} Phase {s.current_phase}</span>
                        <span style={styles.sessionListDot}>·</span>
                        <span>{new Date(s.updated_at).toLocaleDateString()}</span>
                        <span style={styles.sessionListDot}>·</span>
                        <span style={{ color: s.status === "completed" ? "#6a9955" : "#c4a265" }}>
                          {s.status === "completed" ? "Completed" : "Active"}
                        </span>
                      </div>
                    </div>
                    <button
                      style={styles.sessionDeleteBtn}
                      onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                      title="Delete session"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button style={{ ...styles.resetBtn, marginTop: 16 }} onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // SESSION STAGE
  return (
    <div style={styles.root}>
      <div style={styles.sessionLayout}>
        {/* Header */}
        <div style={styles.sessionHeader}>
          <div style={styles.headerLeft}>
            <img src="/tq-logo.png" alt="Texas Quantitative" width="24" height="24" style={{ marginRight: 8, borderRadius: 4 }} />
            <span style={styles.headerTitle}>Brainstorm</span>
          </div>

          <div style={styles.phaseIndicator}>
            {PHASES.map((p) => (
              <div
                key={p.id}
                style={{
                  ...styles.phaseChip,
                  ...(currentPhase === p.id ? styles.phaseChipActive : {}),
                  ...(currentPhase > p.id ? styles.phaseChipDone : {}),
                }}
              >
                <span style={styles.phaseChipIcon}>{p.icon}</span>
                <span style={styles.phaseChipLabel}>{p.label}</span>
              </div>
            ))}
          </div>

          <button style={styles.resetBtn} onClick={resetSession}>
            New Session
          </button>
          <button style={styles.resetBtn} onClick={handleLogout}>
            Sign Out
          </button>
        </div>

        {/* Chat Area */}
        <div style={styles.chatArea}>
          <div style={styles.chatScroll}>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  ...styles.msgRow,
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    ...(msg.role === "user" ? styles.userBubble : styles.assistantBubble),
                    ...(msg.isSource ? styles.sourceBubble : {}),
                  }}
                >
                  {msg.isSource && <div style={styles.sourceLabel}>Source Material</div>}
                  {msg.role === "assistant" ? (
                    <MarkdownRenderer text={msg.text} />
                  ) : (
                    <div style={{ whiteSpace: "pre-wrap" }}>
                      {msg.isSource && msg.text.length > 600
                        ? msg.text.slice(0, 600) + "..."
                        : msg.text}
                    </div>
                  )}
                  {msg.isSource && msg.text.length > 600 && (
                    <div style={styles.sourceFooter}>
                      {msg.text.length.toLocaleString()} characters total
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ ...styles.msgRow, justifyContent: "flex-start" }}>
                <div style={styles.assistantBubble}>
                  <div style={styles.thinkingDots}>
                    <span style={{ ...styles.dot, animationDelay: "0s" }}>●</span>
                    <span style={{ ...styles.dot, animationDelay: "0.2s" }}>●</span>
                    <span style={{ ...styles.dot, animationDelay: "0.4s" }}>●</span>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div style={styles.errorBanner}>
                <strong>Error:</strong> {error}
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div style={styles.inputBar}>
          <textarea
            ref={textareaRef}
            style={styles.chatInput}
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={loading ? "Waiting for response..." : "Answer questions or provide context..."}
            disabled={loading}
            rows={1}
            onInput={(e) => {
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
            }}
          />
          <button
            style={{
              ...styles.sendBtn,
              opacity: userInput.trim() && !loading ? 1 : 0.35,
            }}
            onClick={sendMessage}
            disabled={!userInput.trim() || loading}
          >
            ↑
          </button>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        
        @keyframes dotPulse {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.1); }
        }

        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        textarea:focus, button:focus-visible {
          outline: 1px solid #c4a26544;
          outline-offset: 1px;
        }

        * { box-sizing: border-box; }

        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
      `}</style>
    </div>
  );
}

const styles = {
  root: {
    width: "100%",
    height: "100vh",
    background: "#0d0d0f",
    fontFamily: "'IBM Plex Sans', sans-serif",
    color: "#d4d0c8",
    display: "flex",
    flexDirection: "column",
  },

  // INPUT STAGE
  inputStage: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "40px 24px",
    gap: 32,
    maxWidth: 720,
    margin: "0 auto",
    width: "100%",
  },
  brandMark: {
    textAlign: "center",
  },
  brandIcon: {
    marginBottom: 16,
    opacity: 0.9,
  },
  brandTitle: {
    fontFamily: "'DM Serif Display', serif",
    fontSize: 36,
    fontWeight: 400,
    color: "#e8e4dc",
    margin: 0,
    letterSpacing: "-0.02em",
  },
  brandSub: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
    color: "#c4a265",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    marginTop: 6,
    fontWeight: 500,
  },
  inputCard: {
    width: "100%",
    background: "#15151a",
    border: "1px solid #222228",
    borderRadius: 12,
    padding: 28,
  },
  inputLabel: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    color: "#c4a265",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    fontWeight: 500,
  },
  inputHint: {
    fontSize: 13.5,
    color: "#8a8780",
    lineHeight: 1.5,
    marginTop: 8,
    marginBottom: 16,
  },
  sourceTextarea: {
    width: "100%",
    minHeight: 220,
    maxHeight: 400,
    background: "#0d0d0f",
    border: "1px solid #2a2a32",
    borderRadius: 8,
    padding: "16px 18px",
    color: "#d4d0c8",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 13,
    lineHeight: 1.65,
    resize: "vertical",
    transition: "border-color 0.2s",
  },
  inputActions: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
  },
  charCount: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    color: "#555",
  },
  startBtn: {
    background: "#c4a265",
    color: "#0d0d0f",
    border: "none",
    borderRadius: 8,
    padding: "10px 22px",
    fontFamily: "'IBM Plex Sans', sans-serif",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
    transition: "all 0.2s",
  },
  btnArrow: {
    fontSize: 16,
    fontWeight: 300,
  },
  phasePreview: {
    display: "flex",
    gap: 24,
    opacity: 0.45,
  },
  phasePreviewItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  phasePreviewIcon: {
    fontSize: 10,
    color: "#c4a265",
  },
  phasePreviewLabel: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10,
    letterSpacing: "0.05em",
    color: "#8a8780",
  },

  // SESSION STAGE
  sessionLayout: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    overflow: "hidden",
  },
  sessionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 20px",
    borderBottom: "1px solid #1a1a20",
    background: "#111114",
    flexShrink: 0,
    gap: 12,
    flexWrap: "wrap",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
  },
  headerTitle: {
    fontFamily: "'DM Serif Display', serif",
    fontSize: 17,
    color: "#e8e4dc",
  },
  phaseIndicator: {
    display: "flex",
    gap: 4,
    flexWrap: "wrap",
  },
  phaseChip: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    padding: "4px 10px",
    borderRadius: 6,
    background: "transparent",
    border: "1px solid #222228",
    transition: "all 0.3s",
  },
  phaseChipActive: {
    background: "#c4a26518",
    border: "1px solid #c4a26544",
  },
  phaseChipDone: {
    opacity: 0.4,
    border: "1px solid #2a2a32",
  },
  phaseChipIcon: {
    fontSize: 8,
    color: "#c4a265",
  },
  phaseChipLabel: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10,
    color: "#8a8780",
    letterSpacing: "0.03em",
  },
  resetBtn: {
    background: "transparent",
    border: "1px solid #2a2a32",
    borderRadius: 6,
    padding: "5px 12px",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    color: "#8a8780",
    cursor: "pointer",
    transition: "all 0.2s",
    whiteSpace: "nowrap",
  },

  // Chat
  chatArea: {
    flex: 1,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  chatScroll: {
    flex: 1,
    overflowY: "auto",
    padding: "24px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  msgRow: {
    display: "flex",
    animation: "fadeSlideUp 0.3s ease",
  },
  userBubble: {
    maxWidth: "75%",
    background: "#1c1c24",
    border: "1px solid #2a2a32",
    borderRadius: "16px 16px 4px 16px",
    padding: "14px 18px",
    fontSize: 14,
    lineHeight: 1.6,
    color: "#d4d0c8",
  },
  assistantBubble: {
    maxWidth: "85%",
    background: "#13131a",
    border: "1px solid #1e1e28",
    borderRadius: "16px 16px 16px 4px",
    padding: "18px 22px",
    fontSize: 14,
    lineHeight: 1.65,
    color: "#c8c4bc",
  },
  sourceBubble: {
    background: "#161620",
    border: "1px solid #c4a26522",
    borderRadius: 12,
  },
  sourceLabel: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10,
    color: "#c4a265",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    marginBottom: 10,
    fontWeight: 500,
  },
  sourceFooter: {
    marginTop: 10,
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    color: "#555",
  },
  thinkingDots: {
    display: "flex",
    gap: 6,
    padding: "4px 0",
  },
  dot: {
    fontSize: 10,
    color: "#c4a265",
    animation: "dotPulse 1.2s infinite ease-in-out",
    display: "inline-block",
  },
  errorBanner: {
    background: "#2a1515",
    border: "1px solid #5a2020",
    borderRadius: 8,
    padding: "12px 16px",
    fontSize: 13,
    color: "#e88",
    margin: "0 20px",
  },

  // Input Bar
  inputBar: {
    display: "flex",
    alignItems: "flex-end",
    gap: 10,
    padding: "14px 20px 18px",
    borderTop: "1px solid #1a1a20",
    background: "#111114",
    flexShrink: 0,
  },
  chatInput: {
    flex: 1,
    background: "#0d0d0f",
    border: "1px solid #2a2a32",
    borderRadius: 10,
    padding: "12px 16px",
    color: "#d4d0c8",
    fontFamily: "'IBM Plex Sans', sans-serif",
    fontSize: 14,
    lineHeight: 1.5,
    resize: "none",
    minHeight: 44,
    maxHeight: 160,
    overflow: "auto",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: "#c4a265",
    color: "#0d0d0f",
    border: "none",
    fontSize: 18,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "opacity 0.2s",
  },

  // Markdown
  mdH1: {
    fontFamily: "'DM Serif Display', serif",
    fontSize: 22,
    color: "#e8e4dc",
    margin: "20px 0 10px",
    fontWeight: 400,
  },
  mdH2: {
    fontFamily: "'DM Serif Display', serif",
    fontSize: 18,
    color: "#e0dcd4",
    margin: "18px 0 8px",
    fontWeight: 400,
  },
  mdH3: {
    fontFamily: "'IBM Plex Sans', sans-serif",
    fontSize: 15,
    color: "#c4a265",
    margin: "16px 0 6px",
    fontWeight: 600,
    letterSpacing: "0.01em",
  },
  mdP: {
    margin: "4px 0",
    lineHeight: 1.65,
  },
  mdBold: {
    color: "#e8e4dc",
    fontWeight: 600,
  },
  mdHr: {
    border: "none",
    borderTop: "1px solid #2a2a32",
    margin: "16px 0",
  },
  mdUl: {
    margin: "6px 0",
    paddingLeft: 20,
    listStyleType: "none",
  },
  mdOl: {
    margin: "6px 0",
    paddingLeft: 24,
  },
  mdLi: {
    margin: "4px 0",
    lineHeight: 1.6,
    position: "relative",
    paddingLeft: 12,
  },
  mdPre: {
    background: "#0a0a0e",
    border: "1px solid #222228",
    borderRadius: 8,
    padding: "14px 16px",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12.5,
    lineHeight: 1.55,
    overflowX: "auto",
    margin: "10px 0",
    color: "#a8a4a0",
  },
  mdInlineCode: {
    background: "#1a1a22",
    border: "1px solid #2a2a32",
    borderRadius: 4,
    padding: "2px 6px",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "0.9em",
    color: "#c4a265",
  },
  mdBlockquote: {
    borderLeft: "3px solid #c4a26544",
    paddingLeft: 16,
    margin: "10px 0",
    color: "#9a968e",
    fontStyle: "italic",
  },
  authInput: {
    width: "100%",
    background: "#0d0d0f",
    border: "1px solid #2a2a32",
    borderRadius: 8,
    padding: "12px 16px",
    color: "#d4d0c8",
    fontFamily: "'IBM Plex Sans', sans-serif",
    fontSize: 14,
    lineHeight: 1.5,
    transition: "border-color 0.2s",
  },

  // Session List
  sessionListCard: {
    width: "100%",
    background: "#15151a",
    border: "1px solid #222228",
    borderRadius: 12,
    padding: 28,
  },
  sessionList: {
    marginTop: 14,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    maxHeight: 280,
    overflowY: "auto",
  },
  sessionListItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#0d0d0f",
    border: "1px solid #2a2a32",
    borderRadius: 8,
    padding: "10px 14px",
    transition: "border-color 0.2s",
  },
  sessionListContent: {
    flex: 1,
    cursor: "pointer",
    minWidth: 0,
  },
  sessionListTitle: {
    fontSize: 13,
    color: "#d4d0c8",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    fontWeight: 500,
  },
  sessionListMeta: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10,
    color: "#666",
    marginTop: 4,
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  sessionListDot: {
    color: "#444",
  },
  sessionDeleteBtn: {
    background: "transparent",
    border: "none",
    color: "#555",
    fontSize: 12,
    cursor: "pointer",
    padding: "4px 6px",
    borderRadius: 4,
    transition: "color 0.2s",
    flexShrink: 0,
  },
};
