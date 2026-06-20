# Data Storage Implementation — Plan

**Branch:** `feat/data-storage-implementation`
**Goal:** Store granular mistake data from user problem attempts and generate custom learning paths from that data.

---

## 1. Current State Analysis

The platform already has:

- **`user_learning_path_item_progress`** — tracks which items a user completed (binary: done/not done).
- **Flashcard system** (`user_flashcards`, `user_flashcard_sessions`) — reactively generates flashcards for items users struggled with during learning paths.
- **`deduct_elo_wrong_problem_answer()`** — subtracts 10 ELO when a user answers a catalog problem wrong.
- **Problem answer checking** — happens client-side in `problem-section.tsx`; correctness is computed by comparing user input to `grila_correct_index` or `value_subpoints.correct_value`.
- **User_stats** — tracks overall ELO score per user.
- **Learning path chapters/lessons/items** — structured content that can be assembled into routes.

**Gaps:**
- When a user answers a problem wrong, the **specific answer they gave** is never saved (only `registerFailure()` is called, which is a client-side engagement metric).
- There's no table recording **what** answer the user gave for a specific problem attempt.
- No facility to **aggregate mistakes** by concept/topic/category across the entire platform.
- No facility to **generate custom routes** from mistake data.

---

## 2. Database Schema — New Tables

### 2.1 `user_problem_attempts`

Stores every answer a user submits to any problem type (grila, value, learning-path problems, catalog problems, coding problems, math problems).

```sql
create table public.user_problem_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  problem_id text not null,              -- problem.id or lesson_item.id
  source_type text not null,             -- 'catalog_problem' | 'learning_path_item' | 'math_problem' | 'coding_problem'
  answer_type text not null,             -- 'grila' | 'value' | 'text' | 'code'
  user_answer jsonb not null,            -- the user's submitted answer (index for grila, object for value, text for coding)
  correct_answer jsonb not null,         -- the correct answer for reference
  is_correct boolean not null,
  attempt_number int not null default 1, -- sequential per (user_id, problem_id, source_type)
  topic_tags text[],                     -- extracted tags/categories for aggregation
  lesson_id uuid references public.learning_path_lessons(id),
  chapter_id uuid references public.learning_path_chapters(id),
  created_at timestamptz not null default now()
);

-- Indexes for fast mistake retrieval
create index idx_user_problem_attempts_user on public.user_problem_attempts(user_id);
create index idx_user_problem_attempts_user_correct on public.user_problem_attempts(user_id, is_correct);
create index idx_user_problem_attempts_tags on public.user_problem_attempts using gin(topic_tags);
```

**Design notes:**
- `JSONB` for answers avoids schema explosion across problem types.
- `source_type` separates catalog problems, learning-path items, math problems, etc.
- `topic_tags` is the key pivot for generative routing — we can query "which topics does user X make the most mistakes in?"
- `attempt_number` tracks retries so we can weight "took 3 tries to get right" as a semi-mistake.

### 2.2 `user_mistake_concept_aggregates`

Materialized-view-like table that pre-computes per-user mistake densities by concept/tag. Updated via trigger or scheduled job.

```sql
create table public.user_mistake_concept_aggregates (
  user_id uuid not null references auth.users(id) on delete cascade,
  tag text not null,
  total_attempts int not null default 0,
  wrong_attempts int not null default 0,
  last_wrong_at timestamptz,
  primary key (user_id, tag)
);
```

Updated by a trigger on `user_problem_attempts` after insert.

### 2.3 `user_custom_routes` (Optional — Phase 2)

Stores generated custom learning paths:

```sql
create table public.user_custom_routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  route_data jsonb not null,             -- ordered array of {chapter_slug, lesson_slug, item_index}
  mistake_tags text[],                   -- the tags that triggered this route
  is_active boolean not null default true,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
```

---

## 3. Data Capture Points

### 3.1 Learning-path problems (grila/value)

**File:** `components/invata/problem-section.tsx`

- On wrong answer (line ~210-214 and ~227-229): call a new `recordProblemAttempt()` function that inserts into `user_problem_attempts`.
- On correct answer: also record the attempt (so we have the full picture).
- Pass along `tag`/`category` info from the problem object.

### 3.2 Catalog problems (`/probleme/[id]`)

**File:** `app/probleme/[id]/ProblemDetailClient.tsx`

