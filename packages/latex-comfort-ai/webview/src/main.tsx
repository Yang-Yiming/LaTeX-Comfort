import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AgentApp } from "./AgentApp";
import "./theme.css";

const surface = document.body.dataset.reviewSurface;
const root = createRoot(document.getElementById("root")!);

root.render(
  <StrictMode>
    {surface === "agent" ? <AgentApp /> : <App />}
  </StrictMode>,
);
