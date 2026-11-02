# Obrazownik: pakiet wykonawczy
Wersja 1.0, 2 listopada 2026. Status: specyfikacja i instrukcje, aplikacja jeszcze nie jest zbudowana. Nazwa robocza, możliwa do zmiany.

## Co dostajesz
Plan jest podzielony na małe pliki. Kolejny model ma zbudować lokalną aplikację do ćwiczenia własnego języka obrazowego. Pełne założenia nie muszą pozostawać w kontekście każdej rozmowy.

Kod, testy i neutralna dokumentacja mają być w prywatnym repozytorium. Wiersze, odpowiedzi, historia ćwiczeń, kopie danych i ewentualne modele pozostają w osobnym folderze użytkownika na iMacu. Docelowe publiczne udostępnienie jest późniejszą decyzją. Teraz nie uruchamiaj publikacji ani GitHub Pages.

Wybrano Markdown, ponieważ łatwiej czytać go selektywnie, aktualizować i porównywać w Git niż PDF.

## Jak użyć
1. Na komputerze przekaż modelowi archiwum ZIP i poniższy prompt. Rozpakowanie tworzy folder Obrazownik_plan.
2. Model używa zawartości jako dokumentacji nowego projektu. Nie nadpisuje istniejącego projektu bez porównania.
3. Jeśli masz tylko scalony Markdown, pliki są rozdzielone znacznikami BEGIN FILE i END FILE. Model mający narzędzia plikowe powinien wydzielić je skryptem, zanim zacznie czytać całość.
4. Przy kolejnej rozmowie wystarczy prompt wznowienia i dostęp do folderu lub repozytorium. Sam odnośnik do prywatnego repo bez dostępu nie wystarczy.
5. Nie trzeba dołączać dawnych raportów, danych medycznych ani prywatnych wierszy.

ZIP i scalony Markdown służą przekazaniu pakietu. W repo trzymaj rozdzielone
pliki; nie dodawaj drugiej kopii całego planu do AGENTS.md ani STATE.md.

## Prompt startowy do skopiowania
```text
Zbuduj Obrazownik na podstawie dołączonego pakietu. To aplikacja do
samodzielnego treningu polskiego języka obrazowego. Zachowaj intencję
autora: ćwiczenie własnego pisania, możliwość korzystania z podpowiedzi,
sprawdzanie samodzielności na nowych zadaniach. Nie zastępuj tego
generatorem wierszy ani punktacją jakości poezji.

Jeśli dostajesz ZIP, rozpakuj bez nadpisywania istniejących plików.
Jeśli dostajesz scalony Markdown, wydziel pliki między znacznikami
BEGIN FILE i END FILE programowo. Odrzuć ścieżki absolutne i ..;
nie wykonuj kodu podczas wydzielania dokumentacji.

Na początku przeczytaj tylko AGENTS.md, PROJECT.md, STATE.md,
tasks/INDEX.md oraz kartę aktywnego zadania. Potem otwieraj wyłącznie
sekcje specyfikacji wskazane w tej karcie i pliki potrzebne do zmiany.
Zacznij od T00. Wykonuj zadania z kryteriami odbioru, nie tylko opisuj
zamiar. Po zaliczonym zadaniu kontynuuj kolejne, jeśli pozwala czas
i kontekst. Przed przerwą zapisz mały, aktualny stan projektu.

Pracuj lokalnie i zachowuj dotychczasową pracę. GitHub ma być prywatny.
Nie publikuj aplikacji ani danych. Nie włączaj płatnego API, pobierania
dużych modeli ani treningu LLM. Nie zmieniaj systemu operacyjnego.
MVP nie potrzebuje tych elementów. Nie otwieraj serwera na sieć lokalną
ani Internet. Jeżeli brak dostępu do GitHuba, kontynuuj lokalne prace
i zapisz blokadę synchronizacji kodu.

Nie nazywaj testu w chmurze testem na iMacu. Gdy nie masz dostępu do
iMaca użytkownika, wykonaj dostępne testy i zostaw dokładną
instrukcję krótkiej weryfikacji na jego iMacu.

Uruchamiaj kontrolę rozmiaru pamięci. Aktualizuj STATE.md zamiast
dopisywać historię czatu. Nie wczytuj całego pakietu przy każdym kroku.
Nie pomijaj kryteriów zapisu, kopii danych i samodzielnych prób pisania.
Raportuj po polsku: co działa, co sprawdzono, co blokuje i co dalej.
```

## Prompt wznowienia
```text
Kontynuuj Obrazownik. Przeczytaj AGENTS.md, PROJECT.md, STATE.md,
tasks/INDEX.md i jedną wskazaną tam kartę zadania. Zweryfikuj stan
plików oraz git status; nie zakładaj, że chat pamięta wykonanie.
Nie czytaj całego planu ani archiwów. Wykonaj najbliższy niezakończony
krok, sprawdź kryteria odbioru, zaktualizuj STATE.md i uruchom
node scripts/check-context.mjs. Repozytorium pozostaje prywatne,
dane użytkownika lokalne, LLM wyłączony.
```

## Mapa
- PROJECT.md: stały cel i zakres.
- AGENTS.md: instrukcja pracy modelu.
- STATE.md: aktualny stan, nadpisywany po każdym etapie.
- tasks/INDEX.md: kolejność; tasks/Txx.md: jedna jednostka pracy.
- docs/01-product.md: zachowanie aplikacji i doświadczenie użytkownika.
- docs/02-exercises.md: ćwiczenia oraz reguły podpowiedzi.
- docs/03-architecture.md: lokalne uruchamianie i granice modułów.
- docs/04-data-api.md: dane, API, zapis i odtwarzanie.
- docs/05-acceptance.md: testy, odbiór i pilotaż użyteczności.
- docs/06-context.md: budżet kontekstu i protokół przekazania.
- docs/07-git-privacy.md: repozytorium, dane lokalne, publikacja później.
- docs/08-later.md: opcjonalny LLM, językowe zasoby i telefon.
- docs/09-sources.md: źródła i granice wniosków.
- docs/DECISIONS.md: tylko aktualne decyzje.
- scripts/check-context.mjs: gotowy, niezależny kontroler rozmiarów.

Ten pakiet nie obiecuje poprawy klinicznej. Jego zadaniem jest umożliwić
zbudowanie narzędzia, którego użyteczność dla autora można uczciwie sprawdzić.