- Similar patch: intercept the answer submission flow and record the attempt.
- The `deduct_elo_wrong_problem_answer()` RPC is already called here — piggyback.

### 3.3 Coding problems

**File:** `components/invata/learning-path-coding-problem-section.tsx`

- After a code submission is judged: record the attempt with the submitted code, test results, and pass/fail status.

### 3.4 Math problems

**File:** Various math-problem related components.

- Similar capture on answer submission.

### 3.5 Interactive items (fill_slot, card_sort, match, etc.)

- Each interactive item type has its own correctness check. Add capture calls to each.

---

## 4. Vote of Mistake Aggregation API

### 4.1 `GET /api/user/mistakes/summary`

Returns per-user mistake breakdown by tag:

```json
{
  "total_attempts": 142,
  "wrong_attempts": 38,
  "weakest_tags": [
    {"tag": "trigonometry", "wrong_ratio": 0.65, "total": 17, "wrong": 11},
    {"tag": "matrici", "wrong_ratio": 0.50, "total": 10, "wrong": 5}
  ],
  "recent_wrong": [
    {"problem_id": "...", "user_answer": "...", "correct_answer": "...", "timestamp": "..."}
  ]
}
```

### 4.2 `GET /api/user/mistakes/weak-areas`

Returns the top-N weak areas with suggested review content.

---

## 5. Custom Route Generation

### 5.1 Trigger / Entry Point

1. **Manual:** A new "Generate Custom Route" button on the dashboard or `/invata` page.
2. **Automatic:** When a user's mistake rate in a topic exceeds a threshold (e.g., >60% wrong on ≥5 attempts), a prompt appears: "Seems like you're struggling with trigonometry — want a custom practice route?"
3. **Periodic:** A weekly/scheduled check via cron job.

### 5.2 Generation Algorithm

```
Input: user_id
1. Query user_problem_attempts WHERE is_correct = false
2. Group by topic_tags, count wrong per tag
3. Sort by wrong_ratio desc, pick top 3-5 tags
4. For each tag, find relevant learning_path_lesson_items:
   a. Items whose associated problems have matching tags/category
   b. Order by difficulty ascending (scaffolding)
5. Assemble into a new "custom chapter" or a temporary route
6. Save to user_custom_routes OR serve ephemerally
7. Display to user as a special section in /invata
```

### 5.3 Route Types

| Type | Description | When |
|------|-------------|------|
| **Remedial Route** | Easy/medium problems on the exact tags you got wrong | Immediate fix |
| **Review Route** | Mixed problems across all your weak areas | End-of-week review |
| **Challenge Route** | Slightly harder problems on weak areas | After remedial pass |

### 5.4 Implementation Options

**Option A: Ephemeral custom lesson (recommended for Phase 1)**
- Generate a temporary `content_json` payload for a `custom_text` or assembled set of items.
- No DB persistence needed for the route itself.
- Store only the mistake data; the route is computed on-the-fly.

**Option B: Full custom chapter (Phase 2)**
- Actually create a `learning_path_chapters` row (marked as `custom`).
- Populate `learning_path_lessons` and `learning_path_lesson_items` from the generated plan.
- This gives full navigation, progress tracking, and persistence.

---

## 6. Implementation Phases

### Phase 1: Data Capture Foundation (2-3 days)

| Task | Files | Description |
|------|-------|-------------|
| 1.1 | New SQL migration | Create `user_problem_attempts` table, indexes, RLS |
| 1.2 | `lib/user-problem-attempts.ts` | Shared function `recordProblemAttempt()` that inserts into the table |
| 1.3 | `components/invata/problem-section.tsx` | Call `recordProblemAttempt()` on every answer (correct + wrong) |
| 1.4 | `app/probleme/[id]/ProblemDetailClient.tsx` | Same — record catalog problem attempts |
| 1.5 | `components/invata/learning-path-coding-problem-section.tsx` | Same — record coding problem attempts |
| 1.6 | Verification | Run existing tests, manual spot check |

### Phase 2: Mistake Aggregation & API (1-2 days)

| Task | Files | Description |
|------|-------|-------------|
| 2.1 | SQL migration | Create `user_mistake_concept_aggregates` and trigger |
| 2.2 | `app/api/user/mistakes/summary/route.ts` | API endpoint for mistake summary |
| 2.3 | `app/api/user/mistakes/weak-areas/route.ts` | API endpoint for weak areas |
| 2.4 | Client hook `use-mistakes.ts` | React hook to consume these APIs |

