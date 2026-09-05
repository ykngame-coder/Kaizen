# Prompts en attente (à exécuter plus tard)

Chaque fichier est un prompt **prêt à copier-coller** pour une session Claude Code
(locale sur le PC, sur le Mac, ou web), calé sur le code réel du repo. Ils sont
indépendants et peuvent être lancés dans n'importe quel ordre, sauf indication.

| Prompt | Ce qu'il met en place | Quand |
|---|---|---|
| `scores-sport-nutrition-sommeil.md` | Score Sport (perf + régularité + progression), nutrition dans le score Supotsu global, sommeil via `computeSleepScore2` (régularité + dette) | À tout moment |
| `carrousel-peek.md` | Composant `Carousel` réutilisable (effet peek + points), appliqué partout où c'est pertinent | À tout moment |
| `import-ocr-seances.md` | Import d'une séance depuis une **capture d'écran** — OCR 100 % local (Voie A) + écran de revue éditable | À tout moment |
| `sommeil-telephone-reveil.md` | Suivi du sommeil par le **téléphone** (actigraphie) + **réveil intelligent programmable** | À tout moment |
| `creation-suivi-seance.md` | Améliorer la **création** (prefill+suggestion, ajout rapide, modèles, superset) et le **suivi/runner** (log+repos auto, réf. précédente + RPE/RIR, reprise, calculateur de disques, échauffement auto) | À tout moment |
| `i18n-multilingue.md` | **Multilingue** FR/EN/ES/PT/DE (infra i18n + sélecteur + extraction) — _infra déjà en place, sert de référence_ | Fait / en cours |
| `apple-watch-niveau1.md` | App **Apple Watch** compagnon (suivre sa séance au poignet) — Niveau 1 | **Post-TestFlight** |
| `apple-watch-niveau2.md` | Apple Watch — séance **live** (FC temps réel, calories, HealthKit workout) | **Après le Niveau 1** |

Règles communes (rappelées dans chaque prompt) : développer sur
`claude/spot-wellness-app-r6l5bj`, `git pull --rebase` avant push, pas de PR sauf
demande, ne jamais toucher la clé Supabase `service_role`, produire un aperçu
visuel quand l'apparence change.
