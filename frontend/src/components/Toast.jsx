import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CircleCheck, CircleAlert, TriangleAlert, Info, X } from "lucide-react";

const ToastContext = createContext(null);

const ICONS = {
  success: CircleCheck,
  critical: CircleAlert,
  warning: TriangleAlert,
  info: Info,
};

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});
  const navigate = useNavigate();

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const push = useCallback(
    ({ type = "info", title, message, duration = 6000, to }) => {
      const id = nextId++;
      setToasts((t) => [...t, { id, type, title, message, to, duration }]);
      if (duration) {
        timers.current[id] = setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss]
  );

  function handleClick(toast) {
    if (toast.to) navigate(toast.to);
    dismiss(toast.id);
  }

  return (
    <ToastContext.Provider value={{ push, dismiss }}>
      {children}
      <div className="toast-stack" role="region" aria-label="Notifications">
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || Info;
          return (
            <div
              key={t.id}
              className={`toast toast-${t.type} ${t.to ? "toast-clickable" : ""}`}
              role="status"
              onClick={t.to ? () => handleClick(t) : undefined}
            >
              <span className="toast-icon">
                <Icon size={16} aria-hidden="true" />
              </span>
              <div className="toast-body">
                {t.title && <div className="toast-title">{t.title}</div>}
                {t.message && <div className="toast-message">{t.message}</div>}
              </div>
              <button
                className="toast-close"
                aria-label="Dismiss notification"
                onClick={(e) => {
                  e.stopPropagation();
                  dismiss(t.id);
                }}
              >
                <X size={14} />
              </button>
              {t.duration > 0 && (
                <div className="toast-timer" style={{ animationDuration: `${t.duration}ms` }} />
              )}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
