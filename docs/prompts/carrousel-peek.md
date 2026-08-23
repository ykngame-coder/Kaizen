# Prompt — Carrousel de cartes swipable (effet peek + points)

```
Objectif : ajouter à Kaizen Supotsu un carrousel de cartes swipable, RÉUTILISABLE,
avec effet « peek » (on voit un bout des cartes précédente/suivante) et des points
indicateurs de page (point actif plus large/clair). Aucune dépendance externe —
uniquement React Native (Expo SDK 54 / RN 0.81, déjà en place). Offline-first,
dark-first, respecte le design system existant.

============================================================
1) COMPOSANT RÉUTILISABLE — packages/ui/src/Carousel.tsx
============================================================
Crée un composant générique et exporte-le depuis packages/ui/src/index.ts.

API :
  export interface CarouselProps<T> {
    data: T[];
    renderItem: (item: T, index: number) => React.ReactNode;
    keyExtractor?: (item: T, index: number) => string;
    peek?: number;        // largeur visible des cartes voisines (défaut ~24)
    gap?: number;         // espace entre cartes (défaut spacing[3])
    showDots?: boolean;   // défaut true
    onIndexChange?: (index: number) => void;
    initialIndex?: number;
  }

Implémentation :
- Base sur un FlatList horizontal (performant, recyclage) :
    horizontal, showsHorizontalScrollIndicator={false}, decelerationRate="fast".
- Effet PEEK : largeur d'une carte = windowWidth - 2*peek - gap
    (via useWindowDimensions). contentContainerStyle a un paddingHorizontal = peek,
    chaque item une largeur fixe = cardWidth avec marginRight = gap.
    snapToInterval = cardWidth + gap ; snapToAlignment="start" (ou center).
    → au repos, on aperçoit les cartes adjacentes de `peek` px de chaque côté.
- Points : rangée centrée sous le carrousel. Index actif calculé depuis onScroll
    (Animated ou onMomentumScrollEnd → round(offsetX/(cardWidth+gap))).
    Point actif : plus large + colors.primary (ou blanc) ; inactifs :
    colors.border / colors.textSubtle. Utilise useTheme() de @supotsu/ui et
    spacing/radii de @supotsu/design-system — pas de couleurs en dur.
- Accessibilité : accessibilityRole approprié ; respecte prefers-reduced-motion.
    Callback onIndexChange à chaque changement de page.
- Le composant ne connaît PAS le contenu : renderItem fournit une <Card> ou autre.

============================================================
2) APPLIQUER « PARTOUT OÙ C'EST PERTINENT »
============================================================
Remplace les empilements verticaux de cartes homogènes par le Carousel là où
le swipe a du sens. Candidats (à ton jugement, garde la lisibilité) :
- Accueil (DashboardScreen) : tuiles KPI / cartes de synthèse en carrousel peek.
- Hub Sport (SportScreen) : « Séance du jour » ↔ « État du corps » ↔ « Récup » ↔ « Charge ».
- Hub Sommeil : QuickStats (HRV / FC / Stress) et/ou modules.
- Comprendre (LearnScreen) : articles en cartes swipables.
- Méditations / étirements : listes de modules en carrousel.
- Analytics : cartes de période (7j / 4sem / 1an) si pertinent.
Ne l'impose pas là où une liste verticale scrollable reste meilleure (longues
listes, formulaires). N'ajoute pas de carrousel « pour décorer ».

============================================================
QUALITÉ & RÈGLES
============================================================
- pnpm typecheck && pnpm lint && pnpm test verts.
- pnpm --filter @supotsu/mobile export:web pour valider le bundling.
- Teste le rendu sur petit et grand iPhone (le peek doit rester correct).
- Branche claude/spot-wellness-app-r6l5bj uniquement ; git pull --rebase avant push.
- Pas de PR sauf demande. Ne jamais toucher la clé Supabase service_role.
- L'apparence change → APERÇU VISUEL (Accueil + un hub) après coup.

DÉFAUTS (ajustables) : peek ≈ 24 px de chaque côté ; point actif en primary.
```
