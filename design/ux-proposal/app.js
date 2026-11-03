/* global document, window, localStorage, location, setTimeout, clearTimeout */
/* Isolated design prototype. No app API, model calls or persistent writing data. */
const main = document.getElementById("main");
const toggle = document.getElementById("hints-enabled");
const menu = document.getElementById("mobile-menu");
menu.addEventListener("click", () => {
  const open = menu.getAttribute("aria-expanded") !== "true";
  menu.setAttribute("aria-expanded", String(open));
  document.querySelector(".sidebar").classList.toggle("menu-open", open);
});
const topics = [
  {
    id: "stone",
    name: "Kamień",
    title: "Opisz jedną cechę kamienia",
    note: "Pomyśl o kamieniu w dłoni. Opisz jedną jego cechę w jednym lub dwóch zdaniach.",
  },
  {
    id: "cup",
    name: "Filiżanka",
    title: "Opisz jeden szczegół filiżanki",
    note: "Pomyśl o filiżance. Wybierz jeden widoczny szczegół i opisz go jednym zdaniem.",
  },
  {
    id: "key",
    name: "Klucz",
    title: "Opisz jedną cechę klucza",
    note: "Pomyśl o kluczu w dłoni. Opisz jedną jego cechę w jednym lub dwóch zdaniach.",
  },
];
let topic = topics[0],
  text = "",
  mode = "off",
  started = false,
  finished = false,
  showExerciseHelp = false;
let tooltipTimer,
  closeTimer,
  dismissed = null;
