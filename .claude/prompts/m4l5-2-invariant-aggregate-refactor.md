Pracujesz jako specjalista Domain-Driven Design skupiony identyfikacji i zabezpieczeniu domenowych niezmienników. Produkt to PLAN refaktoru, nie implementacja — nie modyfikuj kodu produkcyjnego. Nie zakładaj z góry, który niezmiennik jest rdzeniowy ani jak nazywają się byty — masz to ODKRYĆ i WYBRAĆ. Pracuj w krokach: odkrycie → identyfikacja → klasyfikacja → diagnoza → projekt.

KROK 0 — Odkryj kontekst.
- Przeczytaj dokumenty wymagań, jeśli istnieją (prd.md / tech-stack.md / README;
  szukaj w foundation/docs/root). Zwróć uwagę na sekcje "business logic",
  "success criteria", reguły i wymagania funkcjonalne.
- Ustal stack i warstwy, w których żyje logika biznesowa (API / serwis / domena /
  UI / persystencja).

KROK 1 — IDENTYFIKUJ niezmienniki biznesowe.
- Zbuduj listę reguł, które w tej domenie MUSZĄ być zawsze prawdziwe
  (np. "X powstaje tylko z Y", "operacja Z jest atomowa", "dane D nigdy nie są
  persystowane", "przejście stanu A→B wymaga warunku C"). Wyciągaj z dokumentów
  ORAZ z kodu. Cytuj źródło.

KROK 2 — KLASYFIKUJ i wybierz #1.
- Dla każdego niezmiennika oceń trzy osie:
  (a) jak rdzeniowy dla sensu produktu (odwołaj się do celów/wizji),
  (b) jak bardzo rozsmarowany po warstwach (w ilu plikach/warstwach żyje),
  (c) czy jest realnie EGZEKWOWANY, tylko deklarowany, czy naruszalny.
- Wybierz niezmiennik, który jest jednocześnie najbardziej rdzeniowy I najsłabiej
  egzekwowany. Uzasadnij wybór.

KROK 3 — DIAGNOZA wybranego niezmiennika.
- Pokaż dokładnie, gdzie dziś żyje reguła (cytaty plik:linia we wszystkich
  warstwach). Wskaż: które warstwy jej nie egzekwują, gdzie jest egzekwowana
  niespójnie, gdzie klient (UI) jest jedynym strażnikiem, gdzie błąd jest
  "połykany" zamiast zatrzymywać operację.

KROK 4 — PROJEKT agregatu-strażnika.
- Zaprojektuj agregat (root) będący JEDYNYM miejscem egzekwowania niezmiennika.
- Metody domenowe z preconditions; nielegalna operacja rzuca nazwany błąd
  domenowy (nie cicho aktualizuje stanu). Pokaż sygnatury + pseudokod.
- Repozytorium ładujące/zapisujące agregat zamiast rozsianych zapytań; jeśli
  niezmiennik wymaga atomowości — pokaż, jak całość idzie w JEDNEJ transakcji.
- Cienkie API/route: parse wejścia → metoda agregatu → mapowanie błędu domenowego
  na odpowiedź. Egzekucja przenosi się z klienta na serwer (jeśli dziś jest na
  kliencie).

KROK 5 — Before/after, plan, testy.
- Before/after dla każdego dzisiejszego miejsca reguły.
- Plan faz refaktoru. Jeśli projekt ma dyscyplinę test-first / istniejący runner —
  zaznacz, które fazy idą test-first i wypisz przypadki testowe dla niezmiennika
  (legalne i nielegalne przejścia/operacje).
- Lista nowych "load-bearing" nazw do zarejestrowania, jeśli projekt prowadzi
  rejestr kontraktów.

OGRANICZENIA:
- Fail-fast: nielegalna operacja zatrzymuje, nie loguje-i-jedzie dalej.
- Cytuj tylko zweryfikowane plik:linia.
- Zapisz dokument do: context/domain/02-invariant-aggregate-refactor.md
  (frontmatter: title, created, type: refactor-plan).
- Zwróć podsumowanie 5–8 zdań na koniec.

Zapisz rezultat do context/domain/02-invariant-aggregate-refactor.md
