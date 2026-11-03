# Odbiór poprawek po przeglądzie z03.11

Zakres T19 zaakceptowany przez użytkownika po omówieniu zewnętrznej oceny.
Wersja0.2.1, format bazy nadal3. Pilotaż autora pozostaje osobnym T10.

## Zachowanie
- Krótka sesja po wykorzystaniu świeżych kart proponuje oznaczone powtórki,
  najpierw puste przerwane ćwiczenia, potem najdawniej używane. Nie kasuje
  historii ekspozycji ani nie używa chronionej rezerwy. Pierwsze ukończenie
  po pustym przerwaniu nadal planuje powroty2/7/21. W sesji nie ma dwóch
  zadań o wspólnym pochodzeniu.
- Klient rozróżnia konflikt rewizji, zwykłą odmowę i nieznany wynik zapisu.
  Po utracie odpowiedzi ponawia ten sam identyfikator; interfejs podaje
  jawną czynność ponowienia zakończenia. Nowsza odpowiedź API daje polski
  komunikat zamiast surowego błędu walidatora.
- Tytuł dokumentu ma wspólny autosave i bufor z treścią. Odczyt bufora ma
  timeout i możliwość ponowienia. Pisanie nie wykonuje pełnego zapisu
  IndexedDB przy każdym klawiszu; przy ciągłym pisaniu zapis do bufora jest zlecany najpóźniej
  po500ms. Ostatnia zmiana jest utrwalana przy flush,
  opuszczaniu edytora i na zdarzeniach wyjścia strony (best effort).
- Ustawienia udostępniają pozostawione kopie także zamkniętych tekstów.
  Kopię można pobrać, a następnie świadomie usunąć. Usunięcie porównuje
  dokładną wartość w jednej transakcji. Nieznane rekordy mają osobny eksport
  bez usuwania dodatkowych pól; dane nieprzenoszalne bezstratnie do JSON
  nie są automatycznie kasowane.
- Pismo16–26px obejmuje cały interfejs, ważne etykiety mają min1rem.
  Pola używają fontu systemowego, obramowania i fokus są wyraźniejsze.
  Dzisiaj pokazuje główną sesję i ostatni szkic; reszta jest pod Więcej.
  Strefę czasową wybiera się z listy. Komunikaty sukcesu mają osobny wygląd.
- Zredagowano91 kart w nowych wersjach, zachowując94 starsze wersje bez
  zmian. Selektor nowych prób wybiera najnowszą wersję, a wcześniej widziane
  tematy pozostają widziane. E7 i słownik odpowiadają aktualnemu schematowi.
- Bielik pozostaje opcjonalnym eksperymentem: pytanie do karty, bez tekstu
  autora w modelu. Źródło faktycznej pomocy pozostaje zapisane i dostępne.

## Dowody
116 testów jednostkowych/integracyjnych PASS,22 pliki. Walidacja treści,
TypeScript, ESLint, kontrola kontekstu i prywatności repo PASS.
Kompilacja0.2.1 PASS. Osobny odbiór ustawień26px/320px PASS.
Pełne E2E z rzeczywistym Bielikiem PASS, w tym pisanie podczas preparing
i aktualny pre_hint. Produkcja po sprawdzonej kopii i łagodnym restarcie:
0.2.1/schema3/healthOK, Bielik dostępny. Szczegóły w karcie T19.

Safari i ręczny dwuklik Findera pozostają do sprawdzenia przez autora.
Działający kod nie zastępuje jego oceny przydatności podpowiedzi.
