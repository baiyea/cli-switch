import React from "react";
import ReactDOM from "react-dom/client";
import { Switch } from "./components/ui/switch";
import "./styles.css";

const TestPage = () => (
  <div style={{ padding: "50px", background: "#0f141d", height: "100vh", display: "flex", gap: "20px", alignItems: "center" }}>
    <div style={{ color: "white" }}>OFF:</div>
    <Switch checked={false} />
    <div style={{ color: "white", marginLeft: "20px" }}>ON:</div>
    <Switch checked={true} />
  </div>
);

ReactDOM.createRoot(document.getElementById("root")).render(<TestPage />);
