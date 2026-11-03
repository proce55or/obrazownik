import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type AppView =
  "home" | "exercises" | "notebook" | "observations" | "settings" | "help";
const helpContext = createContext(true);
const sections: { id: AppView; label: string }[] = [
  { id: "home", label: "Start" },
  { id: "exercises", label: "Ćwiczenia" },
  { id: "notebook", label: "Moje teksty" },
  { id: "settings", label: "Ustawienia" },
  { id: "help", label: "Jak korzystać" },
];

export function InterfaceHelp({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const enabled = useContext(helpContext);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearTimeout(timer.current);
        setOpen(false);
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open]);
  if (!enabled) return null;
  return (
    <span
      className="interface-help"
      onMouseEnter={() => {
        timer.current = setTimeout(() => setOpen(true), 400);
      }}
      onMouseLeave={() => {
        clearTimeout(timer.current);
        setOpen(false);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="help-trigger"
        aria-label={`Objaśnienie: ${label}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
      >
        ?
      </button>
      {open && (
        <span id={id} role="tooltip" className="interface-tooltip">
          {children}
        </span>
      )}
    </span>
  );
}

export function AppShell({
  view,
  locked,
  location,
  onNavigate,
  children,
}: {
  view: AppView;
  locked: boolean;
  location?: string;
  onNavigate: (view: AppView) => void;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [help, setHelp] = useState(() => {
    try {
      return localStorage.getItem("obrazownik-interface-help-v1") !== "off";
    } catch {
      return true;
    }
  });
  const current =
    sections.find((section) => section.id === view)?.label ?? "Obserwacje";
  return (
    <helpContext.Provider value={help}>
      <a className="skip-link" href="#main">
        Przejdź do treści
      </a>
      <div className="app-shell">
        <aside className={`app-sidebar${menuOpen ? " menu-open" : ""}`}>
          <span className="brand">
            <img src="/favicon.svg" alt="" />
            obrazownik<span className="brand-dot">.</span>
          </span>
          <p className="brand-caption">Ćwicz obrazy własnymi słowami</p>
          <button
            type="button"
            className="secondary-button mobile-menu"
            aria-expanded={menuOpen}
            aria-controls="app-navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            Menu · {current}
          </button>
          <nav id="app-navigation" aria-label="Główna nawigacja">
            {sections.map((section) => (
              <button
                type="button"
                key={section.id}
                className={section.id === "help" ? "help-nav" : undefined}
                aria-current={view === section.id ? "page" : undefined}
                disabled={locked}
                onClick={() => {
                  onNavigate(section.id);
                  setMenuOpen(false);
                }}
              >
                {section.label}
              </button>
            ))}
          </nav>
          <p className="local-note">Twoje teksty zostają na tym komputerze.</p>
          {locked && (
            <p className="navigation-note">
              Aby zmienić ekran, najpierw użyj przycisku powrotu w otwartym
              tekście.
            </p>
          )}
        </aside>
        <div className="app-workspace">
          <header className="app-toolbar">
            <span>{location ?? current}</span>
            <label className="help-toggle">
              <input
                type="checkbox"
                checked={help}
                onChange={(event) => {
                  setHelp(event.target.checked);
                  try {
                    localStorage.setItem(
                      "obrazownik-interface-help-v1",
                      event.target.checked ? "on" : "off",
                    );
                  } catch {
                    /* Optional interface preference. */
                  }
                }}
              />
              Objaśnienia interfejsu
            </label>
          </header>
          <main id="main" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </helpContext.Provider>
  );
}

export function HelpPage() {
  return (
    <section className="help-page">
      <h1>Od szczegółu do małej sceny</h1>
      <p className="intro">
        Obrazownik pomaga ćwiczyć opisy, porównania i sceny. Ty piszesz, a w
        ćwiczeniu prowadzonym lokalny Bielik odpowiada na Twoje słowa.
      </p>
      <ol className="help-steps">
        <li>
          <strong>Na ekranie Start wybierz „Zacznij z Bielikiem”.</strong>{" "}
          Przejdziesz przez trzy krótkie kroki: cechę kamienia, porównanie i
          scenę.
        </li>
        <li>
          <strong>Przeczytaj polecenie i „Cel tego kroku”.</strong> Wpisz
          odpowiedź w polu. Jedno zdanie wystarczy na początek.
        </li>
        <li>
          <strong>Naciśnij „Poproś Bielika o wskazówkę”.</strong> Bielik
          przeczyta odpowiedź, wskaże konkretny fragment, opisze, co działa, i
          zaproponuje jedną poprawkę.
        </li>
        <li>
          <strong>Popraw odpowiedź albo przejdź dalej.</strong> Po zmianie
          tekstu poproś o nową wskazówkę. Nie ma punktów ani jednej prawidłowej
          wersji.
        </li>
        <li>
          <strong>Na koniec zachowaj całe ćwiczenie.</strong> W „Moich tekstach”
          znajdziesz scenę i odpowiedzi ze wszystkich kroków. Możesz też zapisać
          szkic i wrócić później.
        </li>
      </ol>
      <h2>Bez Bielika też można ćwiczyć</h2>
      <p>
        W „Ćwiczeniach” są zadania z gotowymi podpowiedziami oraz osobne,
        samodzielne pisanie. W „Ustawieniach” wybierasz rozmiar pisma, sposób
        pomocy i tworzysz kopię danych.
      </p>
      <h2>Jak rozumieć wskazówki?</h2>
      <p>
        Wskazówka dotyczy konkretnego celu językowego, na przykład wspólnej
        cechy w porównaniu. To propozycja modelu, który może się mylić. Ty
        decydujesz, które słowa zachować.
      </p>
    </section>
  );
}
