# Odbiór pierwszego działającego etapu T00–T03

Zapis historyczny. Aktualny odbiór pełnego programu:
[11-release-verification.md](11-release-verification.md).

Sprawdzenie 2026-11-02 na lokalnym Intel/macOS 13.7.8, Node 24.21.0.
Nie jest to odbiór pełnego MVP ani pilotaż użyteczności.

- `npm run check`: PASS, 15 testów logiki i API, TypeScript strict, lint,
  kontrola pamięci. SQLite i migracje testowane wyłącznie w tmpdir.
- `npm run build`: PASS; jeden produkcyjny serwer dla API i lokalnych zasobów.
- `npm run doctor`: PASS w osobnym folderze testowym; Unicode, nowe linie,
  transakcja, ponowne otwarcie, backup API i odczyt kopii.
- `npm audit`: 0 podatności w sprawdzonym lockfile. Overrides glob/minimatch
  są świadomie przypięte; ich zmiany wymagają ponownego lint/build/testów.
- `npm run test:e2e`: PASS, osobny Chrome i proces serwera, syntetyczne dane,
  odświeżenie strony oraz rzeczywisty restart procesu z tą samą testową bazą.

Przeglądarka → utworzenie próby → zapis tekstu → 3 poziomy pomocy → schowanie
panelu → flush nowego tekstu przy ukończeniu → final → samoocena → odczyt po
restarcie: potwierdzone. Zachowane spacje, polskie znaki i nowe linie.
Nie ma przykładowej odpowiedzi w początkowej liście kart ani w polu autora.

Błąd sieci → tekst w edytorze → bufor IndexedDB → potwierdzenie ostrzeżenia
przy odświeżeniu → odzyskanie: potwierdzone. Dwie karty → konflikt 409 →
osobna wersja odzyskanego tekstu przy zachowaniu nowszego currentText:
potwierdzone. Zgubiona odpowiedź po przygotowaniu podpowiedzi → ponowienie
tego samego mutationId → jeden event i jedna wersja pre_hint: potwierdzone.

Testy integracyjne sprawdzają też zachowanie uszkodzonej/nowszej bazy,
rollback DDL/danych i sprawdzoną kopię sprzed nieudanej migracji, blokadę
procesu, Host/Origin/CSRF, limity tekstu i odrzucenie niepoprawnych danych.
Obsługę błędów sprawdzono z włączonym i wyłączonym static plugin.

Przejrzano obrazy desktop i 320/390 px, długi polski tekst oraz fokus.
Przejście Tab rozpoczyna od linku do treści. Przy 320 px brak poziomego
przewijania. Zrzuty syntetyczne: output/playwright/e2e-*.png, poza Git.
Kontrast i pełny audyt dostępności pozostają w T08.

Rzeczywiste Safari 18.6 wykryto w systemie, ale usługa automatycznej obsługi
aplikacji nie uruchomiła się. To nie jest zaliczony test Safari. Do ręcznej
kontroli: otworzyć lokalny adres, wykonać kartę, użyć pomocy, zakończyć,
wrócić do tekstu i odświeżyć; sprawdzić powiększenie i klawiaturę.

T04–T09 pozostają do wykonania. Szczególnie: 5 rodzin i 60+20 kart,
niezależne próby, pełny zeszyt oraz kopie/eksport/import. Testy techniczne
nie dowodzą korzyści użytkowej; tę sprawdzi T10.
