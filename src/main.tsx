import React from "react";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import FingerCountPage from "../app/fingers/page";
import "../app/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("AirDraw root element is missing.");
createRoot(root).render(
  <React.StrictMode>
    {window.location.pathname.replace(/\/$/, "") === "/fingers" ? (
      <FingerCountPage />
    ) : (
      <Home />
    )}
  </React.StrictMode>,
);
