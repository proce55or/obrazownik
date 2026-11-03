# Stan projektu
Updated: 2026-11-03, Europe/Warsaw
Active task: T20
Status: PROPOSAL_READY — research i klikalny projekt UX/UI
Environment: macOS13.7.8 Intel, Node24.21.0
Branch: main; Release:0.2.1, schema3
Remote: proce55or/obrazownik (PRIVATE)

## Wdrożony program
MVP + SCI-00–05 + T17/T18 + T19. Aplikacja127.0.0.1:4317,
Bielik4320. T19 odebrane i wdrożone: docs/16-review-fixes.md.
116 testów/22 pliki, check/build i pełne E2E z rzeczywistym Bielikiem PASS.
Safari i ręczny dwuklik Findera nadal VERIFY_ON_MAC.
Dane ~/Obrazownik-dane; wagi ~/Obrazownik-modele/bielik-7b, poza Git.

## T20 — projekt, jeszcze bez wdrożenia
Autor zgłosił niezrozumiałą obsługę i poprosił najpierw o research designu.
Audyt czterech ekranów na osobnej bazie tmpdir: zagnieżdżony katalog,
pole pisania daleko pod instrukcją, znikające menu, niejasne etapy.
Źródła W3C, Apple, Fluent2, GOV.UK, USWDS i plan: docs/17-ux-research-and-proposal.md.
Prototyp: design/ux-proposal/index.html; node design/ux-proposal/serve.mjs
udostępnia127.0.0.1:4321. Menu, pisanie, powrót, zakończenie, wyłączane
objaśnienia hover/fokus/klik/Escape, pismo18–26. Bez API/bazy/modelu;
tekst tylko w pamięci karty. Produkcja niezmieniona.
Syntax/lint/context PASS. Odbiór klawiaturą, hover,1280×800 i320px/26px;
naprawiono menu i skiplink.
Zrzuty bieżącego audytu w output/ux-audit-2026-11-03 (poza Git).
Następny krok: ocena klikalnego układu i integracja w osobnej jednostce,
z ochroną DraftQueue/CAS, wersji kart, śladów pomocy i prób chronionych.
T10: rzeczywiste problemy użyteczności, bez wniosków klinicznych.

## Zasoby
Ostatni odczyt limitu62% użyte/38% pozostało. Zachować20%; przy>=78%
lub braku licznika nie zaczynać kosztownej pracy. T18 zakończone,
harmonogram usunięty. Nie wznawiać nocnych zadań ani pełnych testów bez powodu.
