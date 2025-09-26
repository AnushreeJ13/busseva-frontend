// src/Portal.jsx
import { createPortal } from "react-dom";
export default function Portal({ children, to = document.body }) {
  return createPortal(children, to);
}

// In main.jsx
import Portal from "./Portal";
// ...
<Portal>
  <SiteGuideAssistant />
</Portal>
