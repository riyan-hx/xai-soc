import Modal from "./Modal";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const GROUPS = [
  {
    title: "Anywhere",
    rows: [
      [[isMac ? "⌘" : "Ctrl", "K"], "Command palette: search alerts, jump to pages, run actions"],
      [["?"], "Show this panel"],
    ],
  },
  {
    title: "Alert queue",
    rows: [
      [["J"], "Next alert"],
      [["K"], "Previous alert"],
      [["Enter"], "Open focused alert"],
      [["X"], "Select focused alert"],
      [["/"], "Focus search"],
    ],
  },
  {
    title: "Alert detail",
    rows: [
      [["C"], "Confirm attack"],
      [["F"], "Mark false positive"],
      [["J"], "Next alert"],
      [["K"], "Previous alert"],
      [["Esc"], "Back to the queue"],
    ],
  },
];

export default function ShortcutsModal({ onClose }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} width={480}>
      {GROUPS.map((group, gi) => (
        <div key={group.title} style={{ marginTop: gi ? 20 : 0 }}>
          <div className="menu-label" style={{ padding: "0 0 6px" }}>
            {group.title}
          </div>
          {group.rows.map(([keys, label]) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                padding: "8px 0",
                borderBottom: "1px solid var(--line)",
                fontSize: 13,
              }}
            >
              <span>{label}</span>
              <span style={{ display: "flex", gap: 4 }}>
                {keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      ))}
    </Modal>
  );
}
