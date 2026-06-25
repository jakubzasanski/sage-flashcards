Zbuduj jeden sumaryczny raport architektoniczny z modułu 4 (ścieżka 10xArchitect).
Cel: zwięzły two-pager (~2 strony), czytelny dla człowieka, oparty wyłącznie na poniższych artefaktach. Nie wymyślaj faktów - jeśli czegoś brakuje, napisz wprost "BRAK artefaktu" i nie uzupełniaj luki domysłami.

Wejścia (artefakty z modułu 4):
- Mapa repozytorium (L2): context/map/repo-map.md
- Research wybranego ficzera (L3): context/changes/password-reset-data-flow/research.md
- Plan refaktoryzacji (L4): context/changes/refactor-opportunities/plan.md
- Notatki o domenie / DDD (L5): context/domain/01-domain-distillation.md, context/domain/02-invariant-aggregate-refactor.md, context/domain/03-anti-corruption-layer.md

Uwaga: artefakty mogą pochodzić z RÓŻNYCH projektów. Dla każdego wejścia podaj, na jakim repozytorium powstało.

Struktura raportu:

1. Opisane projekty
   - Dla każdego repo użytego w module: nazwa, stack, skala (orientacyjnie), i przy którym artefakcie się pojawiło (L2/L3/L4/L5).

2. Mapa projektu (z L2)
   - 3-5 kluczowych wniosków z mapy: strefy ryzyka, lokalne centra, entry pointy, najważniejsze unknowns.

3. Analiza ficzera (z L3)
   - Który przepływ badałeś i dlaczego (link do strefy ryzyka z mapy).
   - Feature overview w 3-4 zdaniach: skąd input, gdzie zmienia się stan, co wraca.
   - Technical debt: 2-3 najważniejsze ryzyka (kruche sprzężenia, luki testowe, blast radius), z których co najmniej jedno potwierdzone ast-grepem.

4. Plan refaktoryzacji (z L4)
   - Co refaktoryzowane: wybrana opcja i jej docelowy kształt.
   - Czego świadomie NIE robimy.
   - Fazy planu w jednej linijce każda + jak weryfikowane (auto/ręcznie).

5. Domena wg DDD (z L5)
   - Ubiquitous language: 3-5 kluczowych pojęć + najważniejsze rozjazdy model-vs-kod.
   - Niezmiennik #1 i agregat, do którego należy.
   - Anti-Corruption Layer: która zależność przecieka i przez ile warstw.

6. Decyzje, które należą do mnie
   - 3-5 zdań: co AI podpowiedziało, a co rozstrzygnąłeś samodzielnie i dlaczego.

Zasady:
- Maksymalnie dwie strony. Tnij, nie streszczaj wszystkiego.
- Każde twierdzenie strukturalne (liczby, "tylko tutaj") oprzyj na artefakcie, nie na własnej pamięci o kodzie.
- Zapisz wynik jako context/architect-report.md