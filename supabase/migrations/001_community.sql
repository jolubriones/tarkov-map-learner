-- ============================================================================
-- Tarkov Map Learner: public community backend (migration 001).
--
-- Run once in the Supabase SQL editor (or `supabase db push`). Creates the
-- tables, row-level-security policies, consensus triggers, the ELO RPC, and
-- the Storage bucket for landmark photos.
--
-- Thresholds mirror src/lib/community/{config,difficulty}.ts deliberately:
-- the database is the final authority once the app points at it. Consensus
-- counts live in community_config so they stay tunable without a migration.
--
-- Enforcement split (see docs/backend.md):
--   DATABASE: required fields, length bounds, answer-in-options,
--     landmark-needs-photo, extract-needs-spawn, one-review-per-user,
--     no self-review/report/vote, reject-note length, pending caps,
--     rating bounds. Transitions run in triggers (atomic, race-free).
--   APP: compass option sets, duplicate options, prompt quality — abuse
--     here just meets peer review, which is the system working as designed.
-- ============================================================================

create extension if not exists "pgcrypto";

-- --------------------------------------------------------------------------
-- Tunables (mirrors COMMUNITY_CONFIG — raise as the community grows).
-- reports_to_flag is intentionally absent: flagging is derived client-side
-- (any open report flags), so the server never needs the threshold.
-- --------------------------------------------------------------------------
create table community_config (
  key text primary key,
  value int not null check (value > 0)
);

insert into community_config (key, value) values
  ('approvals_to_publish', 3),
  ('rejections_to_decline', 3),
  ('approvals_to_apply_fix', 3),
  ('rejections_to_decline_fix', 3),
  ('keep_votes_to_clear_flag', 3);

-- --------------------------------------------------------------------------
-- Profiles: one row per auth user (created by trigger on signup).
-- --------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique
    check (char_length(username) between 3 and 16)
    check (username = lower(username)),
  display_name text not null check (char_length(display_name) between 1 and 32),
  win_streak int not null default 0 check (win_streak >= 0),
  created_at timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, username, display_name)
  values (
    new.id,
    left(lower(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1))), 16),
    left(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)), 32)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- --------------------------------------------------------------------------
-- Official bank ids: lets policies tell a real bundled question (c-NN)
-- from a garbage id. Reports/votes/corrections may target official ids or
-- approved community rows — nothing else.
-- --------------------------------------------------------------------------
create table official_questions (
  question_id text primary key
);

insert into official_questions (question_id) values
  ('c-01'), ('c-02'), ('c-03'), ('c-04'), ('c-05'),
  ('c-06'), ('c-07'), ('c-08'), ('c-09'), ('c-10'),
  ('c-11'), ('c-12'), ('c-13'), ('c-14'), ('c-15');

