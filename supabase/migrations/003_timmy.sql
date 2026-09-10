-- Migration 003: timmy bin (lowest rung) + 500 start rating.
--
-- - questions.difficulty accepts 'timmy'
-- - answer_rated: timmy questions defend 300, fresh maps start at 500
--   (mirrors src/lib/community/{difficulty,elo}.ts)
--
-- Apply after 002_community_audio.sql in the Supabase SQL editor.

alter table questions drop constraint questions_difficulty_check;
alter table questions add constraint questions_difficulty_check
  check (difficulty in ('timmy', 'essential', 'enlightened', 'sherpa', 'immortal'));

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
    when 'timmy' then 300
    when 'essential' then 600
    when 'enlightened' then 1100
    when 'sherpa' then 1600
    when 'immortal' then 2100
  end;
  if q_rating is null then raise exception 'unknown difficulty'; end if;
  select rating, answered into prev_rating, prev_answered
    from ratings where user_id = uid and map_id = p_map;
  if not found then
    prev_rating := 500;
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
