import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import EnrollForm from "./EnrollForm";
import IdentifyPage from "./IdentifyPage";
import "./styles.css";
import "@fontsource/vazirmatn/arabic-400.css";
import "@fontsource/vazirmatn/arabic-600.css";
import "@fontsource/vazirmatn/latin-400.css";
import "@fontsource/vazirmatn/latin-600.css";

function App() {
  const [tab, setTab] = useState<"enroll" | "identify">("enroll");

  return (
    <>
      <div
        className="no-print"
        dir="rtl"
        style={{ display: "flex", gap: 8, padding: 16, justifyContent: "center" }}
      >
        <button onClick={() => setTab("enroll")}>ثبت‌نام</button>
        <button onClick={() => setTab("identify")}>شناسایی و چاپ</button>
      </div>

      {tab === "enroll" ? <EnrollForm /> : <IdentifyPage />}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);