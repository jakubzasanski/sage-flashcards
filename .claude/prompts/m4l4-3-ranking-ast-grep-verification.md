Zweryfikuj raport context/changes/refactor-opportunities/research.md.

Wypisz z niego twierdzenia STRUKTURALNE, na których stoi ranking (liczby metod, "nadpisuje X, ale nie Y", liczność call-site'ów,
pary lustrzanych typów).

Dla każdego zbuduj wzorzec ast-grep, wywołaj go i podaj wynik jako:
twierdzenie -> potwierdzone / doprecyzowane / obalone, z plikami i liniami.
Każde zero z ast-grep potwierdź klasycznym grepem.

Po weryfikacji zaktualizuj analizowany raport:
- błędne liczby i numery linii popraw w miejscu, w formacie "150 (raport: 145)" —
  tak, żeby ślad korekty został w tekście;
- dodaj sekcję "## Weryfikacja twierdzeń (ast-grep)" z tabelą:
  twierdzenie → werdykt → dowód (plik:linia) → metoda (wzorzec/reguła);
- zaktualizuj frontmatter: last_updated, dopisz tag "verified" i commit weryfikacji;
- sekcji "Refactor opportunities (ranked)" oraz werdyktów intencjonalności NIE zmieniaj.

Jeśli wynik podważa pozycję kandydata, opisz to wyłącznie w sekcji weryfikacji, z adnotacją "do decyzji na etapie planowania".