function preference(key, fallback) {
  try {
    return localStorage.getItem("obrazownik-design-" + key) ?? fallback;
  } catch {
    return fallback;
  }
}
function savePreference(key, value) {
  try {
    localStorage.setItem("obrazownik-design-" + key, value);
  } catch {
    /* Optional preview preferences. */
  }
}
toggle.checked = preference("explanations", "on") === "on";
document.documentElement.style.fontSize = preference("font", "18") + "px";
function escapeHtml(value) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function help(id, heading, description, level = "h2") {
  return `<div class="help-section" data-help="${id}"><div class="help-heading"><${level}>${heading}</${level}><button class="help-trigger" aria-label="Objaśnienie: ${heading}" aria-describedby="tip-${id}" type="button">?</button></div><div class="tooltip" role="tooltip" id="tip-${id}" hidden>${description}</div></div>`;
}
function modes() {
  return `<fieldset class="mode"><legend>Pomoc w ćwiczeniu</legend><div class="mode-options"><label><input type="radio" name="mode" value="off" ${mode === "off" ? "checked" : ""}> Bez Bielika</label><label><input type="radio" name="mode" value="local" ${mode === "local" ? "checked" : ""}> Z Bielikiem</label></div><p class="compact subtle" id="mode-note">${modeNote()}</p></fieldset>`;
}
function modeNote() {
  return mode === "local"
    ? "Bielik może przygotować dodatkowe pytanie do tematu. Nie czyta Twojego tekstu. W tym podglądzie model nie jest uruchamiany."
    : "Możesz pisać samodzielnie. Gotowa podpowiedź będzie dostępna, jeśli jej potrzebujesz.";
}
function route() {
  const value = location.hash.slice(1) || "start";
  return [
    "start",
    "exercises",
    "writing",
    "done",
    "texts",
    "settings",
    "help",
  ].includes(value)
    ? value
    : "start";
}
function openRoute(name) {
  if (route() === name) render();
  else location.hash = name;
}
function closeTooltip() {
  clearTimeout(tooltipTimer);
  clearTimeout(closeTimer);
  document.querySelectorAll(".tooltip").forEach((el) => (el.hidden = true));
}
function revealTooltip(section) {
  if (!toggle.checked || dismissed === section) return;
  closeTooltip();
  section.querySelector(".tooltip").hidden = false;
}
function installHelp() {
  main.querySelectorAll("[data-help]").forEach((section) => {
    const trigger = section.querySelector(".help-trigger");
    section.addEventListener("pointerenter", () => {
      clearTimeout(closeTimer);
      tooltipTimer = setTimeout(() => revealTooltip(section), 400);
    });
    section.addEventListener("pointerleave", () => {
      dismissed = null;
      clearTimeout(tooltipTimer);
      if (!section.contains(document.activeElement))
        closeTimer = setTimeout(closeTooltip, 150);
    });
    trigger.addEventListener("focus", () => revealTooltip(section));
    trigger.addEventListener("blur", () => {
      dismissed = null;
      closeTooltip();
    });
    trigger.addEventListener("click", () => {
      dismissed = null;
      revealTooltip(section);
    });
  });
}
function applyHelp() {
  document.body.classList.toggle("help-disabled", !toggle.checked);
  closeTooltip();
  savePreference("explanations", toggle.checked ? "on" : "off");
}
toggle.addEventListener("change", applyHelp);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    const visible = [...document.querySelectorAll("[data-help]")].find(
      (el) => !el.querySelector(".tooltip").hidden,
    );
    if (visible) {
      dismissed = visible;
      closeTooltip();
      event.preventDefault();
    }
  }
});
function start() {
  if (started && !finished)
    return `<h1>Wróć do swojego ćwiczenia</h1><p class="intro">Twój tekst nadal jest w tym podglądzie. Możesz spokojnie kontynuować.</p><section class="suggestion"><span class="eyebrow">Otwarte ćwiczenie</span><h2>${topic.name}</h2><p class="subtle">${topic.note}</p><p>Wybrana pomoc: ${mode === "local" ? "Bielik" : "gotowe podpowiedzi"}.</p><div class="actions"><a class="primary" href="#writing">Kontynuuj ćwiczenie</a><a class="text-button" href="#texts">Zobacz mój tekst</a></div></section>`;
  return `<h1>Zacznij od jednego zdania</h1><p class="intro">Obrazownik pomaga ćwiczyć opisywanie i wyobraźnię. Wybierz ćwiczenie, napisz własne słowa i zachowaj je dla siebie.</p>
 <div class="start-grid"><section class="suggestion"><span class="eyebrow">Propozycja na początek</span>${help("suggestion", "Opisz przedmiot", "W tym ćwiczeniu wybierasz jedną cechę zwykłego przedmiotu i opisujesz ją własnymi słowami. Nie musisz tworzyć wiersza.")}<p class="subtle">Temat: <strong>kamień</strong>. Jedno zdanie wystarczy.</p>${modes()}<div class="actions"><button class="primary" data-action="start">Rozpocznij ćwiczenie</button></div><a class="text-button small-gap" href="#exercises">Wybierz inne ćwiczenie</a></section>
 <aside class="how">${help("how", "Jak to działa", "To trzy części całej drogi. Pisanie odbywa się na jednym ekranie, bez przechodzenia przez serię formularzy.", "h3")}<ol><li><strong>Wybierz temat.</strong><br>Możesz przyjąć propozycję.</li><li><strong>Napisz własne słowa.</strong><br>Podpowiedź jest dobrowolna.</li><li><strong>Zakończ ćwiczenie.</strong><br>Wrócisz do tekstu w zeszycie.</li></ol></aside></div>`;
}
function exercises() {
  return `<h1>Ćwiczenia</h1><p class="intro">Wybierz, o czym chcesz pisać. Zaczynamy od opisu jednej cechy.</p>${started && !finished ? '<p class="state-note">Masz otwarte ćwiczenie. <a href="#writing">Kontynuuj je</a> — jego tekst pozostaje w tym podglądzie.</p>' : ""}<div class="list">${topics.map((item) => `<section class="list-item"><div><h2>${item.name}</h2><p class="subtle">${item.note}</p></div><button class="secondary" data-topic="${item.id}" ${started && !finished && item.id !== topic.id ? "disabled" : ""}>${started && !finished && item.id === topic.id ? "Kontynuuj" : "Wybierz: " + item.name}</button></section>`).join("")}</div><p class="state-note">W podglądzie są trzy przykładowe tematy. Pełny katalog i pozostałe rodzaje ćwiczeń dołączą do tej samej sekcji.</p>${modes()}`;
}
function writing() {
  return `<div class="trail" aria-label="Ścieżka"><a href="#exercises">Ćwiczenia</a><span aria-hidden="true">/</span><span>${topic.name}</span><span aria-hidden="true">/</span><span>Pisanie</span></div><div class="writing-grid"><section><span class="eyebrow">Teraz: napisz jedno lub dwa zdania</span><h1>${topic.title}</h1><p class="instruction" id="instruction">${topic.note} Gdy skończysz, wybierz „Zakończ ćwiczenie”.</p><div class="field-heading"><label for="writing">Twój tekst</label><div class="help-section" data-help="field"><button class="help-trigger" aria-label="Objaśnienie pola Twój tekst" aria-describedby="tip-field">?</button><div class="tooltip" id="tip-field" role="tooltip" hidden>Wpisuj tutaj swoją odpowiedź. Możesz ją poprawiać. Przejście do menu nie usuwa tekstu podczas tej wizyty w podglądzie.</div></div></div><textarea class="writing-field" id="writing" aria-describedby="instruction draft-note" placeholder="Wpisz tutaj swoje zdanie…" maxlength="50000">${escapeHtml(text)}</textarea><p class="field-note" id="draft-note">Podgląd: tekst pozostaje tylko w tej otwartej karcie.</p><div class="actions"><button class="primary" data-action="finish">Zakończ ćwiczenie</button><a class="text-button" href="#start">Przerwij i wróć później</a></div><p id="empty-note" class="state-note" role="status" hidden>Napisz choć jedno słowo albo wybierz „Przerwij i wróć później”.</p></section><aside class="help-panel">${help("writing-help", "Potrzebujesz pomocy?", "Objaśnienia mówią, jak obsługiwać program. Przycisk poniżej odsłania podpowiedź do samego ćwiczenia. To dwie różne rzeczy.", "h2")}<p>${mode === "local" ? "Wybrana pomoc: Bielik.<br>Pytanie dotyczy tematu, nie ocenia Twojego tekstu." : "Możesz poprosić o jedno pytanie naprowadzające."}</p><button class="secondary" data-action="exercise-help" aria-expanded="${showExerciseHelp}">${showExerciseHelp ? "Schowaj podpowiedź" : "Pokaż podpowiedź"}</button><div class="help-result" ${showExerciseHelp ? "" : "hidden"}><p>Pomyśl o tym, czego można dowiedzieć się przez dotyk.</p><small>${mode === "local" ? "Demonstracja miejsca na pytanie Bielika. Ten tekst nie został wygenerowany przez model." : "Przykładowa gotowa podpowiedź."}</small></div><p class="small-gap compact">Nie musisz używać pomocy ani dopisywać więcej.</p></aside></div>`;
}
function done() {
  return `<section class="completion"><span class="eyebrow">Koniec ćwiczenia · podgląd</span><h1>To ćwiczenie jest gotowe</h1><p class="intro">Możesz zakończyć na dziś. W gotowej aplikacji znajdziesz ten tekst w „Moje teksty”.</p><h2>${topic.name}</h2><p class="text-preview">${escapeHtml(text) || "Brak tekstu w tym podglądzie."}</p><p class="field-note">To demonstracja zakończenia. Nic nie zostało zapisane do bazy Obrazownika.</p><div class="actions"><a class="primary" href="#start">Wróć na start</a><a class="secondary" href="#texts">Zobacz mój tekst</a></div></section>`;
}
function texts() {
  return `<h1>Moje teksty</h1><p class="intro">Tutaj znajdą się szkice i ukończone teksty. W podglądzie widać tylko to, co wpiszesz podczas tej wizyty.</p>${text ? `<section class="list-item"><div><span class="eyebrow">${finished ? "Zakończone ćwiczenie" : "Szkic"}</span><h2>${topic.name}</h2><p class="text-preview">${escapeHtml(text)}</p></div><a class="secondary" href="#${finished ? "done" : "writing"}">${finished ? "Otwórz" : "Kontynuuj"}</a></section>` : '<p>Nie masz jeszcze tekstu w tym podglądzie.</p><a class="primary" href="#start">Zacznij pierwsze ćwiczenie</a>'}<p class="state-note">Historia ćwiczeń, własne notatki i obserwacje będą dostępne w tej sekcji pełnej aplikacji.</p>`;
}
function settings() {
  const size = parseInt(document.documentElement.style.fontSize) || 18;
  return `<h1>Ustawienia</h1><p class="intro">Dopasuj czytelność i pomoc. Zmiany dotyczą tylko tego podglądu.</p><section class="settings-row"><label for="font-size">Wielkość tekstu</label><select id="font-size">${[18, 20, 22, 24, 26].map((n) => `<option value="${n}" ${size === n ? "selected" : ""}>${n} px${n === 18 ? " — standardowy" : ""}</option>`).join("")}</select><p class="small-gap subtle">Zmiana obejmuje menu, polecenia i pole do pisania.</p></section><section class="settings-row">${help("ui-help", "Objaśnienia interfejsu", "Pomoc pojawia się po najechaniu na nagłówek sekcji, po ustawieniu klawiaturą na znaku zapytania lub po jego kliknięciu. Esc zamyka objaśnienie.")}<p>Przełącznik u góry ekranu włącza i wyłącza dodatkowe objaśnienia. Polecenia do ćwiczeń pozostają widoczne.</p></section><section class="settings-row">${modes()}</section><p class="state-note">Kopie, import, eksport i informacje techniczne pozostaną w ustawieniach pełnej aplikacji.</p>`;
}
function assistance() {
  return `<h1>Jak korzystać z Obrazownika</h1><ol class="plain-list"><li>Na ekranie <strong>Start</strong> wybierz „Rozpocznij ćwiczenie”. Możesz wybrać pomoc Bielika przed rozpoczęciem.</li><li>Przeczytaj krótkie polecenie bezpośrednio nad polem <strong>Twój tekst</strong>.</li><li>Napisz własne zdanie. Możesz skorzystać z przycisku „Pokaż podpowiedź”.</li><li>Wybierz <strong>Zakończ ćwiczenie</strong>. Samodzielnie decydujesz, czy tekst jest gotowy.</li></ol><hr class="divider"><h2>Pomoc przy przyciskach i sekcjach</h2><p class="intro">Najedź na nagłówek z pytajnikiem lub kliknij pytajnik. Klawisz Tab pozwala dotrzeć do niego klawiaturą. Esc zamyka objaśnienie. Przełącznik „Objaśnienia interfejsu” wyłącza te dymki.</p><a class="primary" href="#start">Przejdź na start</a>`;
}
function render() {
  closeTooltip();
  dismissed = null;
  const view = route();
  if (view === "writing") started = true;
  const nav = view === "writing" || view === "done" ? "exercises" : view;
  const labels = {
    start: "Start",
    exercises: "Ćwiczenia",
    writing: "Ćwiczenia / Pisanie",
    done: "Ćwiczenia / Zakończenie",
    texts: "Moje teksty",
    settings: "Ustawienia",
    help: "Jak korzystać",
  };
  document.getElementById("location").textContent = labels[view];
  menu.textContent = "Menu · " + labels[view].split(" / ")[0];
  menu.setAttribute("aria-expanded", "false");
  document.querySelector(".sidebar").classList.remove("menu-open");
  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === nav) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  const renders = {
    start,
    exercises,
    writing,
    done,
    texts,
    settings,
    help: assistance,
  };
  main.innerHTML = renders[view]();
  installHelp();
  applyHelp();
  main.querySelectorAll("[name=mode]").forEach((input) => {
    input.disabled = started && !finished;
    input.addEventListener("change", () => {
      mode = input.value;
      document.getElementById("mode-note").textContent = modeNote();
    });
  });
  main.querySelector("#writing")?.addEventListener("input", (event) => {
    text = event.target.value;
    document.getElementById("empty-note").hidden = true;
  });
  main.querySelector("#font-size")?.addEventListener("change", (event) => {
    document.documentElement.style.fontSize = event.target.value + "px";
    savePreference("font", event.target.value);
  });
  main.focus();
  window.scrollTo(0, 0);
}
main.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.topic) {
    topic = topics.find((item) => item.id === button.dataset.topic);
    if (finished) {
      text = "";
      finished = false;
    }
    started = true;
    showExerciseHelp = false;
    openRoute("writing");
  }
  if (button.dataset.action === "start") {
    if (finished || !started) {
      topic = topics[0];
      text = "";
      showExerciseHelp = false;
    }
    started = true;
    finished = false;
    openRoute("writing");
  }
  if (button.dataset.action === "finish") {
    if (!text.trim()) {
      document.getElementById("empty-note").hidden = false;
      document.getElementById("writing").focus();
      return;
    }
    finished = true;
    openRoute("done");
  }
  if (button.dataset.action === "exercise-help") {
    showExerciseHelp = !showExerciseHelp;
    button.textContent = showExerciseHelp
      ? "Schowaj podpowiedź"
      : "Pokaż podpowiedź";
    button.setAttribute("aria-expanded", String(showExerciseHelp));
    main.querySelector(".help-result").hidden = !showExerciseHelp;
  }
});
document.querySelector(".skip").addEventListener("click", (event) => {
  event.preventDefault();
  main.focus();
  main.scrollIntoView();
});
window.addEventListener("hashchange", render);
render();
