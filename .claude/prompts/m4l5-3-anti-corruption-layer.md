Pracujesz jako specjalista Domain-Driven Design skupiony na identyfikacji przeciekających zależności i łamania granic warstw domeny. Produkt to PLAN refaktoru, nie implementacja — nie modyfikuj kodu produkcyjnego. Nie zakładaj z góry, która zależność przecieka ani jak nazywają się byty — masz to ODKRYĆ i WYBRAĆ. Kroki: odkrycie → identyfikacja → klasyfikacja → diagnoza → projekt.

KROK 0 — Odkryj kontekst.
- Przeczytaj dokumenty bazowe, jeśli istnieją (prd.md / tech-stack.md / README).
  Zwróć uwagę na deklaracje o wymienialności komponentów lub o tym, że jakiś byt
  jest celowo odseparowany "żeby dało się wymienić X".
- Ustal stack, listę zależności zewnętrznych (manifest pakietów) i warstwy kodu.

KROK 1 — IDENTYFIKUJ przeciekające zależności.
- Znajdź zależności zewnętrzne, które przeciekają przez granice warstw. Sygnały:
  ten sam pakiet importowany w wielu warstwach (API + UI + serwis), zduplikowana
  rekonstrukcja obiektów/typów biblioteki w kilku miejscach, typy biblioteki w
  sygnaturach domenowych lub w kontraktach wire (DTO/response), wołanie tego
  samego SDK po obu stronach granicy klient/serwer.
- Dla każdej: wylicz WSZYSTKIE pliki, które ją dziś "znają" (plik:linia).

KROK 2 — KLASYFIKUJ i wybierz #1.
- Oceń każdą oś: (a) liczba warstw/plików dotkniętych, (b) ryzyko/koszt wymiany
  biblioteki dziś, (c) czy dokumenty deklarują, że ma być wymienialna (rozjazd
  intencja-vs-kod jest mocnym sygnałem). Wybierz najgorszy przeciek. Uzasadnij.

KROK 3 — DIAGNOZA.
- Pokaż duplikację (cytaty plik:linia) i przecieki przez granice — zwłaszcza
  groźne (np. biblioteka serwerowa wciągana do bundla klienta). Jeśli dokument
  deklaruje wymienialność — zacytuj to (plik:linia) i pokaż, że kod jej nie dotrzymuje.

KROK 4 — PROJEKT ACL.
- Zaprojektuj domenowy value object/encję, która jest JEDYNYM miejscem wiedzy o
  kształcie zależności (mapowanie z/do persystencji, konwersja do/z typu
  biblioteki, operacje domenowe). Pokaż sygnatury + pseudokod.
- Zdefiniuj WĄSKI port (interfejs domenowy) i adapter implementujący go przez
  konkretną bibliotekę. Reszta kodu zna tylko port.

KROK 5 — Dowód izolacji + before/after.
- Udowodnij listą, że wymiana biblioteki dotyka tylko adaptera, nie tabel/API/UI.
- Before/after dla zduplikowanych miejsc; pokaż, że warstwa UI dostaje gotowe
  dane domenowe, nie surowy obiekt biblioteki.
- Jeśli istnieją otwarte pytania zależne od kontraktu tej biblioteki — rozstrzygnij
  je w oparciu o jej dokumentację i wskaż, gdzie zakodować decyzję (w ACL, nie w
  warstwie API).

KROK 6 — Weryfikacja i plan.
- Kryterium sukcesu: grep po nazwie pakietu zwraca wyłącznie pliki w katalogu ACL/
  adaptera. Wypisz, które pliki dziś znają zależność, a które po refaktorze już nie.
- Plan faz zgodny z konwencją projektu.

OGRANICZENIA:
- Cytuj tylko zweryfikowane plik:linia. Nie pisz kodu produkcyjnego.
- Zapisz dokument do: context/domain/03-anti-corruption-layer.md
  (frontmatter: title, created, type: refactor-plan).
- Zwróć podsumowanie 5–8 zdań na koniec.

Zapisz rezultat do context/domain/03-anti-corruption-layer.md
