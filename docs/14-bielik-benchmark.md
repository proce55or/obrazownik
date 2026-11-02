# Lokalny Bielik: instalacja i pomiar

Pomiar na rzeczywistym iMacu, 2026-11-03, 00:39–00:40 czasu Warszawy.
Runtime działa; podpowiedzi pozostają eksperymentalne. Nie wykonano
całonocnego testu ani pilotażu skuteczności treningu.

## Przypięte pliki

- Model: oficjalny SpeakLeash Bielik-Minitron-7B-v3.0-Instruct, GGUF Q4_K_M,
  4 501 556 256 B; [revision HF](https://huggingface.co/speakleash/Bielik-Minitron-7B-v3.0-Instruct-GGUF/tree/8f973025458d5119b688e3b60ee1ca40ffd8313d),
  licencja Apache-2.0 według karty modelu.
- SHA256 pobranego pliku zgodne z oficjalnymi metadanymi HF LFS:
  `0c1475426645924970b9ed1383df1ce89c47b991e7b78ce9a12d3fde94455b16`.
- Runtime: [llama.cpp v0.8.0, commit8642541](https://github.com/ggml-org/llama.cpp/tree/8642541b255bfb5dc39cd351a178be09013a55d6).
  Zbudowane ze źródeł przez Apple clang15/CMake4.4.3, Release,
  macOS deployment13.5. Binarium podaje `0.8.0-dev`, `b1-8642541`;
  oznaczenie pochodzi z przypiętego taga i płytkiego checkoutu.
- Backend CPU AVX2/FMA/F16C + Accelerate, Metal OFF; bez wykorzystania GPU.
  Wyłączono OpenSSL, subprocess, pobieranie UI i zintegrowaną aplikację llama.

Wagi i `manifest.json`: `~/Obrazownik-modele/bielik-7b/`.
Źródła/build/proweniencja runtime: `~/Obrazownik-modele/runtime/`.
W repo aplikacji nie ma wag, logów ani tekstów z prywatnego zeszytu.

## Parametry i wyniki

i7-7700K 4c/8t, RAM64GB, Ventura13.7.8 Intel. CPU4 wątki generacji i
prefill, `VECLIB_MAXIMUM_THREADS=4`, priorytet nice10, kontekst2048,
jeden slot, GPUlayers0. API wyłącznie `http://127.0.0.1:4320`,
alias `bielik-7b-local`. Domyślny warmup, cache systemu plików niekontrolowany.

Start procesu → gotowe `/health`: **22,42s**; log „model loaded”:22,17s.
Potwierdzono `/props`: właściwa ścieżka GGUF, build `b1-8642541`, slot1,
kontekst2048; `/v1/models`: właściwy alias. Binarium i inferencja działają
na tej Venturze; nie jest to deklaracja zgodności z innymi komputerami.

Trzy kolejne syntetyczne instrukcje, bez tekstu autora: kubek/zmysły,
deszcz–zegar/skojarzenie, pośpiech/poczekalnia. System wymagał jednego
krótkiego polskiego pytania bez przykładów i odpowiedzi za autora.
Temperatura0,3, seed17, maksymalnie56 tokenów odpowiedzi, streaming.

| Próba | Pierwszy tekst | Całość | Tokeny odpowiedzi | Generacja |
| --- | ---: | ---: | ---: | ---: |
| Zmysły | 8,29s | 14,71s | 34 | 5,14tok/s |
| Skojarzenie | 4,16s | 16,82s | 46 | 3,56tok/s |
| Scena | 5,80s | 12,07s | 33 | 5,11tok/s |

Mediana pierwszego tekstu5,80s; całości14,71s; błędy HTTP/timeout0/3.
Pierwsza próba nie miała cache promptu; kolejne użyły86 wspólnych tokenów.
„Pierwszy tekst” to czas klienta do pierwszej niepustej części odpowiedzi,
obejmuje prefill; tok/s pochodzi z timingów serwera. Trzy próbki nie określają
rozrzutu długotrwałego ani czasu przy równoczesnym obciążeniu komputera.

## Ręczna ocena jakości

Wszystkie3 odpowiedzi: po polsku, jedno pytanie, bez wiersza i bez błędu
transportu. To nie wystarcza do odbioru pomocy:

- Zmysły: pytanie o wrażenie wizualne, poprawne, ale ogólne.
- Skojarzenie: model sam zasugerował „metronom dnia i rytm natury” wewnątrz
  pytania. Narusza to założenie samodzielnego znalezienia obrazu.
- Scena: model zasugerował nerwowe przeglądanie telefonu; również zawęża
  rozwiązanie zamiast pozostawić wybór działania autorowi.

Wniosek: lokalna inferencja jest technicznie używalna z buforem, ale taki
prompt nie zapewnia neutralności podpowiedzi. Sam znak zapytania nie jest
walidacją jakości. Kolejny odbiór powinien dotyczyć właściwego promptu aplikacji
i odrzucania podsuwanych rozwiązań. Brak dowodu skuteczności klinicznej;
aplikacja nie służy diagnozie ani terapii.

## Odbiór właściwego promptu aplikacji

Prompt `obrazownik-question-2` ogranicza kontekst do bodźca i celu pytania
odpowiedniego dla rodziny ćwiczeń. Pomija pełne polecenie z przykładami,
a także własny tekst autora. Pięć wywołań przez rzeczywisty adapter AI SDK
(03.11,00:44 Warszawa),80tokenów/temperatura0,3, bez ustawionego seed:

| Rodzina | Czas przygotowania | Wynik |
| --- | ---: | --- |
| Właściwość | 13,01s | Pytanie o własną obserwację cechy kamienia |
| Most | 8,02s | Pytanie o skojarzenie z oknem i oddechem |
| Czasownik | 5,68s | Pytanie o osobę; model dopowiada „nieść pomoc” |
| Zmysł | 8,03s | Pytanie o wybór zmysłu |
| Przekształcenie | 8,32s | Ogólne pytanie o wybór sformułowania |

5/5 przeszło kontrolę formatu; mediana8,03s. Nie jest to walidacja
neutralności: pytanie czasownikowe nadal zawęża wybór, a część pytań mówi
„autor” zamiast zwracać się wprost do użytkownika. Pierwszy wariant promptu
miał także1/6 odpowiedzi odrzuconych przez walidator. Nie obiecujemy, że
każde pytanie będzie trafne; nie ma automatycznej wiarygodnej oceny semantyki.
UI oznacza źródło, zachowuje tekst sprzed pokazania, oferuje gotową pomoc
przy błędzie i nigdy nie udostępnia modelu w próbie samodzielnej.

## Uruchamianie i powtórzenie

Dwuklik `Start-Obrazownik-z-Bielikiem.command` albo:

```sh
cd ~/Code/Obrazownik/Obrazownik_plan
node scripts/start-bielik.mjs
```

Launcher niczego nie instaluje ani nie pobiera. Przy nowym starcie sprawdza
rozmiar, manifest i pełne SHA256 wag; uruchamia CPU4/ctx2048/slot1 na4320,
potem zwykły launcher Obrazownika4317. Istniejący model rozpoznaje po ścieżce,
buildzie, liczbie slotów i aliasie. Obcy/zajęty port powoduje odmowę,
bez zamykania znalezionych procesów. Ctrl+C zatrzymuje własne procesy
launchera; wcześniej działający model pozostaje pod kontrolą jego właściciela.
Bez Bielika używaj zwykłego `Start-Obrazownik.command`.

Powtórzenie trzech pytań na już działającym modelu:

```sh
caffeinate -i node scripts/benchmark-bielik.mjs
```

Nie uruchamiaj równolegle z odbiorem aplikacji: model ma jeden slot.
Test jest syntetyczny; zapisuje JSONL i podsumowanie wyłącznie pod
`~/Obrazownik-modele/bielik-7b/logs/`. Oryginalny pomiar:
`benchmark-2026-11-02T23-39-20.912Z{.jsonl,-summary.json}`.
Komenda/PID procesu odbiorczego: `logs/server-current.json`.
Przed wysłaniem sygnału do zapisanego PID sprawdź jego aktualną komendę.

Opcjonalne ograniczone powtórzenia obsługuje `--duration-minutes` (do480)
i `--interval-seconds` (30–3600). Nie uruchomiono pustej nocnej pętli:
najpierw potrzebny jest odbiór jakości, potem celowy test stabilności.
