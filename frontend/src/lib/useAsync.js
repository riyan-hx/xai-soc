import { useCallback, useEffect, useRef, useState } from "react";

// Small data hook: runs `fn` on mount and whenever `deps` change, keeps the
// previous data on screen while refetching (so live refreshes do not flash
// skeletons), and ignores responses from superseded requests.
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const seq = useRef(0);

  const run = useCallback(() => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true }));
    return fn()
      .then((data) => {
        if (id === seq.current) setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (id === seq.current) setState((s) => ({ ...s, error: error.message, loading: false }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  return { ...state, reload: run };
}
