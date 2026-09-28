import { useState } from "react";
import { ArrowRightLeft, CircleCheck, CircleX, MessageSquare, UserRound } from "lucide-react";
import { STATUS_META } from "../lib/meta";
import { formatTime, initials, relativeTime } from "../lib/format";

function describe(e) {
  const who = e.user_name || "System";
  if (e.kind === "STATUS") {
    const from = STATUS_META[e.meta?.from]?.label || e.meta?.from;
    const to = STATUS_META[e.meta?.to]?.label || e.meta?.to;
    return { Icon: ArrowRightLeft, text: `${who} moved the case from ${from} to ${to}` };
  }
  if (e.kind === "ASSIGN") {
    return {
      Icon: UserRound,
      text: e.meta?.to ? `${who} assigned it to ${e.meta.to}` : `${who} unassigned it`,
    };
  }
  if (e.kind === "VERDICT") {
    return e.meta?.is_true_positive
      ? { Icon: CircleCheck, text: `${who} confirmed it as a real attack`, tone: "pos" }
      : { Icon: CircleX, text: `${who} marked it a false positive`, tone: "neg" };
  }
  return { Icon: MessageSquare, text: `${who} added a note` };
}

export default function Timeline({ events, canWrite, onAddNote }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e?.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      await onAddNote(body.trim());
      setBody("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {canWrite && (
        <form onSubmit={submit} className="note-form">
          <textarea
            className="textarea"
            placeholder="Add a note for whoever picks this up next…"
            aria-label="Add a note"
            value={body}
            maxLength={2000}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && submit(e)}
          />
          <div className="note-form-foot">
            <span className="field-hint">
              <kbd>Ctrl</kbd> <kbd>Enter</kbd> to post
            </span>
            <button className="btn btn-primary btn-sm" type="submit" disabled={busy || !body.trim()}>
              {busy ? "Posting…" : "Add note"}
            </button>
          </div>
        </form>
      )}

      {events.length === 0 ? (
        <p className="muted" style={{ marginTop: canWrite ? 16 : 0 }}>
          No activity yet. Verdicts, status changes and notes are recorded here.
        </p>
      ) : (
        <ol className="timeline">
          {events.map((e) => {
            const { Icon, text, tone } = describe(e);
            return (
              <li key={e.id}>
                <span className={`tl-icon ${tone || ""}`}>
                  <Icon size={14} aria-hidden="true" />
                </span>
                <div className="tl-body">
                  <div className="tl-text">{text}</div>
                  {e.body && <div className="tl-note">{e.body}</div>}
                  <div className="tl-time num" title={formatTime(e.created_at)}>
                    {relativeTime(e.created_at)}
                  </div>
                </div>
                {e.user_name && <span className="avatar tl-avatar">{initials(e.user_name)}</span>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
