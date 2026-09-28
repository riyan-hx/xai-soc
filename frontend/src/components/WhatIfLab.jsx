import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Wand2 } from "lucide-react";
import { api } from "../api/client";
import { FEATURE_GLOSSARY, attackMeta } from "../lib/meta";
import { fmtPct, fmtValue, humanFeature } from "../lib/format";

const CLASS_ORDER = ["DNS_TUNNELING", "DOS_DDOS", "PORT_SCAN", "BRUTE_FORCE", "BOTNET", "NORMAL"];

function sliderMax(value) {
  return Math.max(value * 2.2, 5);
}

function ProbBars({ probs, original }) {
  return (
    <ul className="prob-list">
      {CLASS_ORDER.map((c) => {
        const p = probs?.[c] ?? 0;
        const before = original?.[c] ?? 0;
        const isTop = probs && Math.max(...Object.values(probs)) === p && p > 0;
        return (
          <li key={c} className={isTop ? "top" : ""}>
            <span className="prob-name">
              <span className="atk-dot" style={{ background: `var(${attackMeta(c).cssVar})` }} aria-hidden="true" />
              {attackMeta(c).short}
            </span>
            <span className="prob-track">
              <span className="prob-before" style={{ width: `${before * 100}%` }} />
              <span className="prob-fill" style={{ width: `${p * 100}%`, background: `var(${attackMeta(c).cssVar})` }} />
            </span>
            <span className="num prob-val">{fmtPct(p)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Edit the flow's strongest features and watch the model re-decide. Nothing is
 * stored: the edits are re-scored by the real model through /whatif.
 */
export default function WhatIfLab({ alert }) {
  const originals = alert.features || {};
  const ranked = useMemo(
    () =>
      [...(alert.explanation?.important_features || [])]
        .sort((a, b) => Math.abs(b.shap_value) - Math.abs(a.shap_value))
        .map((f) => f.feature)
        .filter((f) => originals[f] != null)
        .slice(0, 6),
    [alert, originals]
  );

  const [edits, setEdits] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState(null);
  const [cf, setCf] = useState(null);
  const [base, setBase] = useState(null);
  const seq = useRef(0);

  useEffect(() => {
    setEdits({});
    setResult(null);
    setCf(null);
    setError(null);
    setBase(null);
    // score the untouched flow once so the bars show the current verdict before any edit
    api.whatIf(alert.id, {}).then((r) => setBase(r.scenario)).catch(() => {});
  }, [alert.id]);

  const changed = Object.keys(edits);

  useEffect(() => {
    if (!changed.length) {
      setResult(null);
      return undefined;
    }
    const id = ++seq.current;
    setBusy(true);
    const t = setTimeout(() => {
      api
        .whatIf(alert.id, edits)
        .then((res) => id === seq.current && (setResult(res), setError(null)))
        .catch((e) => id === seq.current && setError(e.message))
        .finally(() => id === seq.current && setBusy(false));
    }, 160);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits, alert.id]);

  function setValue(name, value) {
    setCf(null);
    setEdits((cur) => {
      const next = { ...cur };
      if (Math.abs(value - originals[name]) < 1e-9) delete next[name];
      else next[name] = value;
      return next;
    });
  }

  async function findCounterfactual() {
    setFinding(true);
    setError(null);
    try {
      const res = await api.counterfactual(alert.id);
      setCf(res);
      if (res.changes.length) {
        const next = {};
        res.changes.forEach((c) => (next[c.feature] = c.to));
        setEdits(next);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setFinding(false);
    }
  }

  function reset() {
    setEdits({});
    setCf(null);
  }

  const attack = attackMeta(alert.attack_type);
  const verdict = result?.scenario;
  const flipped = verdict && verdict.label !== alert.attack_type;
  // features the counterfactual changed that are not among the six sliders
  const hiddenChanges = cf ? cf.changes.filter((c) => !ranked.includes(c.feature)) : [];

  return (
    <div className="whatif">
      <div className="whatif-controls">
        {ranked.map((name) => {
          const original = originals[name];
          const value = edits[name] ?? original;
          const max = sliderMax(Math.max(original, edits[name] ?? 0));
          const isEdited = name in edits;
          return (
            <div key={name} className={`slider-row ${isEdited ? "edited" : ""}`}>
              <div className="slider-head">
                <label htmlFor={`wi-${name}`} title={FEATURE_GLOSSARY[name]}>
                  {humanFeature(name)}
                </label>
                <span className="num slider-val">
                  {isEdited && <s>{fmtValue(original)}</s>}
                  {fmtValue(value)}
                </span>
              </div>
              <input
                id={`wi-${name}`}
                type="range"
                className="slider"
                min={0}
                max={max}
                step={max / 200}
                value={value}
                style={{ "--fill": `${(value / max) * 100}%` }}
                onChange={(e) => setValue(name, Number(e.target.value))}
              />
            </div>
          );
        })}
        <div className="whatif-buttons">
          <button className="btn btn-primary btn-sm" onClick={findCounterfactual} disabled={finding}>
            <Wand2 size={14} aria-hidden="true" /> {finding ? "Searching…" : "Find what makes it normal"}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={reset} disabled={!changed.length}>
            <RotateCcw size={14} aria-hidden="true" /> Reset
          </button>
        </div>
      </div>

      <div className="whatif-result" aria-live="polite">
        <div className={`whatif-verdict ${flipped ? "flipped" : ""}`}>
          {!verdict ? (
            <>
              <strong>Drag a slider</strong> to change one measurement and see how the model would decide.
            </>
          ) : flipped ? (
            <>
              With these edits the model calls it <strong>{attackMeta(verdict.label).label}</strong> ({fmtPct(verdict.score)}), no longer{" "}
              {attack.label}.
            </>
          ) : (
            <>
              Still <strong>{attack.label}</strong> at {fmtPct(verdict.probabilities[alert.attack_type] ?? verdict.score)}. The model is
              robust to this change.
            </>
          )}
          {busy && <span className="muted"> · re-scoring…</span>}
        </div>

        <ProbBars probs={verdict?.probabilities || base?.probabilities} original={result?.baseline?.probabilities || base?.probabilities} />
        <div className="prob-key">
          <span><i className="before" /> before edits</span>
          <span><i className="after" /> after edits</span>
        </div>

        {cf && (
          <div className={`cf-note ${cf.found ? "" : "cf-none"}`}>
            {cf.already_normal ? (
              <>The model already treats this flow as normal.</>
            ) : cf.found ? (
              <>
                Smallest edit found: change <strong>{cf.changes.length}</strong> measurement{cf.changes.length === 1 ? "" : "s"} toward normal traffic.
                {hiddenChanges.length > 0 && (
                  <>
                    {" "}
                    Also changed:{" "}
                    {hiddenChanges.map((c) => `${humanFeature(c.feature)} ${fmtValue(c.from)} → ${fmtValue(c.to)}`).join(", ")}.
                  </>
                )}
              </>
            ) : (
              <>No small set of edits flips this verdict. The model is confident in it.</>
            )}
          </div>
        )}
        {error && <div className="error-banner">{error}</div>}
      </div>
    </div>
  );
}
