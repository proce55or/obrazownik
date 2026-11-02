# Kolejność zadań
Tylko jedno zadanie IN_PROGRESS. Statusy: TODO, IN_PROGRESS, BLOCKED,
VERIFY_ON_MAC, DONE. Stan przyrostowy jest w STATE.md.

| Zadanie | Temat | Zależność | Status |
| --- | --- | --- | --- |
| T00 | Zgodność środowiska i zasady projektu | brak | DONE |
| T01 | Działający lokalny szkielet | T00, także warunkowo w chmurze | DONE |
| T02 | Trwałe dane i kontrakty | T01 | DONE |
| T03 | Jedno pełne ćwiczenie i podpowiedzi | T02 | DONE |
| T04 | Pozostałe ćwiczenia i pakiet treści | T03 | TODO |
| T05 | Sesje, powroty i samodzielne próby | T04 | TODO |
| T06 | Zeszyt i praca z własnym tekstem | T05 | TODO |
| T07 | Kopie, import, odzyskanie i prywatność | T06 | TODO |
| T08 | Dostępność, błędy, kompletne testy | T07 | TODO |
| T09 | Uruchamianie na Macu i prywatny GitHub | T08 | TODO |
| T10 | Pilotaż i decyzja o kolejnych zmianach | T09 | TODO |

T00 może pozostawić kontrolę sprzętu jako VERIFY_ON_MAC. Pozostałe zadania
wolno wykonać w środowisku deweloperskim. T09 nie może wtedy uzyskać DONE
bez rzeczywistego sprawdzenia na docelowym iMacu.

Do MVP prowadzą T00–T09. T10 sprawdza użyteczność, nie blokuje przekazania
działającego programu. Brak dostępu do konta GitHub nie blokuje lokalnego MVP.

Później, tylko jako oddzielny zakres: LLM, zasoby zewnętrzne, telefon,
publikacja źródeł. Zobacz docs/08-later.md. Nie implementuj ich wyprzedzająco.

## Dodatek naukowy (bieżący priorytet)

| Zadanie | Etap | Status |
| --- | --- | --- |
| T11 | SCI-00: inwentaryzacja | DONE |
| T12 | SCI-01: pochodzenie, pomoc, ekspozycja i wymiana danych | IN_PROGRESS |
| T13 | SCI-02: polskie E1 i E3 | TODO |
| T14 | SCI-03: chronione nowe pisanie E6 | TODO |
| T15 | SCI-04: warianty E2 i autorskie E5 | TODO |
| T16 | SCI-05: kopia, pilotaż i przekazanie | TODO |