### Phase 3: Route Generation (2-3 days)

| Task | Files | Description |
|------|-------|-------------|
| 3.1 | `lib/custom-route-generator.ts` | Core algorithm: analyze mistakes → select remediation items |
| 3.2 | `app/api/user/custom-route/generate/route.ts` | API: trigger generation, return route data |
| 3.3 | `components/mistake-route-banner.tsx` | UI component: prompt banner when weaknesses detected |
| 3.4 | Integration in `/invata` or dashboard | "Custom practice" section shown when route is available |
| 3.5 | Route rendering component | Special player that shows the generated items in sequence |

### Phase 4: Polish & UX (1-2 days)

| Task | Description |
|------|-------------|
| 4.1 | Mistake review UI | Show user their recent mistakes with correct answers |
| 4.2 | Progress tracking on custom routes | Track completion of custom route items |
| 4.3 | Threshold auto-prompt tuning | Fine-tune when/how to suggest custom routes |
| 4.4 | Anon user support | Cookie-based attempt tracking for anonymous users |

---

## 7. Improvements & Enhancements

### 7.1 Leverage Existing Flashcard System

The flashcard system (`user_flashcards`) already generates "struggle recovery" content via an AI prompt. Instead of duplicating effort:
- **In Phase 1**: Connect mistake data as a stronger signal into the flashcard generation prompt. Pass the actual wrong answer + correct answer + tags to the flashcard AI so it generates more targeted cards.
- **In Phase 3**: The custom route generator should also produce a deck of flashcards as companion review material.

### 7.2 Spaced Repetition Integration

Combine mistake data with the existing streak/activity system to implement a simple spaced-repetition schedule:
- A mistake on day 1 → review day 1, day 3, day 7, day 14.
- Show custom route items on those intervals.
- This makes practice truly adaptive rather than one-shot.

### 7.3 Topic → Concept Mapping

Instead of raw tags, build a lightweight concept hierarchy:
- `trigonometrie` → `functii_trigonometrice` → `sin_cos_tan`
- This allows the route generator to say "you struggled with sin/cos, here are problems on all of trigonometry *and* the prerequisite geometry concepts."
- Store the hierarchy in a new `concept_graph` table or as structured JSON.

### 7.4 Teacher/Admin Visibility

For the classroom system:
- Show aggregate mistake data per student.
- Let teachers see "your class is struggling most with X" and assign targeted homework.

### 7.5 Route Quality Feedback

Add thumbs-up/down on generated routes so the algorithm can learn:
- "This route was too easy" → increase difficulty next time.
- "This route was too hard" → add more scaffolding.

### 7.6 Exponential Mistake Scoring

Not all wrong answers are equal:
- First try wrong = high severity (user didn't know the concept).
- Third try wrong on the same problem = *very* high severity.
- Correct on second try after a wrong first attempt = medium (partial knowledge).
- Score = `1 / attempt_number` for correct, `attempt_number` for wrong.

Feed this weighted score into the route generator so truly unknown concepts get more emphasis than careless mistakes.

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Data volume: millions of attempts for active users | Partition `user_problem_attempts` by month; use a retention policy (6 months of raw data, keep aggregates forever) |
| Privacy: storing wrong answers = storing user learning data | RLS policies ensure users only see their own data; no admin bulk export without user consent |
| AI-generated custom routes may be low quality | Start with simple deterministic assembly (pick problems by tag + difficulty); iteratively add AI when data volume justifies it |
| Feature creep: this can grow unbounded | Phased releases; Phase 1 (capture) is valuable alone even if route generation never ships |

---

## 9. Success Metrics

- **Phase 1:** Every problem answer (correct or wrong) is recorded in `user_problem_attempts`.
- **Phase 2:** Dashboard shows accurate mistake breakdown by topic.
- **Phase 3:** Users who use custom routes show improved ELO in their weak areas within 7 days.
- **Phase 4:** >30% of users who see the custom-route prompt engage with it.

---

## 10. Summary

The implementation starts with **recording what users actually answer** (not just pass/fail), builds aggregate concept-level mistake profiles, then uses those profiles to **generate targeted practice routes**. The foundation is the `user_problem_attempts` table — everything else builds on it.

The branch `feat/data-storage-implementation` is created and ready for Phase 1 development.
