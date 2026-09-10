-- Migration 002: text-trivia + audio question types.
--
-- - questions.type accepts trivia_mc / audio_mc
-- - questions.audio_path + audio_needs_clip (mirror of landmark_needs_photo)
-- - corrections drafts: audio fixes must carry a clip
-- - transition_correction carries audio_path onto the live row
-- - question-audio Storage bucket (2MB, audio MIME allowlist) with
--   per-user folder policies mirroring question-images
--
-- Apply after 001_community.sql in the Supabase SQL editor.

alter table questions drop constraint questions_type_check;
alter table questions add constraint questions_type_check
  check (type in ('landmark_mc', 'compass_check', 'extract_logic', 'trivia_mc', 'audio_mc'));

alter table questions add column audio_path text
  check (audio_path is null or char_length(audio_path) <= 500);

alter table questions add constraint audio_needs_clip
  check (type <> 'audio_mc' or audio_path is not null);

alter table corrections add constraint fix_audio_needs_clip
  check (draft ->> 'type' <> 'audio_mc' or draft ->> 'audio_path' is not null);

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
        audio_path = fix.draft ->> 'audio_path',
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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('question-audio', 'question-audio', true, 2097152,
    array['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/aac']);

create policy audio_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'question-audio'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy audio_delete_own on storage.objects for delete to authenticated
  using (
    bucket_id = 'question-audio'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
