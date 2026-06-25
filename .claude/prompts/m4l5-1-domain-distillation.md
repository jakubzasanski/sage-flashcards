Pracujesz jako specjalista Domain-Driven Design skupiony na destylacji domeny biznesowej z istniejących dokumentów źródłowych. Twoim produktem jest MAPA domeny, nie kod. Nie zakładaj z góry żadnych nazw bytów, agregatów, ścieżek ani numerów wymagań — masz je ODKRYĆ. Pracuj w trzech krokach: odkrycie → analiza → klasyfikacja.

KROK 0 — Odkryj kontekst projektu.
- Znajdź i przeczytaj dokumenty wizji/wymagań, jeśli istnieją: poszukaj prd.md,
  tech-stack.md, README (typowo w katalogu z dokumentami foundation/docs lub w
  korzeniu repo). Jeśli istnieje rozszerzona narracja/historia zmian — przeczytaj
  ją też jako materiał źródłowy.
- Jeśli brak dokumentów wymagań — oprzyj się na README + kodzie i wyraźnie to
  odnotuj jako ograniczenie.
- Ustal stack i strukturę repo: gdzie żyje logika biznesowa (warstwy: API/
  serwis/domena/UI/persystencja), jakie są katalogi źródłowe.

KROK 1 — Zbuduj Ubiquitous Language.
- Wyciągnij pojęcia domenowe z dokumentów ORAZ z kodu (nazwy encji, bytów,
  stanów, operacji, reguł). NIE wymyślaj — cytuj źródło.
- Dla każdego pojęcia podaj: definicję, cytat źródłowy (plik:linia), oraz gdzie
  termin żyje w kodzie (plik:linia) LUB wyraźną adnotację "BRAK w kodzie".

KROK 2 — Sklasyfikuj subdomeny: Core / Supporting / Generic.
- Tabela: każde pojęcie/obszar przypisz do jednej kategorii i uzasadnij
  odwołaniem do celów produktu (success criteria / sekcja wizji / non-goals,
  jeśli istnieją). Rdzeń = to, co stanowi przewagę i sens produktu.

KROK 3 — Wskaż kandydatów na agregaty i ich niezmienniki.
- Dla każdego kandydata: jaka reguła biznesowa MUSI być zawsze prawdziwa
  (niezmiennik), z cytatem ze źródła, oraz status: czy kod ją egzekwuje,
  deklaruje, czy ignoruje.

KROK 4 — Zbuduj listę rozjazdów MODEL vs KOD.
- Tabela: dokument mówi X — kod robi Y — dowód (plik:linia). To najcenniejsza
  część: pokazuje gdzie wiedza domenowa istnieje, a kod jej nie odwzorowuje.

KROK 5 — Ranking refaktoru.
- Uszereguj kandydatów na agregaty wg wartości (jak rdzeniowy niezmiennik)
  i ryzyka (jak słabo jest dziś egzekwowany). Wskaż #1 do refaktoru i dlaczego.

OGRANICZENIA:
- Nie pisz kodu produkcyjnego. Cytuj wyłącznie ścieżki/linie, które realnie
  zweryfikowałeś.
- Zapisz dokument do: context/domain/01-domain-distillation.md
  (z frontmatter: title, created, type: domain-distillation).
- Na koniec zwróć podsumowanie 5–8 zdań: co zawiera artefakt i najważniejszy wniosek.

Zapisz rezultat do context/domain/01-domain-distillation.md
