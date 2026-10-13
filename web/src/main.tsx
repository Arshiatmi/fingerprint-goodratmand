import React from "react";
import { createRoot } from "react-dom/client";
import EnrollForm from "./EnrollForm";
import "./styles.css";
import "@fontsource/vazirmatn/arabic-400.css";
import "@fontsource/vazirmatn/arabic-600.css";
import "@fontsource/vazirmatn/latin-400.css";
import "@fontsource/vazirmatn/latin-600.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <EnrollForm />
  </React.StrictMode>,
);
