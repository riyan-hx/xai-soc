import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  // true when the backend runs with OPEN_ACCESS and answers without a token
  const [openAccess, setOpenAccess] = useState(false);

  useEffect(() => {
    // with no token, still ask: an OPEN_ACCESS backend returns its admin user
    api
      .me()
      .then((me) => {
        setUser(me);
        setOpenAccess(!token);
      })
      .catch(() => {
        if (token) {
          localStorage.removeItem("token");
          setToken(null);
        }
        setUser(null);
        setOpenAccess(false);
      })
      .finally(() => setReady(true));
  }, [token]);

  async function login(email, password) {
    const { access_token } = await api.login(email, password);
    localStorage.setItem("token", access_token);
    setToken(access_token);
  }

  function logout() {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  }

  // `token` stays the "signed in" signal for the rest of the app
  const signedIn = token || (openAccess && user ? "open-access" : null);

  return (
    <AuthContext.Provider value={{ token: signedIn, user, ready, login, logout, openAccess }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
