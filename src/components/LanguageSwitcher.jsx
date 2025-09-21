import React from "react";
import { useTranslation } from "react-i18next";

function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const handleChange = (e) => {
    i18n.changeLanguage(e.target.value);
  };

  return (
    <div
      style={{
        position: "absolute",
        top: "20px",
        right: "20px",
        zIndex: 1000,
        background: "rgba(255, 255, 255, 0.9)",
        padding: "8px",
        borderRadius: "10px",
        backdropFilter: "blur(10px)",
      }}
    >
      <select
        value={i18n.language}
        onChange={handleChange}
        style={{
          padding: "6px 12px",
          borderRadius: "6px",
          border: "1px solid #ccc",
          background: "white",
          cursor: "pointer",
          fontSize: "14px",
        }}
      >
        <option value="en">English</option>
        <option value="hi">हिंदी</option>
        <option value="mr">marathi</option>
      </select>
    </div>
  );
}

export default LanguageSwitcher;
