/10x-research refactor-opportunities Przeczytaj analizę:
context/changes/{change-id}/research.md - zapis długu technicznego
i ryzyk strukturalnych tego repozytorium.
Traktuj jej ustalenia jako zebrane dowody: nie wyprowadzaj ich na nowo, buduj na nich. Jeśli odwołuje się do innych artefaktów (mapa repo, wcześniejszy research), przeczytaj je również jako priory.

Wypisz każdy problem, który raport odnotowuje, niezależnie od etykiety (dług, ryzyko, hotspot, znalezisko).
Sklasyfikuj każdy: KANDYDAT to problem, którego naprawa zmieniłaby strukturę kodu; wszystko inne (np. brakujący test, luka w dokumentacji) nie jest kandydatem - zachowaj to jako wejście do oceny wykonalności i kosztu.
Wypisz listę i klasyfikację kandydatów na początku wyniku, żebym mógł ją zaudytować. Następnie zbadaj każdego kandydata trzema sub-agentami; wszystkie pracują w trybie eksploracji, bez wprowadzania zmian:

1. Obecny kształt - potwierdź w kodzie, jaki kształt kandydat ma dziś: gdzie żyje logika, jak mieszają się odpowiedzialności, jakie abstrakcje lub powiązania już istnieją. Cytuj plik:linia. Oznacz każde twierdzenie jako evidence / inference / unknown.

2. Historia i intencjonalność - ustal, DLACZEGO kod ma taki kształt: ADR-y i dokumenty projektowe, jeśli istnieją; w przeciwnym razie archeologia gita (git log -L, blame, uzasadnienia w commitach i PR-ach). Werdykt per kandydat: świadome ograniczenie (decyzja nośna) vs przypadkowa złożoność - albo uczciwie oznacz jako unknown, jeżeli ciężko to określić.
3. Wykonalność migracji - czego wymagałaby inkrementalna, odwracalna ścieżka (istniejąca abstrakcja vs nowa abstrakcja), co wynika z danych o blast radius z raportu, jakie osłony i testy już istnieją wokół (sprawdź konfigurację CI) i jaki byłby pierwszy krok-prerekwizyt.

Twarde granice:
- Żadnych zmian w kodzie. Żadnego refaktoru. Dowody przed interpretacją.
- Nie projektuj docelowej architektury
- poza nazwaniem adekwatnego docelowego kształtu per kandydat.
- Jeśli prawdziwa naprawa kandydata to przeprojektowanie pojęć biznesowych, a nie struktury kodu - powiedz to i zatrzymaj się - to przedmiot do innej, późniejszej analizy.
- Gdzie brakuje danych, napisz unknown - nie wypełniaj luk wiarygodnymi domysłami.
Synteza (po raportach wszystkich trzech subagentów): zapisz research.md w folderze tej zmiany. Per kandydat: obecny kształt (z dowodami), werdykt intencjonalności, notatki o wykonalności.
Zamknij sekcją "Refactor opportunities" z 2-3 najmocniejszymi kandydatami w rankingu - dla każdego: obecny → docelowy kształt, czemu zasługuje na to miejsce (koszt długu vs koszt zmiany), blast radius, szkic inkrementalnej ścieżki, pierwszy krok-prerekwizyt. Wypisz też kandydatów rozważonych i odrzuconych, z krótkim podsumowaniem dlaczego. Oceniaj na podstawie dowodów. NIE proś mnie o wybór, potwierdzenie ani zgodę - zakończ zapisaniem gotowego raportu.
Ranking to propozycja dla osobnej sesji planowania, która odbędzie się po mojej lekturze.
