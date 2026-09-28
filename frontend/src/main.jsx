import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./lib/theme";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/shell.css";
import "./styles/dashboard.css";
import "./styles/pages.css";

function render() {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </React.StrictMode>
  );
}

// The faces are self-hosted but still load asynchronously; painting the first
// screen before they arrive shows a system-font flash. Wait for them, but never
// longer than a second so a slow device is not left with a blank page.
const fontsReady = document.fonts
  ? Promise.all([
      document.fonts.load('500 16px "Geist Variable"'),
      document.fonts.load('500 16px "Geist Mono Variable"'),
    ])
  : Promise.resolve();
Promise.race([fontsReady, new Promise((resolve) => setTimeout(resolve, 1000))]).finally(render);
