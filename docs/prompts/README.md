# Prompts (état réel)

> Colonne « État » vérifiée contre le code, pas contre les intentions.
> Dernière vérification : 2026-09-10.

Chaque fichier est un prompt **prêt à copier-coller** pour une session Claude Code
(locale sur le PC, sur le Mac, ou web), calé sur le code réel du repo. Ils sont
indépendants et peuvent être lancés dans n'importe quel ordre, sauf indication.

| Prompt | Ce qu'il met en place | État |
|---|---|---|
| `scores-sport-nutrition-sommeil.md` | Score Sport (perf + régularité + progression), nutrition dans le score Supotsu global, sommeil via `computeSleepScore2` (régularité + dette) | ✅ Fait |
| `carrousel-peek.md` | Composant `Carousel` réutilisable (effet peek + points), appliqué partout où c'est pertinent | ✅ Fait |
| `import-ocr-seances.md` | Import d'une séance depuis une **capture d'écran** — OCR 100 % local (Voie A) + écran de revue éditable | ✅ Fait |
| `sommeil-telephone-reveil.md` | Suivi du sommeil par le **téléphone** (actigraphie) + **réveil intelligent programmable** | ✅ Fait |
| `fix-testflight-lot1.md` | **Correctifs retours TestFlight** : planning cliquable (#3), réattribuer un repas (#4), pesée auto (#5), activités top-3 (#2) ; #1 = re-tester sur build à jour | ✅ Fait |
| `fix-code-review-lot3.md` | **Correctifs code-review (import santé)** : sommeil doublé entre sources HealthKit, dédup activités trop agressive (perte de séances), plage hydratation litres→ml | ✅ Fait (2026-09-10) |
| `fix-code-review-lot2.md` | **Correctifs code-review** : notes de séance perdues en prod, pagination habitudes non déterministe, saisie nutrition eau/0 kcal (+ dédup sommeil traitée dans le prompt sommeil) | ✅ Fait (2026-09-10) |
| `creation-suivi-seance.md` | Améliorer la **création** (prefill+suggestion, ajout rapide, modèles, superset) et le **suivi/runner** (log+repos auto, réf. précédente + RPE/RIR, reprise, calculateur de disques, échauffement auto) | ✅ Fait |
| `fix-audits-1-2.md` | **Reste des audits 1 & 2** : sommeil aberrant en base (5 315 lignes, max 32,31 h), durcissement SQL/Supabase, Garmin déployé ≠ repo + idempotence, HealthKit 3 ans relus, secrets eas.json, perf RLS | ⬜ À faire — **prioritaire** |
| `objectif-sommeil-reglable.md` | Objectif de sommeil **réglable** + dette/score/circadien réajustés à la cible + correction incohérence 7 h 45 / 8 h | ✅ Fait (2026-09-10) |
| `exercices-wger.md` | Étendre la **bibliothèque d'exercices** avec wger (multilingue, offline, mapping + attribution CC-BY-SA), sans casser les IDs existants | ⬜ À faire |
| `durcir-defi-communautaire.md` | **Durcir le score des défis** : forcer UTC dans la RPC `challenge_leaderboard`, afficher les rangs ex-æquo (score déjà correct, c'est du blindage) | ⬜ À faire |
| `i18n-multilingue.md` | **Multilingue** FR/EN/ES/PT/DE (infra i18n + sélecteur + extraction) — _infra déjà en place, sert de référence_ | ✅ Fait |
| `apple-watch-niveau1.md` | App **Apple Watch** compagnon (suivre sa séance au poignet) — Niveau 1 | ⬜ À faire — après TestFlight |
| `apple-watch-niveau2.md` | Apple Watch — séance **live** (FC temps réel, calories, HealthKit workout) | ⬜ À faire — après le niveau 1 |

Règles communes (rappelées dans chaque prompt) : développer sur
`claude/spot-wellness-app-r6l5bj`, `git pull --rebase` avant push, pas de PR sauf
demande, ne jamais toucher la clé Supabase `service_role`, produire un aperçu
visuel quand l'apparence change.
