import React from "react";
import { createRoot } from "react-dom/client";
import { TerminalPanel } from "../features/terminal/renderer/TerminalPanel";

function App() {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#1e1e1e",
        color: "#d4d4d4",
      }}
    >
      <TerminalPanel projectId="test" cwd="/test/project" />
    </div>
  );
}

const root = createRoot(document.getElementById("root"));
root.render(<App />);
