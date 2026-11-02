# Stały zakres
Obrazownik, nazwa robocza. Plan v1.0, 2026-11-02.

Cel: pomagać autorowi samodzielnie tworzyć obrazy, skojarzenia i sceny
po polsku oraz sprawdzać, czy łatwiej pisze bez pomocy na nowych tematach.
Nie obiecujemy odtworzenia dawnego stylu ani efektu terapeutycznego.

MVP: 5 rodzin ćwiczeń, dobrowolne stopniowane podpowiedzi, prywatny
zeszyt tekstów, łagodne powroty do zadań, osobne próby bez podpowiedzi,
lokalny zapis, kopie i eksport. Brak punktacji poetyckości.

Platforma główna: iMac Intel, macOS Ventura 13.7.8; zgodność sprawdzi T00.
Interfejs przeglądarkowy responsywny. Serwer i dane na iMacu.
Telefon nie połączy się z Maciem przez swój localhost. Dostęp mobilny
z danymi to późniejszy etap, nie warunek pierwszego MVP.

Stos: TypeScript, React, Vite, Node 24 LTS, SQLite przez izolowany adapter
node:sqlite. Przypiąć sprawdzoną wersję poprawkową w T00.
Dane domyślnie poza repo: ~/Obrazownik-dane.
Repo prywatne; możliwość otwarcia źródeł później, bez zmiany teraz.

Niezmienne: autor tworzy odpowiedź; brak wymaganego LLM; brak opłat
i sieci w ćwiczeniach MVP; odrębna informacja o użytej pomocy;
brak prywatnych tekstów i historii zdrowia w repo lub CI.

Sukces techniczny: kompletna sesja bez Internetu, trwały zapis po restarcie,
sprawdzone odtworzenie kopii, nowa samodzielna próba.
Sukces użytkowy wymaga pilotażu; działający kod sam go nie dowodzi.

Poza MVP: trening modeli, embeddings, synchronizacja urządzeń, publikacja,
konta, sklep, TTS/STT, mobilne aplikacje natywne i diagnoza.
