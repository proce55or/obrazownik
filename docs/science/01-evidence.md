# 01. Wnioski naukowe i decyzje projektowe

Stan przeglądu: 2 listopada 2026. Źródła R01–R22 rozwinięto w 04-sources.md i 05-sources-pl.md. Wszystkie zalecenia implementacyjne poniżej są propozycjami dla Obrazownika, o ile wyraźnie nie opisano wyniku badania.

## 1. Najważniejszy wniosek

Można zbudować sensowną aplikację opartą na badanych mechanizmach językowych: wydobywaniu słów, analizie znaczenia, budowaniu relacji czasownikowych, elastycznej zmianie skojarzeń i pracy nad wypowiedzią. Dowody na skuteczność tych składników nie oznaczają jednak, że ich uproszczone, samodzielnie wykonywane polskie wersje przywracają poetycką ekspresję.

Nie znalazłam w przejrzanych źródłach kontrolowanego badania aplikacji po polsku, które wykazywałoby odzyskanie wcześniejszego stylu poetyckiego. To ograniczenie przeglądu, nie twierdzenie, że takie badanie na pewno nigdzie nie istnieje. Rozpoznawanie metafory, nazywanie obrazka i tworzenie własnego wiersza są odrębnymi zadaniami.

Obrazownik powinien być narzędziem treningu językowego i twórczego. Ocena ewentualnych utrzymujących się zaburzeń języka oraz indywidualny dobór terapii należą do neurologopedy lub neuropsychologa. Opis subiektywnej zmiany pisania sam nie ustala jej mechanizmu.

## 2. Jak wykonano przegląd

To ukierunkowany przegląd narracyjny, nie przegląd systematyczny z protokołem PRISMA. Przeszukano publikacje i repozytoria autorów przez PubMed/PMC, ASHA, czasopisma naukowe, ACL Anthology, repozytoria uczelni oraz polskie czasopisma logopedyczne i językoznawcze.

Grupy zapytań obejmowały: aphasia semantic feature analysis, verb network strengthening treatment, abstract semantic associative network training, semantic control, retrieval practice spacing, metaphor treatment, creative writing aphasia, afazja język figuratywny, metafory normy polskie, dyskurs afazja, Dr Neuronowski, Walenty i Morfeusz. Sprawdzono również nowsze prace z lat 2024–2026.

Włączono badania interwencji, przeglądy, badania polskiego materiału językowego i publikacje o zasobach potrzebnych do implementacji. Stron marketingowych nie traktowano jako dowodów skuteczności. Bibliografia rozróżnia pełny tekst, PDF, abstrakt i opis zasobu. Przy pozycjach dostępnych tylko jako abstrakt nie odtwarzano nieudostępnionego protokołu.

Większość badań klinicznych dotyczy afazji poudarowej i często terapii prowadzonej przy udziale specjalisty. Przeniesienie wyników na inną historię neurologiczną, subtelne trudności twórcze i samodzielną aplikację wymaga ostrożności.

## 3. Co ma oparcie w badaniach

| Składnik | Stan dowodów w przejrzanej literaturze | Decyzja dla aplikacji |
|---|---|---|
| Komputerowe ćwiczenie słownictwa | Duże RCT Big CACTUS: poprawa trenowanych słów, brak wykazanej poprawy rozmowy [R01] | Zachować trening, obowiązkowo oddzielić wynik ćwiczenia od nowego pisania |
| Analiza cech semantycznych, SFA | Przegląd, RCT i nowsze porównania wariantów; korzyści głównie w nazywaniu [R02, R03, R21] | Rozwinąć E1, nie wymagać maksymalnej liczby określeń |
| Sieci czasownikowe, VNeST | Obiecujące małe badania; wersja komputerowa badana także w pisaniu [R04, R05] | Rozwinąć E3 z polską rekcją i różnymi uczestnikami sceny |
| Pojęcia abstrakcyjne w kontekście, AbSANT | Analiza danych 33 osób, bez nowego dużego RCT [R06] | Dodać opcjonalny wariant E2, wyraźnie jako adaptację |
| Zmienianie dominującego skojarzenia | Małe badanie semantycznej afazji, ograniczony transfer [R07] | Stopniować zmianę perspektywy, nie losowość odpowiedzi |
| Wydobywanie z pamięci i rozłożenie prób | Małe badania nazywania, wyniki zależne od warunku i terminu [R08] | Zachować próby samodzielne i powroty; nie nazywać 2/7/21 dni klinicznym standardem |
| Rozumienie metafor | Pilotaż terapii w innym profilu uszkodzenia oraz badania przetwarzania polszczyzny [R09, R11] | Opcjonalne rusztowanie do własnych obrazów, bez obietnicy poprawy twórczości |
| Pisanie przez wybór i wykreślanie | MakeWrite: projektowanie i badanie warsztatowe, nie próba leczenia [R10] | Zachować E5, mierzyć również poczucie autorstwa |
| Wypowiedź wielozdaniowa | Zróżnicowana literatura terapii dyskursu i polskie badanie opisowe [R14, R17] | Rozwijać E6 i sceny, nie ograniczać treningu do pojedynczych rzeczowników |
| Polskie normy metafor i słów | Dane eksperymentalne i normatywne, nie badania terapii [R12, R13] | Dobierać materiał po polsku, kontrolować znajomość i łatwość wyobrażenia |
| Polskie narzędzia komputerowe | RCT programu Dr Neuronowski obejmujące 34 osoby [R16] | Ważny punkt odniesienia; nie przenosić automatycznie jego procedury |
| Polska fleksja i znaczenia | Zasoby językoznawcze [R18–R20] | Wspierać redakcję kart i warianty odpowiedzi, bez oceny zdrowia |

