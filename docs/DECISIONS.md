# Aktualne decyzje
Wpisy opisują obowiązujący projekt. Historię zmian przechowuje Git.
Data bazowa: 2026-11-02.

- D01: Lokalny frontend + Node + SQLite. Powód: automatyczny zapis
  w folderze na Macu. Zastępuje wcześniejsze MVP oparte wyłącznie na IndexedDB.
- D02: Node 24 LTS z konkretną sprawdzoną poprawką. node:sqlite ma
  jawnie przyjęty status RC, izolowany adapter i obowiązkowy test danych.
- D03: Repo prywatne, dane poza repo. Publiczne wydanie tylko później.
- D04: Model nie jest wymagany do ćwiczeń. T17 dodał opcjonalny lokalny
  eksperyment, domyślnie wyłączony: pytanie do karty bez tekstu autora.
  Jego przydatność ocenia autor; samodzielna rezerwa pozostaje bez modelu.
- D05: 5 rodzin + osobne nowe próby bez pomocy. Rzadkość nie jest jakością.
- D06: Cztery pliki pamięci <=10 KiB łącznie; szczegóły czytane na żądanie.
- D07: Mac jest pierwszą platformą. Dostęp z telefonu i synchronizacja później.
- D08: Autorstwo i licencja treści do ustalenia przed publicznym wydaniem;
  nie blokuje to prywatnej implementacji ani prywatnego używania.
- D09: W podstawowym interfejsie: ćwiczenie (praca z poleceniem), tekst
  (odpowiedź autora), podpowiedź (ujawniana pomoc), Zapisz (akcja).
  Próba oznacza jeden zapisany przebieg ćwiczenia; karta jest wersjonowaną
  definicją treści. Nazwy zbiorów i techniczne metadane należą do szczegółów.
- D10: Redakcja istniejących kart zachowuje poprzednią wersję i tożsamość
  tematu. Bez nowej paczki, zmiany ról zbiorów i resetowania historii.

Nie dodawaj tu bieżących logów błędów. Problemy realizacyjne są w STATE.md.
