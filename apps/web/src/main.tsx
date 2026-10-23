import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// 全体のスタイルを先に読み込み、盤ごとの CSS（各 Board から読み込む）があとから上書きできるようにする
import "./styles.css";
import { App } from "./App.tsx";
import { I18nProvider } from "./i18n/index.tsx";
import { setupLine } from "./line.ts";

// LINE の中で開かれたときは、LIFF の準備（ミニアプリの URL の続きへの移動を含む）が済んでから描く
setupLine().finally(() =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <I18nProvider>
        <App />
      </I18nProvider>
    </StrictMode>,
  ),
);
