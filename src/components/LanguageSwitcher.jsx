import React from "react";
import { useTranslation } from "react-i18next";

function LanguageSwitcher() {
  const { i18n } = useTranslation();

  return (
    <div
      style={{
        position: "absolute",
        top: "20px",
        right: "20px",
        zIndex: 1000,
        background: "rgba(255, 255, 255, 0.9)",
        padding: "10px",
        borderRadius: "10px",
        backdropFilter: "blur(10px)",
      }}
    >
      <button
        onClick={() => i18n.changeLanguage("en")}
        style={{
          marginRight: "10px",
          padding: "5px 15px",
          background: i18n.language === "en" ? "#4f46e5" : "#e2e8f0",
          color: i18n.language === "en" ? "white" : "#374151",
          border: "none",
          borderRadius: "6px",
          cursor: "pointer",
        }}
      >
        English
      </button>
      <button
        onClick={() => i18n.changeLanguage("hi")}
        style={{
          padding: "5px 15px",
          background: i18n.language === "hi" ? "#4f46e5" : "#e2e8f0",
          color: i18n.language === "hi" ? "white" : "#374151",
          border: "none",
          borderRadius: "6px",
          cursor: "pointer",
        }}
      >
        हिंदी
      </button>
    </div>
  );
}

export default LanguageSwitcher;
