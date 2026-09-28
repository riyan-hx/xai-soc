import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

function loadChecks(id) {
  try {
    return JSON.parse(localStorage.getItem(`xai-soc-playbook-${id}`) || "[]");
  } catch {
    return [];
  }
}

// ATT&CK technique chips plus a response checklist. Ticks are a personal
// working aid kept in this browser, not part of the case record.
export default function Playbook({ alertId, techniques, playbook }) {
  const [done, setDone] = useState(() => loadChecks(alertId));

  useEffect(() => setDone(loadChecks(alertId)), [alertId]);

  function toggle(i) {
    setDone((cur) => {
      const next = cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i];
      try {
        localStorage.setItem(`xai-soc-playbook-${alertId}`, JSON.stringify(next));
      } catch {
        /* non-fatal */
      }
      return next;
    });
  }

  if (!playbook) return <p className="muted">No playbook is defined for this attack class.</p>;

  return (
    <div className="playbook">
      <p className="playbook-summary">{playbook.summary}</p>

      <div className="tech-row">
        {techniques.map((t) => (
          <a key={t.id} className="tech" href={t.url} target="_blank" rel="noreferrer noopener">
            <span className="num tech-id">{t.id}</span>
            <span className="tech-name">{t.name}</span>
            <span className="tech-tactic">{t.tactic}</span>
            <ExternalLink size={12} aria-label="Opens MITRE ATT&CK in a new tab" />
          </a>
        ))}
      </div>

      <div className="playbook-cols">
        <div>
          <h3 className="playbook-h">Confirm it if</h3>
          <ul className="playbook-list">
            {playbook.confirm_if.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="playbook-h">Likely benign if</h3>
          <ul className="playbook-list">
            {playbook.benign_if.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      </div>

      <h3 className="playbook-h" style={{ marginTop: 18 }}>
        Response steps{" "}
        <span className="muted num" style={{ fontWeight: 500 }}>
          {done.length}/{playbook.steps.length}
        </span>
      </h3>
      <ol className="steps">
        {playbook.steps.map((s, i) => (
          <li key={s}>
            <label className={done.includes(i) ? "done" : ""}>
              <input type="checkbox" className="check" checked={done.includes(i)} onChange={() => toggle(i)} />
              <span>{s}</span>
            </label>
          </li>
        ))}
      </ol>
    </div>
  );
}