Ta tabela nie jest oceną GRADE. RCT jednego składnika nie nadaje statusu klinicznie potwierdzonego całej aplikacji.

## 4. Co zmienić względem dotychczasowego planu

Dotychczasowy plan już obejmuje cechy, połączenia słów, sceny czasownikowe, pisanie niezależne, zapis pomocy i brak punktacji poezji. Badania uzasadniają ich dopracowanie, a nie wymianę architektury.

1. **Najpierw wiarygodny zapis samodzielności.** Rozróżnij tekst przed pomocą, po podpowiedzi i po pokazaniu przykładu. Zachowuj pierwotny zapis.
2. **E1: cechy znaczeniowe.** Oprócz wyglądu uwzględnij zastosowanie, sytuację, relację i działanie.
3. **E3: czasownik organizuje scenę.** Dobór uczestników, odmiana i przyimki mają wynikać z konkretnego polskiego czasownika.
4. **E2: zmiana sensownego skojarzenia.** Dodaj wariant pojęcia abstrakcyjnego w sytuacji oraz przejście od porównania do metafory.
5. **E6: nowy tekst bez wcześniejszego przykładu.** To najbliższy celowi użytkownika sprawdzian użyteczności.
6. **Pochodzenie materiału.** Każda rodzina ćwiczeń ma krótki opis inspiracji, ograniczeń i identyfikatory źródeł.
7. **Kontrola polszczyzny.** Karty są tworzone po polsku i redagowane; tłumaczenie angielskiego testu nie tworzy polskiej normy.

Nie trzeba teraz dodawać LLM, trenować modelu, instalować wielkich korpusów ani zmieniać języka programowania. Wskazane zmiany można wykonać w lokalnym silniku istniejącej aplikacji i małej bazie kart.

## 5. Dwie istotne korekty interpretacyjne

### Więcej cech nie znaczy automatycznie lepszy trening

Badanie losowe Huli i współautorów z 2026 r. porównywało 5 i 11 cech w SFA; nie wykazało wyraźnej, stabilnej przewagi jednego wariantu [R21]. Z kolei analiza obserwacyjna odpowiedzi wiązała liczbę i związek cech ze skutecznością nazywania [R22]. Korelacja nie dowodzi, że wymuszanie dodatkowych cech spowoduje poprawę.

Wybór w interfejsie 1–3 pól na początek jest propozycją ograniczenia obciążenia, nie przebadaną dawką SFA. Użytkownik może rozwinąć więcej pól.

### Publikacja naukowa również wymaga oceny

W polskim badaniu dyskursu Dębskiego i współautorek opis operacjonalizacji aspektu na s. 90 miesza aspekt z formą czasownika [R14]. Nie wolno na tej podstawie programować reguły, że bezokolicznik oznacza aspekt niedokonany. Zarówno robić/zrobić, jak i robiono/zrobiono różnią się aspektem.

Z tej publikacji warto zaczerpnąć zainteresowanie strukturą wypowiedzi i rolą sytuacji zadaniowej. Automatyczne oznaczanie aspektu należy oprzeć na poprawnych danych leksykalnych lub zrezygnować z niego. Ta uwaga dotyczy konkretnego opisu metody, nie unieważnia automatycznie wszystkich obserwacji autorów.

## 6. Czego nie dodawać jako rzekomo potwierdzonego

- Wyniku poetyckości, procentu odzyskanej sprawności ani diagnozy z wiersza.
- Założenia, że więcej przymiotników, rzadkie słowa lub większa odległość embeddingów oznaczają lepszy tekst.
- Wnioskowania o odzyskaniu stylu na podstawie samych ćwiczonych kart.
- Hasła terapia afazji o potwierdzonej skuteczności dla Obrazownika.
- Treningu czasu reakcji, ruchów ręki lub słuchu tylko dlatego, że występuje w jednym programie badawczym.
- Obowiązkowej intensywności terapii skopiowanej z badania.
- Uznawania krótkiej, chłodnej lub oszczędnej wypowiedzi za błąd. Cel stanowi dostęp do różnych sposobów ekspresji i możliwość świadomego wyboru.

Historyczne teksty mogą być prywatnym punktem odniesienia. Różnica między dawnym a obecnym wierszem nie izoluje skutków operacji od tematu, wieku, warsztatu, nastroju czy zmiany stylu.