-- --------------------------------------------------------------------------
-- Community questions (submissions). Live = status 'approved'.
-- --------------------------------------------------------------------------
create or replace function valid_question_options(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  element jsonb;
begin
  if jsonb_typeof(value) <> 'array' then return false; end if;
  if jsonb_array_length(value) < 2 or jsonb_array_length(value) > 6 then return false; end if;
  for element in select * from jsonb_array_elements(value) loop
    if jsonb_typeof(element) <> 'string' then return false; end if;
    if char_length(element #>> '{}') < 1 or char_length(element #>> '{}') > 80 then return false; end if;
  end loop;
  return true;
end;
$$;

create table questions (
  id uuid primary key default gen_random_uuid(),
  map_id text not null,
  type text not null check (type in ('landmark_mc', 'compass_check', 'extract_logic')),
  prompt text not null check (char_length(prompt) between 12 and 300),
  options jsonb not null check (valid_question_options(options)),
  correct_answer text not null check (char_length(correct_answer) between 1 and 80),
  explanation text not null check (char_length(explanation) between 12 and 500),
  tip text check (tip is null or char_length(tip) <= 300),
  image_path text check (image_path is null or char_length(image_path) <= 500),
  difficulty text not null check (difficulty in ('essential', 'enlightened', 'sherpa', 'immortal')),
  spawn_location text check (spawn_location is null or char_length(spawn_location) between 1 and 80),
  author_id uuid not null references profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  corrected_at timestamptz,
  corrected_by_name text,
  constraint answer_in_options check (options ? correct_answer),
  constraint landmark_needs_photo check (type <> 'landmark_mc' or image_path is not null),
  constraint extract_needs_spawn check (type <> 'extract_logic' or spawn_location is not null)
);

create index questions_status_idx on questions (status, decided_at);
create index questions_author_idx on questions (author_id);

-- --------------------------------------------------------------------------
-- Reviews on submissions (+ publish/decline transitions).
-- --------------------------------------------------------------------------
create table reviews (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions (id) on delete cascade,
  reviewer_id uuid not null references profiles (id) on delete cascade,
  decision text not null check (decision in ('approve', 'reject')),
  comment text check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  unique (question_id, reviewer_id),
  constraint reject_needs_note check (
    decision <> 'reject' or (comment is not null and char_length(comment) >= 4)
  )
);

create index reviews_question_idx on reviews (question_id);

-- Monotonic + guarded: concurrent deciding votes each compute the same
-- outcome; the status='pending' guard makes all but one a no-op.
create or replace function transition_question()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  approves int;
  rejects int;
begin
  select count(*) filter (where decision = 'approve'),
         count(*) filter (where decision = 'reject')
    into approves, rejects
    from reviews
    where question_id = new.question_id;
  if approves >= (select value from community_config where key = 'approvals_to_publish') then
    update questions set status = 'approved', decided_at = now()
      where id = new.question_id and status = 'pending';
  elsif rejects >= (select value from community_config where key = 'rejections_to_decline') then
    update questions set status = 'rejected', decided_at = now()
      where id = new.question_id and status = 'pending';
  end if;
  return new;
end;
$$;

create trigger on_review_insert
  after insert on reviews
  for each row execute function transition_question();

-- Author edits restart review (reviews wiped when draft columns change —
-- status flips by the transition trigger never match the WHEN clause).
create or replace function restart_reviews_on_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from reviews where question_id = new.id;
  return new;
end;
$$;

create trigger on_question_edit
  after update on questions
  for each row
  when (
    old.map_id is distinct from new.map_id
    or old.type is distinct from new.type
    or old.prompt is distinct from new.prompt
    or old.options is distinct from new.options
    or old.correct_answer is distinct from new.correct_answer
    or old.explanation is distinct from new.explanation
    or old.tip is distinct from new.tip
    or old.image_path is distinct from new.image_path
    or old.difficulty is distinct from new.difficulty
    or old.spawn_location is distinct from new.spawn_location
  )
  execute function restart_reviews_on_edit();

-- --------------------------------------------------------------------------
-- Reports against live questions (community uuids AND official c-NN ids).
-- --------------------------------------------------------------------------
create table reports (
  id uuid primary key default gen_random_uuid(),
  question_id text not null,
  reporter_id uuid not null references profiles (id) on delete cascade,
  reason text not null check (reason in (
    'wrong-answer', 'bad-prompt', 'bad-explanation', 'broken-image', 'duplicate', 'other'
  )),
  details text check (details is null or char_length(details) <= 500),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  constraint other_needs_details check (
    reason <> 'other' or (details is not null and char_length(details) > 0)
  )
);

create index reports_question_idx on reports (question_id, status);
-- One open report per player per question (re-report after dismissal allowed).
create unique index reports_open_unique on reports (question_id, reporter_id)
  where status = 'open';

-- --------------------------------------------------------------------------
-- "Looks correct" votes: the threshold clears the flag.
-- --------------------------------------------------------------------------
create table keep_votes (
  question_id text not null,
  user_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (question_id, user_id)
);

create index keep_votes_question_idx on keep_votes (question_id);

create or replace function clear_flag_on_keep_threshold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from keep_votes where question_id = new.question_id)
     >= (select value from community_config where key = 'keep_votes_to_clear_flag') then
    update reports set status = 'dismissed'
      where question_id = new.question_id and status = 'open';
  end if;
  return new;
end;
$$;

create trigger on_keep_vote_insert
  after insert on keep_votes
  for each row execute function clear_flag_on_keep_threshold();

-- --------------------------------------------------------------------------
-- Corrections: proposed fixed drafts for live questions (any id kind).
-- Approved corrections for OFFICIAL questions live here permanently —
-- clients overlay the latest approved one as an override (same as local).
-- --------------------------------------------------------------------------
create table corrections (
  id uuid primary key default gen_random_uuid(),
  question_id text not null,
  draft jsonb not null check (
    jsonb_typeof(draft) = 'object'
    and draft ?& array['map_id', 'type', 'prompt', 'options', 'correct_answer', 'explanation', 'difficulty']
  ),
  reason text not null check (char_length(reason) between 8 and 500),
  author_id uuid not null references profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index corrections_question_idx on corrections (question_id, status);
-- One pending fix per player per question.
create unique index corrections_pending_unique on corrections (question_id, author_id)
  where status = 'pending';

create table correction_reviews (
  id uuid primary key default gen_random_uuid(),
  correction_id uuid not null references corrections (id) on delete cascade,
  reviewer_id uuid not null references profiles (id) on delete cascade,
  decision text not null check (decision in ('approve', 'reject')),
  comment text check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  unique (correction_id, reviewer_id),
  constraint fix_reject_needs_note check (
    decision <> 'reject' or (comment is not null and char_length(comment) >= 4)
  )
);

create index correction_reviews_correction_idx on correction_reviews (correction_id);

-- Deciding approval applies the fix: community rows are patched in place
-- (official targets match zero rows — clients overlay from this table),
-- open reports resolve, keep votes clear. A fix whose target left the pool
-- still decides (queue self-cleans) but patches nothing — same as local.
create or replace function transition_correction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fix corrections%rowtype;
  approves int;
  rejects int;
  author_name text;
begin
  select * into fix from corrections where id = new.correction_id;
  select count(*) filter (where decision = 'approve'),
         count(*) filter (where decision = 'reject')
    into approves, rejects
    from correction_reviews
    where correction_id = new.correction_id;
  if approves >= (select value from community_config where key = 'approvals_to_apply_fix') then
    update corrections set status = 'approved', decided_at = now()
      where id = fix.id and status = 'pending';
    if found then
      select display_name into author_name from profiles where id = fix.author_id;
      update questions set
        map_id = fix.draft ->> 'map_id',
        type = fix.draft ->> 'type',
        prompt = fix.draft ->> 'prompt',
        options = fix.draft -> 'options',
        correct_answer = fix.draft ->> 'correct_answer',
        explanation = fix.draft ->> 'explanation',
        tip = fix.draft ->> 'tip',
        image_path = fix.draft ->> 'image_path',
        difficulty = fix.draft ->> 'difficulty',
        spawn_location = fix.draft ->> 'spawn_location',
        corrected_at = now(),
        corrected_by_name = author_name
        where id::text = fix.question_id;
      update reports set status = 'resolved'
        where question_id = fix.question_id and status = 'open';
      delete from keep_votes where question_id = fix.question_id;
    end if;
  elsif rejects >= (select value from community_config where key = 'rejections_to_decline_fix') then
    update corrections set status = 'rejected', decided_at = now()
      where id = fix.id and status = 'pending';
  end if;
  return new;
end;
$$;

create trigger on_correction_review_insert
  after insert on correction_reviews
  for each row execute function transition_correction();

create or replace function restart_fix_reviews_on_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from correction_reviews where correction_id = new.id;
  return new;
end;
$$;

create trigger on_correction_edit
  after update on corrections
  for each row
  when (old.draft is distinct from new.draft or old.reason is distinct from new.reason)
  execute function restart_fix_reviews_on_edit();

-- Deleting a question removes its orphan-prone children (reports, votes,
-- and fixes reference text ids without foreign keys, so official targets
-- and community targets share one code path).
create or replace function cleanup_question_children()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from corrections where question_id = old.id::text;
  delete from reports where question_id = old.id::text;
  delete from keep_votes where question_id = old.id::text;
  return old;
end;
$$;

create trigger on_question_delete
  before delete on questions
  for each row execute function cleanup_question_children();

-- --------------------------------------------------------------------------
-- Skill rating: one row per player per map. Written ONLY by answer_rated.
-- --------------------------------------------------------------------------
create table ratings (
  user_id uuid not null references profiles (id) on delete cascade,
  map_id text not null,
  rating int not null check (rating between 100 and 3000),
  answered int not null default 0 check (answered >= 0),
  primary key (user_id, map_id)
);

create index ratings_user_idx on ratings (user_id);

-- ELO match vs the question's bin — a direct port of applyEloAnswer
-- (src/lib/community/elo.ts). Same K, same protection, same streak bonus
-- on earned gains only, same +1 floor. Known micro-divergence: Postgres
-- round() breaks exact .5 ties away from zero where JS rounds half up —
-- unreachable from float pow() output in practice.
create or replace function answer_rated(p_map text, p_difficulty text, p_correct boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prev_rating int;
  prev_answered int;
  prev_streak int;
  q_rating int;
  k int;
  expected numeric;
  raw int;
  bonus int := 0;
  streak int;
  new_rating int;
begin
  if uid is null then raise exception 'sign in to record rated answers'; end if;
  q_rating := case p_difficulty
    when 'essential' then 600
    when 'enlightened' then 1100
    when 'sherpa' then 1600
    when 'immortal' then 2100
  end;
  if q_rating is null then raise exception 'unknown difficulty'; end if;
  select rating, answered into prev_rating, prev_answered
    from ratings where user_id = uid and map_id = p_map;
  if not found then
    prev_rating := 800;
    prev_answered := 0;
  end if;
  select win_streak into prev_streak from profiles where id = uid;
  k := case when prev_answered < 10 then 48 else 32 end;
  expected := 1 / (1 + power(10, (q_rating - prev_rating)::numeric / 400));
  raw := round(k * ((case when p_correct then 1 else 0 end) - expected));
  if p_correct then
    streak := prev_streak + 1;
    if raw > 0 then
      bonus := least(streak - 1, 5) * 2;
      raw := raw + bonus;
    end if;
    raw := greatest(raw, 1);
  else
    streak := 0;
    if prev_rating < 1000 then
      raw := ceil(raw::numeric / 2);
    end if;
  end if;
  new_rating := greatest(prev_rating + raw, 100);
  insert into ratings (user_id, map_id, rating, answered)
    values (uid, p_map, new_rating, prev_answered + 1)
    on conflict (user_id, map_id)
    do update set rating = excluded.rating, answered = excluded.answered;
  update profiles set win_streak = streak where id = uid;
  return jsonb_build_object(
    'rating', new_rating,
    'answered', prev_answered + 1,
    'delta', new_rating - prev_rating,
    'bonus', bonus,
    'winStreak', streak
  );
end;
$$;

-- --------------------------------------------------------------------------
-- Maintainers (moderation deletes + status overrides). Bootstrap after your
-- first signup: insert into maintainers (user_id) values ('<your id>');
-- --------------------------------------------------------------------------
create table maintainers (
  user_id uuid primary key references profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function is_maintainer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from maintainers where user_id = auth.uid());
$$;

-- Live target = approved community row or a real official id. Used by the
-- report/vote/correction insert policies so garbage ids never enter.
create or replace function is_live_target(target_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from questions where id::text = target_id and status = 'approved')
      or exists (select 1 from official_questions where question_id = target_id);
$$;

-- --------------------------------------------------------------------------
-- Row-level security. Reads are public (public bank + transparent queues —
-- guests browse, same as local). Writes are constrained; status transitions
-- run only in triggers; ratings move only via answer_rated.
-- --------------------------------------------------------------------------
alter table community_config enable row level security;
alter table profiles enable row level security;
alter table official_questions enable row level security;
alter table questions enable row level security;
alter table reviews enable row level security;
alter table reports enable row level security;
alter table keep_votes enable row level security;
alter table corrections enable row level security;
alter table correction_reviews enable row level security;
alter table ratings enable row level security;
alter table maintainers enable row level security;

-- Config + official ids: world-readable, SQL-editor-writable.
create policy config_read on community_config for select using (true);
create policy official_read on official_questions for select using (true);

-- Profiles: world-readable (queues show names), self-writable.
create policy profiles_read on profiles for select using (true);
create policy profiles_update_own on profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- Questions: world-readable; authors manage own rows; maintainers moderate.
create policy questions_read on questions for select using (true);
create policy questions_insert on questions for insert to authenticated
  with check (
    auth.uid() = author_id
    and (select count(*) from questions where author_id = auth.uid() and status = 'pending') < 10 -- mirrors maxPendingSubmissions
  );
create policy questions_update_own on questions for update to authenticated
  using (auth.uid() = author_id and status = 'pending')
  with check (auth.uid() = author_id and status = 'pending');
create policy questions_delete_own on questions for delete to authenticated
  using (auth.uid() = author_id);
create policy questions_maintain on questions for all to authenticated
  using (is_maintainer()) with check (is_maintainer());

-- Reviews: world-readable; insert constrained (pending + not own + signed).
create policy reviews_read on reviews for select using (true);
create policy reviews_insert on reviews for insert to authenticated
  with check (
    reviewer_id = auth.uid()
    and exists (
      select 1 from questions q
      where q.id = question_id and q.status = 'pending' and q.author_id <> auth.uid()
    )
  );
create policy reviews_maintain on reviews for all to authenticated
  using (is_maintainer()) with check (is_maintainer());

-- Reports: world-readable; insert constrained (live target + not own).
create policy reports_read on reports for select using (true);
create policy reports_insert on reports for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and is_live_target(question_id)
    and not exists (
      select 1 from questions q where q.id::text = question_id and q.author_id = auth.uid()
    )
  );
create policy reports_maintain on reports for all to authenticated
  using (is_maintainer()) with check (is_maintainer());

-- Keep votes: world-readable; insert constrained (flagged + not own).
create policy keep_read on keep_votes for select using (true);
create policy keep_insert on keep_votes for insert to authenticated
  with check (
    user_id = auth.uid()
    and is_live_target(question_id)
    and exists (select 1 from reports r where r.question_id = keep_votes.question_id and r.status = 'open')
    and not exists (
      select 1 from questions q where q.id::text = question_id and q.author_id = auth.uid()
    )
  );
create policy keep_maintain on keep_votes for all to authenticated
  using (is_maintainer()) with check (is_maintainer());

-- Corrections: world-readable; authors manage own pending; maintainers all.
create policy corrections_read on corrections for select using (true);
create policy corrections_insert on corrections for insert to authenticated
  with check (
    author_id = auth.uid()
    and is_live_target(question_id)
    and not exists (
      select 1 from questions q where q.id::text = question_id and q.author_id = auth.uid()
    )
  );
create policy corrections_update_own on corrections for update to authenticated
  using (auth.uid() = author_id and status = 'pending')
  with check (auth.uid() = author_id and status = 'pending');
create policy corrections_delete_own on corrections for delete to authenticated
  using (auth.uid() = author_id and status = 'pending');
create policy corrections_maintain on corrections for all to authenticated
  using (is_maintainer()) with check (is_maintainer());

-- Correction reviews: same shape as reviews.
create policy fix_reviews_read on correction_reviews for select using (true);
create policy fix_reviews_insert on correction_reviews for insert to authenticated
  with check (
    reviewer_id = auth.uid()
    and exists (
      select 1 from corrections c
      where c.id = correction_id and c.status = 'pending' and c.author_id <> auth.uid()
    )
  );
create policy fix_reviews_maintain on correction_reviews for all to authenticated
  using (is_maintainer()) with check (is_maintainer());

-- Ratings: owners read; only answer_rated writes (no write policies at all).
create policy ratings_read_own on ratings for select to authenticated
  using (auth.uid() = user_id);

-- Maintainers: world-readable (moderators are public), SQL-managed.
create policy maintainers_read on maintainers for select using (true);

-- Table grants (RLS narrows from here — both are required).
grant select on community_config, official_questions, maintainers to anon, authenticated;
grant select on profiles, questions, reviews, reports, keep_votes, corrections, correction_reviews to anon, authenticated;
grant insert, update, delete on profiles, questions, reviews, reports, keep_votes, corrections, correction_reviews to authenticated;
grant select on ratings to authenticated;
grant execute on function answer_rated(text, text, boolean) to authenticated;
grant execute on function is_live_target(text) to anon, authenticated;
grant execute on function is_maintainer() to authenticated;

-- --------------------------------------------------------------------------
-- Storage: landmark photos. Public read; authenticated writes under the
-- uploader's own folder. 2MB cap — canvas output never exceeds it.
-- --------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('question-images', 'question-images', true, 2097152,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

create policy photos_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'question-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy photos_delete_own on storage.objects for delete to authenticated
  using (
    bucket_id = 'question-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
