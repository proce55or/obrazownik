# Obrazownik

Lokalna przestrzeń do ćwiczenia własnego języka obrazowego po polsku.
Autor pisze sam. Podpowiedzi są dobrowolne, a program nie ocenia poezji.

Pierwszy działający etap (T00–T03): trzy karty ćwiczenia „Właściwość i obraz”,
automatyczny zapis szkiców, trzy stopnie pomocy, zachowane wersje sprzed
pomocy i wersja końcowa, przerwa, pominięcie oraz opcjonalne własne obserwacje.
Tekst można ponownie otworzyć ze strony Dzisiaj.

Pozostałe cztery rodziny, samodzielne próby na nowych tematach, sesje,
pełny zeszyt i narzędzia kopii/eksportu są w kolejnych zadaniach.
To jeszcze nie kompletne MVP. Aktualny stan: [STATE.md](STATE.md).

## Uruchomienie

W terminalu otwartym w tym katalogu, z Node **24.21.x**:

```sh
npm ci
npm run doctor
npm run build
npm start
```

Zależności są już zainstalowane w bieżącym środowisku. Przy kolejnym
uruchomieniu wystarczy `npm start`; build ponów po zmianie kodu.
Otwórz [Obrazownik](http://127.0.0.1:4317). Zatrzymanie: Ctrl+C w terminalu
serwera. Edytor ma przycisk „Zapisz szkic i wróć”; poczekaj na potwierdzenie
zapisu przed zamknięciem. Po instalacji i buildzie ćwiczenia działają bez
Internetu. Pierwsza instalacja zależności wymaga sieci.

Program nasłuchuje tylko na 127.0.0.1. Nie ma CDN, konta, telemetrii, LLM,
płatnego API ani synchronizacji. Telefon nie ma dostępu do bazy Maca.

## Dane

SQLite jest źródłem prawdy. Folder domyślny: `~/Obrazownik-dane`, poza kodem.
Alternatywna konfiguracja przy zatrzymanym serwerze:

```sh
OBRAZOWNIK_DATA_DIR="/absolutna/sciezka/do/osobnego-folderu" npm start
```

Folder wewnątrz repo, także przez dowiązanie, jest odrzucany.
Nie przenoś bazy podczas działania serwera. Narzędzia pełnych kopii,
przywracania i eksportu zostaną dodane w T07; obecny bufor przeglądarki
jest tylko pomocą awaryjną i nie zastępuje kopii danych.

Gdy zapis się nie powiedzie, tekst zostaje w edytorze; można go skopiować
lub ponowić zapis. Przy wznowieniu aplikacja proponuje odzyskanie szkicu
z małego bufora IndexedDB (maks. 10 szkiców / 1 MiB, odrębny identyfikator
środowiska). Konflikt z inną kartą wymaga zachowania osobnej wersji,
zamiast automatycznego nadpisania tekstu na serwerze. Nie można zagwarantować
zachowania zmian, których ani serwer, ani bufor nie zdążył potwierdzić.

Folder ma blokadę pojedynczego procesu. Po awarii sprawdź PID zapisany
w `.obrazownik-lock/owner.json` oraz `ps -p PID -o pid,lstart,command`.
Nie usuwaj blokady, jeśli proces jeszcze działa lub jego tożsamość jest
niejasna. Sam brak odpowiedzi portu nie dowodzi, że serwer się zatrzymał.
Nie uruchamiaj drugiej instancji na tej samej bazie.

## Rozwój i weryfikacja

```sh
npm run dev       # lokalny Vite 5173 i API 4317
npm run check     # strict TypeScript, lint, testy, limit pamięci projektu
npm run build
npm run test:e2e  # własny serwer i dane tymczasowe, osobna sesja Chrome
```

Przed `test:e2e` zatrzymaj serwer zajmujący port 4317. Test odmawia
uruchomienia na zajętym porcie; nie zamyka cudzego procesu i nigdy nie
korzysta z rzeczywistych danych. Sprawdza pomoc, final, ponowienie niepewnego
zapisu, konflikt dwóch kart, odzyskanie po odświeżeniu i restart procesu.
Obrazy testowe: `output/playwright/` (ignorowane przez Git).

Testy interfejsu wykonano na tym Macu w Chromium. Automatyczna obsługa
rzeczywistego Safari była niedostępna; cel produkcyjnego buildu Safari 16.6
wymaga jeszcze krótkiego ręcznego sprawdzenia: otwarcie, wpis, podpowiedź,
zapis, powrót do tekstu i odświeżenie. Nie jest to deklaracja pełnej
zgodności Safari ani zakończenia audytu dostępności T08.

Kod jest w lokalnym repo Git bez skonfigurowanego remote. Niczego nie
opublikowano. Materiały źródłowe i zadania pozostają w [START.md](START.md).
