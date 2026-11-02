# Git, dane lokalne i przyszłe otwarcie źródeł
## G1. Co ma być gdzie
| Element | Repo prywatne teraz | Lokalny folder danych |
| --- | --- | --- |
| Kod, migracje, testy i lockfile | Tak | Niepotrzebne |
| AGENTS, PROJECT, STATE i karty zadań | Tak, bez osobistych treści | Niepotrzebne |
| Własny publiczny pakiet neutralnych ćwiczeń | Tak | Kopia z aplikacji |
| Wiersze autora, odpowiedzi i stare teksty | Nie | Tak |
| Baza, exporty, backupy i buforowe pliki | Nie | Tak |
| Modele GGUF, prywatne wektory, ewentualna LoRA | Nie | Później, jeśli potrzebne |
| Klucze API i konfiguracja z sekretami | Nie | Później poza repo |
| Przykładowe puste ustawienia | Tak | Według potrzeb |
| Surowe raporty zdrowotne i rozmowy | Nie | Nie są potrzebne aplikacji |

Git nie odbiera lokalnej kopii kodu. Kod znajduje się jednocześnie na Macu
i w zdalnym repo. Dane użytkownika mają osobny cykl kopii i nie są pushowane.

Prywatność repo nie jest zgodą na umieszczenie w nim wszystkiego.
Ogranicz dane od początku, aby późniejsze upublicznienie było możliwe.
Nie zapisuj historii operacji ani danych medycznych w README, issues lub CI.

## G2. Repozytorium prywatne
Obecny pakiet niczego na GitHubie nie tworzy. Podczas właściwej implementacji:
- Ustal czy istnieje folder/repo. Nie inicjuj nowego wewnątrz istniejącego.
- Jeśli konto i zamierzony remote są jednoznaczne oraz dostęp jest autoryzowany,
  utwórz repo z private=true. Nazwa robocza obrazownik, bez dopisywania danych osobistych.
- Jeśli istnieje repo o tej nazwie, porównaj tożsamość zamiast nadpisywać.
- Zweryfikuj widoczność odczytem metadanych, nie tylko komunikatem create.
- Brak autoryzowanego dostępu nie zatrzymuje pisania i testowania kodu lokalnie.
  Zapisz tylko blokadę push; wybór konta odłóż do chwili, gdy jest potrzebny.
- Nie zmieniaj widoczności istniejącego repo bez polecenia.
- Bez Pages, publicznych deployments i publikacji pakietów.

Małe commity po działających fragmentach. Krótkie gałęzie zadaniowe są
dopuszczalne, ale nie wprowadzaj obowiązkowego procesu zespołowego dla jednej osoby.
Przed staging sprawdź listę plików; po staging sprawdź git diff --cached.
Nie używaj force push, reset --hard ani usuwania katalogów do porządkowania pracy.

## G3. Ochrona przed przypadkowym commitem
Dołączony .gitignore jest pierwszą warstwą, nie dowodem prywatności.
Ignorowanie nie usuwa plików już śledzonych [S6].
W T09 dodaj repo-check sprawdzający śledzone i staged ścieżki:
.env i sekrety, .sqlite/.db i WAL/SHM, modele .gguf/.safetensors,
backups/exports/private/logs oraz dane produkcyjne.

Wersjonuj wyłącznie świadome syntetyczne fixtures. Nie kopiuj prawdziwej bazy
jako fixture. W repo nie może być dowiązania wskazującego na folder danych.
Skan tekstu może wspomagać wykrycie sekretów, ale nie wykrywa wszystkich
prywatnych wierszy. Najważniejsze są folder poza repo i kontrola zmian.
Nie udostępniaj treści przy okazji zgłoszenia błędu.

Jeżeli prywatne dane zostały już wysłane, samo dodanie .gitignore nie wystarczy.
Zatrzymaj kolejne push, poinformuj o zakresie. Dalsze działania zależą od
rodzaju danych; nie przepisuj historii ani nie kasuj repo bez uzgodnienia.

## G4. Licencje i późniejsza publikacja
Teraz projekt ma prywatne źródła i zamiar przyszłego wydania open source.
Nie opisuj prywatnego repo jako już publicznie dostępnego projektu.

Propozycja na wydanie: kod MIT; treści ćwiczeń z odrębną, jasną licencją
np. CC BY 4.0 po ustaleniu autorstwa i praw. To decyzja wydawnicza.
Nie zgaduj właściciela praw ani nie uzupełniaj nazwiska z pamięci modelu.
Do czasu jej ustalenia zapisz LICENSE-PLAN.md, nie fikcyjną zgodę.
Sprawdź licencje każdej zewnętrznej zależności i zasobu; nie oznaczaj
automatycznie cudzych słowników, wierszy i wektorów jako MIT.

Przyszłe publiczne wydanie wymaga osobnego polecenia oraz przeglądu historii,
licencji, sekretów, nazw ścieżek, obrazów i przykładowych danych.
Nie jest blokadą obecnego prywatnego prototypu.

GitHub Free pozwala na prywatne repozytoria, lecz zakres usług i limity CI
sprawdzaj osobno [S7]. Lokalny npm run check jest podstawą. Nie włączaj
płatnych zasobów ani dużych workflow GPU.
