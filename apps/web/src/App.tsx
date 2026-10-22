import { useEffect } from "react";
import { usePath } from "./router.ts";
import { LANGS, useI18n, type Lang } from "./i18n/index.tsx";
import { Home } from "./pages/Home.tsx";
import { Join } from "./pages/Join.tsx";
import { Play } from "./pages/Play.tsx";

export function App() {
  const path = usePath();
  const { lang, setLang, t } = useI18n();
  const join = path.match(/^\/join\/([\w-]+)$/);
  const play = path.match(/^\/g\/([\w-]+)$/);

  useEffect(() => {
    document.title = t("app.name");
  }, [t]);

  return (
    <div className="app">
      <header className="app-header">
        <a href="/" className="logo">{t("app.name")}</a>
        <select
          className="lang"
          aria-label={t("lang.label")}
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
        >
          {LANGS.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
      </header>
      <main>
        {join ? <Join id={join[1]!} /> : play ? <Play key={play[1]} id={play[1]!} /> : <Home />}
      </main>
    </div>
  );
}
