import { CUSTOMS_DRILL_QUESTIONS } from '@/lib/mockData';
import type {
  ActionResult,
  CommunityUser,
  CorrectionProposal,
  FlaggedItem,
  LiveQuestion,
  QuestionDraft,
  QuestionReport,
  ReportReason,
  Review,
  ReviewDecision,
  Submission,
  SubmissionStatus,
} from './types';
import { ELO_SCALE, overallRating, type EloResult, type EloState } from './elo';
import { COMMUNITY_CONFIG as C } from './config';
import { draftToQuestion, isDraftValid } from './validation';
import { preparePhoto } from './photo';
import type {
  AuthResult,
  CommunityBackend,
  IdResult,
  UrlResult,
} from './backend';
import type { Question, QuestionDifficulty } from '@/lib/types';

// ---------------------------------------------------------------------------
// Structural SDK surface.
//
// @supabase/supabase-js loads lazily (dynamic import) so tsc/build stay
// green without the package installed — the hosted backend is opt-in via
// env credentials, and the local adapter never touches this file. These
// interfaces mirror exactly the SDK surface used below; when the real
// package resolves, it satisfies them.
// ---------------------------------------------------------------------------
interface PostgrestError {
  message: string;
  code?: string;
}

interface QueryResponse<T> {
  data: T | null;
  error: PostgrestError | null;
}

interface QueryChain<T = unknown> {
  select<U = unknown>(columns?: string): QueryChain<U>;
  eq(column: string, value: unknown): QueryChain<T>;
  in(column: string, values: unknown[]): QueryChain<T>;
  order(column: string, opts?: { ascending?: boolean }): QueryChain<T>;
  limit(count: number): QueryChain<T>;
  single(): Promise<QueryResponse<T>>;
  maybeSingle(): Promise<QueryResponse<T | null>>;
  then(
    onfulfilled?: (value: QueryResponse<T[]>) => unknown,
    onrejected?: (reason: unknown) => unknown
  ): Promise<unknown>;
}

interface TableClient {
  select<T = unknown>(columns?: string): QueryChain<T>;
  insert(values: unknown): QueryChain<unknown>;
  update(values: unknown): QueryChain<unknown>;
  delete(): QueryChain<unknown>;
}

interface AuthUser {
  id: string;
  email?: string;
}

interface AuthClient {
  getSession(): Promise<{
    data: { session: { user: AuthUser } | null };
    error: PostgrestError | null;
  }>;
  signUp(args: {
    email: string;
    password: string;
    options?: { data?: Record<string, string> };
  }): Promise<{
    data: { user: AuthUser | null; session: { user: AuthUser } | null };
    error: PostgrestError | null;
  }>;
  signInWithPassword(args: {
    email: string;
    password: string;
  }): Promise<{ data: { user: AuthUser | null }; error: PostgrestError | null }>;
  signOut(): Promise<{ error: PostgrestError | null }>;
}

interface StorageBucket {
  upload(
    path: string,
    body: Blob,
    opts?: { contentType?: string; upsert?: boolean }
  ): Promise<{ data: { path: string } | null; error: PostgrestError | null }>;
  getPublicUrl(path: string): { data: { publicUrl: string } };
}

interface SupabaseClientLike {
  from(table: string): TableClient;
  rpc(fn: string, args?: Record<string, unknown>): Promise<QueryResponse<unknown>>;
  auth: AuthClient;
  storage: { from(bucket: string): StorageBucket };
}

async function loadSdk(): Promise<{
  createClient(url: string, key: string): SupabaseClientLike;
}> {
  try {
    // Dynamic import through the Function constructor: tsc cannot resolve
    // the optional peer, so a static (or plain dynamic) import would fail
    // typecheck on machines without the package installed.
    const importer = new Function('m', 'return import(m)') as (
      m: string
    ) => Promise<{
      createClient(url: string, key: string): SupabaseClientLike;
    }>;
    return await importer('@supabase/supabase-js');
  } catch {
    throw new Error(
      'Hosted backend needs the Supabase client — run npm i @supabase/supabase-js and restart.'
    );
  }
}

// ---------------------------------------------------------------------------
// Row types (snake_case, as stored).
// ---------------------------------------------------------------------------
interface ProfileRow {
  id: string;
  username: string;
  display_name: string;
  win_streak: number;
  created_at: string;
}

interface QuestionRow {
  id: string;
  map_id: string;
  type: QuestionDraft['type'];
  prompt: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  tip: string | null;
  image_path: string | null;
  difficulty: QuestionDraft['difficulty'];
  spawn_location: string | null;
  author_id: string;
  status: SubmissionStatus;
  created_at: string;
  decided_at: string | null;
  corrected_at: string | null;
  corrected_by_name: string | null;
}

interface ReviewRow {
  reviewer_id: string;
  decision: ReviewDecision;
  comment: string | null;
  created_at: string;
}

interface ReportRow {
  id: string;
  question_id: string;
  reporter_id: string;
  reason: string;
  details: string | null;
  created_at: string;
  status: 'open' | 'resolved' | 'dismissed';
}

interface CorrectionRow {
  id: string;
  question_id: string;
  draft: Record<string, unknown>;
  reason: string;
  author_id: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  decided_at: string | null;
}

interface KeepVoteRow {
  question_id: string;
  user_id: string;
  created_at: string;
}

interface RatingRow {
  user_id: string;
  map_id: string;
  rating: number;
  answered: number;
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------
function supabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
}

function storagePublicUrl(path: string): string {
  return `${supabaseUrl()}/storage/v1/object/public/question-images/${path}`;
}

/** Draft image URL → stored image_path (bucket paths round-trip; remote/data URLs pass through). */
function imageUrlToPath(url: string | undefined): string | null {
  if (!url) return null;
  const prefix = `${supabaseUrl()}/storage/v1/object/public/question-images/`;
  if (url.startsWith(prefix)) return url.slice(prefix.length);
  return url;
}

/** Stored image_path → renderable URL. */
function photoSrc(path: string | null): string | undefined {
  if (!path) return undefined;
  if (/^(https?:|data:)/.test(path)) return path;
  return storagePublicUrl(path);
}

function draftToRow(draft: QuestionDraft): Record<string, unknown> {
  return {
    map_id: draft.mapId,
    type: draft.type,
    prompt: draft.prompt,
    options: draft.options,
    correct_answer: draft.correctAnswer,
    explanation: draft.explanation,
    tip: draft.tip ?? null,
    image_path: imageUrlToPath(draft.imageUrl),
    difficulty: draft.difficulty,
    spawn_location: draft.spawnLocation ?? null,
  };
}

function draftFromRow(row: {
  map_id: string;
  type: QuestionDraft['type'];
  prompt: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  tip: string | null;
  image_path: string | null;
  difficulty: QuestionDraft['difficulty'];
  spawn_location: string | null;
}): QuestionDraft {
  return {
    mapId: row.map_id,
    type: row.type,
    prompt: row.prompt,
    options: row.options,
    correctAnswer: row.correct_answer,
    explanation: row.explanation,
    tip: row.tip ?? undefined,
    imageUrl: photoSrc(row.image_path),
    difficulty: row.difficulty,
    spawnLocation: row.spawn_location ?? undefined,
  };
}

function draftFromJson(draft: Record<string, unknown>): QuestionDraft {
  return draftFromRow({
    map_id: draft.map_id as string,
    type: draft.type as QuestionDraft['type'],
    prompt: draft.prompt as string,
    options: draft.options as string[],
    correct_answer: draft.correct_answer as string,
    explanation: draft.explanation as string,
    tip: (draft.tip as string | null) ?? null,
    image_path: (draft.image_path as string | null) ?? null,
    difficulty: draft.difficulty as QuestionDraft['difficulty'],
    spawn_location: (draft.spawn_location as string | null) ?? null,
  });
}

async function all<T>(chain: QueryChain<T>): Promise<T[]> {
  const { data, error } = (await chain) as QueryResponse<T[]>;
  if (error) throw error;
  return data ?? [];
}

function toReview(row: ReviewRow, names: Map<string, string>): Review {
  return {
    reviewerId: row.reviewer_id,
    reviewerName: names.get(row.reviewer_id) ?? 'Former player',
    decision: row.decision,
    comment: row.comment ?? undefined,
    createdAt: row.created_at,
  };
}

function toSubmission(
  row: QuestionRow,
  reviews: ReviewRow[],
  names: Map<string, string>
): Submission {
  return {
    id: row.id,
    draft: draftFromRow(row),
    authorId: row.author_id,
    authorName: names.get(row.author_id) ?? 'Former player',
    createdAt: row.created_at,
    decidedAt: row.decided_at ?? undefined,
    status: row.status,
    reviews: reviews.map((r) => toReview(r, names)),
    correctedAt: row.corrected_at ?? undefined,
    correctedBy: row.corrected_by_name ?? undefined,
  };
}

function toCorrection(
  row: CorrectionRow,
  reviews: ReviewRow[],
  names: Map<string, string>
): CorrectionProposal {
  return {
    id: row.id,
    questionId: row.question_id,
    draft: draftFromJson(row.draft),
    reason: row.reason,
    authorId: row.author_id,
    authorName: names.get(row.author_id) ?? 'Former player',
    createdAt: row.created_at,
    decidedAt: row.decided_at ?? undefined,
    status: row.status,
    reviews: reviews.map((r) => toReview(r, names)),
  };
}

function toReport(row: ReportRow, names: Map<string, string>): QuestionReport {
  return {
    id: row.id,
    questionId: row.question_id,
    reporterId: row.reporter_id,
    reporterName: names.get(row.reporter_id) ?? 'Former player',
    reason: row.reason as QuestionReport['reason'],
    details: row.details ?? undefined,
    createdAt: row.created_at,
    status: row.status,
  };
}

/** Postgres codes → the same user-facing messages the local adapter returns. */
function pgMessage(error: PostgrestError, denied: string, duplicate?: string): string {
  if (error.code === '23505' && duplicate) return duplicate;
  if (error.code === '23514') {
    return 'Some fields are invalid — check lengths and required values.';
  }
  if (error.code === '42501') return denied;
  return denied;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Backend.
// ---------------------------------------------------------------------------
export function createSupabaseBackend(): CommunityBackend {
  let client: SupabaseClientLike | null = null;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };

  async function db(): Promise<SupabaseClientLike> {
    if (client) return client;
    const sdk = await loadSdk();
    client = sdk.createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
    );
    return client;
  }

  async function sessionUserId(): Promise<string | null> {
    const c = await db();
    const { data } = await c.auth.getSession();
    return data.session?.user.id ?? null;
  }

  async function displayNames(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const c = await db();
    const rows = await all<ProfileRow>(
      c.from('profiles').select<ProfileRow>('id,display_name').in('id', unique)
    );
    return new Map(rows.map((r) => [r.id, r.display_name]));
  }

  async function profileOf(userId: string): Promise<CommunityUser | null> {
    const c = await db();
    const { data, error } = await c
      .from('profiles')
      .select<ProfileRow>('id,username,display_name,created_at')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      id: data.id,
      username: data.username,
      displayName: data.display_name,
      createdAt: data.created_at,
    };
  }

  function questionFromFix(question: Question, fix: CorrectionRow): Question {
    return draftToQuestion(draftFromJson(fix.draft), question.id);
  }

  async function readEloState(uid: string): Promise<EloState> {
    const c = await db();
    const [ratings, profile] = await Promise.all([
      all<RatingRow>(c.from('ratings').select<RatingRow>('*').eq('user_id', uid)),
      c
        .from('profiles')
        .select<Pick<ProfileRow, 'win_streak'>>('win_streak')
        .eq('id', uid)
        .maybeSingle()
        .then((r) => r.data),
    ]);
    return {
      ratings: Object.fromEntries(
        ratings.map((r) => [r.map_id, { rating: r.rating, answered: r.answered }])
      ),
      winStreak: profile?.win_streak ?? 0,
      scale: ELO_SCALE,
    };
  }

  async function localFallback(): Promise<CommunityBackend> {
    const { createLocalBackend } = await import('./localBackend');
    return createLocalBackend();
  }

  return {
    kind: 'supabase',

    async getSessionUser(): Promise<CommunityUser | null> {
      const uid = await sessionUserId();
      if (!uid) return null;
      return profileOf(uid);
    },

    async signUp(username, email, password, displayName): Promise<AuthResult> {
      const handle = username.trim().toLowerCase();
      if (handle.length < C.usernameMin || handle.length > C.usernameMax) {
        return { ok: false, error: `Username needs ${C.usernameMin}–${C.usernameMax} characters.` };
      }
      if (!/^[a-z0-9_-]+$/.test(handle)) {
        return { ok: false, error: 'Username can only use letters, numbers, _ and -.' };
      }
      if (password.length < C.passwordMin) {
        return { ok: false, error: `Password needs at least ${C.passwordMin} characters.` };
      }
      const c = await db();
      const { data, error } = await c.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            username: handle,
            display_name: (displayName?.trim() || handle).slice(0, 32),
          },
        },
      });
      if (error) {
        if (/profiles_username_key/.test(error.message)) {
          return { ok: false, error: 'That username is taken — try another.' };
        }
        if (/already registered|already exists/i.test(error.message)) {
          return { ok: false, error: 'That email is taken — try signing in.' };
        }
        if (/email/i.test(error.message)) {
          return { ok: false, error: 'Enter a valid email address.' };
        }
        return { ok: false, error: 'Could not create your account — try again.' };
      }
      if (!data.session) {
        // Email confirmations are enabled in the project — the profile
        // trigger runs on signup, but there is no session until confirm.
        return { ok: false, error: 'Account created — confirm your email, then sign in.' };
      }
      const user = await profileOf(data.session.user.id);
      if (!user) return { ok: false, error: 'Account created — sign in to continue.' };
      emit();
      return { ok: true, user };
    },

    async signIn(login, password): Promise<AuthResult> {
      const c = await db();
      const { data, error } = await c.auth.signInWithPassword({
        email: login.trim(),
        password,
      });
      if (error || !data.user) {
        return { ok: false, error: 'Wrong email or password.' };
      }
      const user = await profileOf(data.user.id);
      if (!user) return { ok: false, error: 'Wrong email or password.' };
      emit();
      return { ok: true, user };
    },

    async signOut(): Promise<void> {
      const c = await db();
      await c.auth.signOut();
      emit();
    },

    async listLiveQuestions(): Promise<LiveQuestion[]> {
      const c = await db();
      const [rows, openReports, fixes] = await Promise.all([
        all<QuestionRow>(
          c.from('questions').select<QuestionRow>('*').eq('status', 'approved').order('decided_at')
        ),
        all<ReportRow>(
          c.from('reports').select<ReportRow>('question_id').eq('status', 'open')
        ),
        all<CorrectionRow>(
          c
            .from('corrections')
            .select<CorrectionRow>('*')
            .eq('status', 'approved')
            .order('decided_at', { ascending: false })
        ),
      ]);
      const names = await displayNames(rows.map((r) => r.author_id));
      const openCounts = new Map<string, number>();
      for (const r of openReports) {
        openCounts.set(r.question_id, (openCounts.get(r.question_id) ?? 0) + 1);
      }
      // Latest approved fix per target wins (rows arrive decided-desc).
      const fixByTarget = new Map<string, CorrectionRow>();
      for (const f of fixes) {
        if (!fixByTarget.has(f.question_id)) fixByTarget.set(f.question_id, f);
      }
      const official: LiveQuestion[] = CUSTOMS_DRILL_QUESTIONS.map((q) => {
        const fix = fixByTarget.get(q.id);
        return {
          question: fix ? questionFromFix(q, fix) : q,
          source: 'official',
          overridden: Boolean(fix),
          flagged: openCounts.has(q.id),
          openReportCount: openCounts.get(q.id) ?? 0,
        };
      });
      const community: LiveQuestion[] = rows.map((row) => ({
        question: draftToQuestion(draftFromRow(row), row.id),
        source: 'community',
        authorName: names.get(row.author_id),
        submissionId: row.id,
        overridden: Boolean(row.corrected_at),
        flagged: openCounts.has(row.id),
        openReportCount: openCounts.get(row.id) ?? 0,
      }));
      return [...official, ...community];
    },

    async listPendingSubmissions(): Promise<Submission[]> {
      const c = await db();
      const rows = await all<QuestionRow & { reviews: ReviewRow[] }>(
        c
          .from('questions')
          .select<QuestionRow & { reviews: ReviewRow[] }>('*,reviews(*)')
          .eq('status', 'pending')
          .order('created_at')
      );
      const names = await displayNames([
        ...rows.map((r) => r.author_id),
        ...rows.flatMap((r) => r.reviews.map((v) => v.reviewer_id)),
      ]);
      return rows.map((row) => toSubmission(row, row.reviews, names));
    },

    async listPendingCorrections(): Promise<CorrectionProposal[]> {
      const c = await db();
      const rows = await all<CorrectionRow & { correction_reviews: ReviewRow[] }>(
        c
          .from('corrections')
          .select<CorrectionRow & { correction_reviews: ReviewRow[] }>(
            '*,correction_reviews(*)'
          )
          .eq('status', 'pending')
          .order('created_at')
      );
      const names = await displayNames([
        ...rows.map((r) => r.author_id),
        ...rows.flatMap((r) => r.correction_reviews.map((v) => v.reviewer_id)),
      ]);
      return rows.map((row) => toCorrection(row, row.correction_reviews, names));
    },

    async listFlaggedItems(): Promise<FlaggedItem[]> {
      const c = await db();
      const openReports = await all<ReportRow>(
        c.from('reports').select<ReportRow>('*').eq('status', 'open').order('created_at')
      );
      if (openReports.length === 0) return [];
      const ids = [...new Set(openReports.map((r) => r.question_id))];
      const communityIds = ids.filter((id) => UUID_RE.test(id));
      const [rows, fixes, votes, pendingFixes] = await Promise.all([
        communityIds.length > 0
          ? all<QuestionRow>(c.from('questions').select<QuestionRow>('*').in('id', communityIds))
          : Promise.resolve([] as QuestionRow[]),
        all<CorrectionRow>(
          c
            .from('corrections')
            .select<CorrectionRow>('*')
            .in('question_id', ids)
            .eq('status', 'approved')
            .order('decided_at', { ascending: false })
        ),
        all<KeepVoteRow>(c.from('keep_votes').select<KeepVoteRow>('*').in('question_id', ids)),
        all<CorrectionRow & { correction_reviews: ReviewRow[] }>(
          c
            .from('corrections')
            .select<CorrectionRow & { correction_reviews: ReviewRow[] }>(
              '*,correction_reviews(*)'
            )
            .in('question_id', ids)
            .eq('status', 'pending')
        ),
      ]);
      const names = await displayNames([
        ...openReports.map((r) => r.reporter_id),
        ...rows.map((r) => r.author_id),
        ...votes.map((v) => v.user_id),
        ...pendingFixes.map((f) => f.author_id),
        ...pendingFixes.flatMap((f) => f.correction_reviews.map((v) => v.reviewer_id)),
      ]);
      const rowById = new Map(rows.map((r) => [r.id, r]));
      const fixByTarget = new Map<string, CorrectionRow>();
      for (const f of fixes) {
        if (!fixByTarget.has(f.question_id)) fixByTarget.set(f.question_id, f);
      }
      const officialById = new Map(CUSTOMS_DRILL_QUESTIONS.map((q) => [q.id, q]));
      const items: FlaggedItem[] = [];
      for (const id of ids) {
        const row = rowById.get(id);
        const builtin = officialById.get(id);
        if (!row && !builtin) continue; //approved-away target; reports resolve on next touch
        const fix = fixByTarget.get(id);
        const question = row
          ? draftToQuestion(draftFromRow(row), row.id)
          : fix
            ? questionFromFix(builtin!, fix)
            : builtin!;
        const live: LiveQuestion = row
          ? {
              question,
              source: 'community',
              authorName: names.get(row.author_id),
              submissionId: row.id,
              overridden: Boolean(row.corrected_at),
              flagged: true,
              openReportCount: openReports.filter((r) => r.question_id === id).length,
            }
          : {
              question,
              source: 'official',
              overridden: Boolean(fix),
              flagged: true,
              openReportCount: openReports.filter((r) => r.question_id === id).length,
            };
        items.push({
          questionId: id,
          live,
          reports: openReports
            .filter((r) => r.question_id === id)
            .map((r) => toReport(r, names)),
          keepVotes: votes
            .filter((v) => v.question_id === id)
            .map((v) => ({
              userId: v.user_id,
              userName: names.get(v.user_id) ?? 'Former player',
              createdAt: v.created_at,
            })),
          corrections: pendingFixes
            .filter((f) => f.question_id === id)
            .map((f) => toCorrection(f, f.correction_reviews, names)),
        });
      }
      return items;
    },

    async listMySubmissions(): Promise<Submission[]> {
      const uid = await sessionUserId();
      if (!uid) return [];
      const c = await db();
      const rows = await all<QuestionRow & { reviews: ReviewRow[] }>(
        c
          .from('questions')
          .select<QuestionRow & { reviews: ReviewRow[] }>('*,reviews(*)')
          .eq('author_id', uid)
          .order('created_at', { ascending: false })
      );
      const names = await displayNames([
        uid,
        ...rows.flatMap((r) => r.reviews.map((v) => v.reviewer_id)),
      ]);
      return rows.map((row) => toSubmission(row, row.reviews, names));
    },

    async listMyCorrections(): Promise<CorrectionProposal[]> {
      const uid = await sessionUserId();
      if (!uid) return [];
      const c = await db();
      const rows = await all<CorrectionRow & { correction_reviews: ReviewRow[] }>(
        c
          .from('corrections')
          .select<CorrectionRow & { correction_reviews: ReviewRow[] }>(
            '*,correction_reviews(*)'
          )
          .eq('author_id', uid)
          .order('created_at', { ascending: false })
      );
      const names = await displayNames([
        uid,
        ...rows.flatMap((r) => r.correction_reviews.map((v) => v.reviewer_id)),
      ]);
      return rows.map((row) => toCorrection(row, row.correction_reviews, names));
    },

    async listMyReports(): Promise<QuestionReport[]> {
      const uid = await sessionUserId();
      if (!uid) return [];
      const c = await db();
      const rows = await all<ReportRow>(
        c
          .from('reports')
          .select<ReportRow>('*')
          .eq('reporter_id', uid)
          .order('created_at', { ascending: false })
      );
      const names = await displayNames([uid]);
      return rows.map((r) => toReport(r, names));
    },

    async actionableReviewCount(): Promise<number> {
      const c = await db();
      const uid = await sessionUserId();
      const [subs, fixes, flagged] = await Promise.all([
        all<{ id: string; author_id: string }>(
          c.from('questions').select<{ id: string; author_id: string }>('id,author_id').eq('status', 'pending')
        ),
        all<{ id: string; author_id: string }>(
          c.from('corrections').select<{ id: string; author_id: string }>('id,author_id').eq('status', 'pending')
        ),
        all<{ question_id: string }>(
          c.from('reports').select<{ question_id: string }>('question_id').eq('status', 'open')
        ),
      ]);
      const flaggedIds = [...new Set(flagged.map((f) => f.question_id))];
      if (!uid) return subs.length + fixes.length + flaggedIds.length;
      const [myReviews, myFixReviews, myVotes, mine] = await Promise.all([
        all<{ question_id: string }>(
          c.from('reviews').select<{ question_id: string }>('question_id').eq('reviewer_id', uid)
        ),
        all<{ correction_id: string }>(
          c
            .from('correction_reviews')
            .select<{ correction_id: string }>('correction_id')
            .eq('reviewer_id', uid)
        ),
        all<{ question_id: string }>(
          c.from('keep_votes').select<{ question_id: string }>('question_id').eq('user_id', uid)
        ),
        all<{ id: string }>(c.from('questions').select<{ id: string }>('id').eq('author_id', uid)),
      ]);
      const reviewed = new Set(myReviews.map((r) => r.question_id));
      const fixReviewed = new Set(myFixReviews.map((r) => r.correction_id));
      const voted = new Set(myVotes.map((v) => v.question_id));
      const ownIds = new Set(mine.map((m) => m.id));
      const mySub = subs.filter((s) => s.author_id !== uid && !reviewed.has(s.id)).length;
      const myFix = fixes.filter((f) => f.author_id !== uid && !fixReviewed.has(f.id)).length;
      const myFlag = flaggedIds.filter((id) => !ownIds.has(id) && !voted.has(id)).length;
      return mySub + myFix + myFlag;
    },

    async submitQuestion(draft: QuestionDraft): Promise<IdResult> {
      const uid = await sessionUserId();
      if (!uid) return { ok: false, error: 'Sign in to submit a question.' };
      if (!isDraftValid(draft)) {
        return { ok: false, error: 'This question still has errors — fix them and resubmit.' };
      }
      const c = await db();
      const pending = await all<{ id: string }>(
        c
          .from('questions')
          .select<{ id: string }>('id')
          .eq('author_id', uid)
          .eq('status', 'pending')
          .limit(C.maxPendingSubmissions)
      );
      if (pending.length >= C.maxPendingSubmissions) {
        return {
          ok: false,
          error: `You already have ${C.maxPendingSubmissions} questions awaiting review — withdraw one or wait for decisions.`,
        };
      }
      const { data, error } = await c
        .from('questions')
        .insert({ ...draftToRow(draft), author_id: uid })
        .select<{ id: string }>()
        .single();
      if (error || !data) {
        return {
          ok: false,
          error: error
            ? pgMessage(error, 'Could not submit — try again.')
            : 'Could not submit — try again.',
        };
      }
      emit();
      return { ok: true, id: data.id };
    },

    async editSubmission(id: string, draft: QuestionDraft): Promise<ActionResult> {
      const uid = await sessionUserId();
      if (!uid) return { ok: false, error: 'Sign in to edit.' };
      if (!isDraftValid(draft)) {
        return { ok: false, error: 'The edited question still has errors.' };
      }
      const c = await db();
      const { data: row } = await c
        .from('questions')
        .select<Pick<QuestionRow, 'author_id' | 'status'>>('author_id,status')
        .eq('id', id)
        .maybeSingle();
      if (!row || row.status !== 'pending') {
        return { ok: false, error: 'Only pending submissions can be edited.' };
      }
      if (row.author_id !== uid) {
        return { ok: false, error: 'You can only edit your own submissions.' };
      }
      const { error } = (await c
        .from('questions')
        .update(draftToRow(draft))
        .eq('id', id)) as QueryResponse<unknown>;
      if (error) {
        return { ok: false, error: pgMessage(error, 'Could not save — try again.') };
      }
      emit();
      return { ok: true };
    },

    async withdrawSubmission(id: string): Promise<ActionResult> {
      return deleteOwnQuestion(id, 'pending', {
        gate: 'Sign in to withdraw.',
        status: 'Only pending submissions can be withdrawn.',
        own: 'You can only withdraw your own submissions.',
      });
    },

    async removeSubmission(id: string): Promise<ActionResult> {
      return deleteOwnQuestion(id, 'approved', {
        gate: 'Sign in to remove.',
        status: 'Only live questions can be removed from your pool.',
        own: 'You can only remove your own questions.',
      });
    },

    async reviewSubmission(
      id: string,
      decision: ReviewDecision,
      comment?: string
    ): Promise<ActionResult> {
      const uid = await sessionUserId();
      if (!uid) return { ok: false, error: 'Sign in to review.' };
      if (decision === 'reject' && (comment?.trim() ?? '').length < C.minRejectionNoteLength) {
        return { ok: false, error: 'Rejections need a short note so the author knows what to fix.' };
      }
      const c = await db();
      const { data: row } = await c
        .from('questions')
        .select<Pick<QuestionRow, 'author_id' | 'status'>>('author_id,status')
        .eq('id', id)
        .maybeSingle();
      if (!row || row.status !== 'pending') {
        return { ok: false, error: 'This submission is no longer under review.' };
      }
      if (row.author_id === uid) {
        return { ok: false, error: 'You can’t review your own submission — peers decide.' };
      }
      const { error } = (await c.from('reviews').insert({
        question_id: id,
        reviewer_id: uid,
        decision,
        comment: comment?.trim() || null,
      })) as QueryResponse<unknown>;
      if (error) {
        return {
          ok: false,
          error: pgMessage(
            error,
            'This submission is no longer under review.',
            'You already reviewed this submission.'
          ),
        };
      }
      emit();
      return { ok: true };
    },

    async proposeCorrection(
      questionId: string,
      draft: QuestionDraft,
      reason: string
    ): Promise<IdResult> {
      const uid = await sessionUserId();
      if (!uid) return { ok: false, error: 'Sign in to propose a fix.' };
      if (reason.trim().length < C.minCorrectionReasonLength) {
        return { ok: false, error: 'Explain what was wrong so reviewers know what to check.' };
      }
      if (!isDraftValid(draft)) {
        return { ok: false, error: 'The corrected question still has errors.' };
      }
      const c = await db();
      const target = await communityTarget(questionId);
      if (target === 'missing') {
        return { ok: false, error: 'That question no longer exists.' };
      }
      // NOTE: proposing on your OWN approved question is allowed (it is the
      // designed path — reports on own questions redirect here instead).
      const { data, error } = await c
        .from('corrections')
        .insert({
          question_id: questionId,
          draft: draftToRow(draft),
          reason: reason.trim(),
          author_id: uid,
        })
        .select<{ id: string }>()
        .single();
      if (error || !data) {
        // Own-question proposes are allowed (see above) — policy denials
        // here mean the target left the pool between check and insert.
        return {
          ok: false,
          error: error
            ? pgMessage(
                error,
                'That question no longer exists.',
                'You already have a pending fix for this question.'
              )
            : 'Could not propose — try again.',
        };
      }
      emit();
      return { ok: true, id: data.id };
    },

    async editCorrection(id: string, draft: QuestionDraft, reason: string): Promise<ActionResult> {
      const uid = await sessionUserId();
      if (!uid) return { ok: false, error: 'Sign in to edit.' };
      if (!isDraftValid(draft) || reason.trim().length < C.minCorrectionReasonLength) {
        return { ok: false, error: 'The edited fix still has errors.' };
      }
      const c = await db();
      const { data: row } = await c
        .from('corrections')
        .select<Pick<CorrectionRow, 'author_id' | 'status'>>('author_id,status')
        .eq('id', id)
        .maybeSingle();
      if (!row || row.status !== 'pending') {
        return { ok: false, error: 'Only pending fixes can be edited.' };
      }
      if (row.author_id !== uid) {
        return { ok: false, error: 'You can only edit your own fixes.' };
      }
      const { error } = (await c
        .from('corrections')
        .update({ draft: draftToRow(draft), reason: reason.trim() })
        .eq('id', id)) as QueryResponse<unknown>;
      if (error) {
        return { ok: false, error: pgMessage(error, 'Could not save — try again.') };
      }
      emit();
      return { ok: true };
    },

    async withdrawCorrection(id: string): Promise<ActionResult> {
      const uid = await sessionUserId();
      if (!uid) return { ok: false, error: 'Sign in to withdraw.' };
      const c = await db();
      const { data: row } = await c
        .from('corrections')
        .select<Pick<CorrectionRow, 'author_id' | 'status'>>('author_id,status')
        .eq('id', id)
        .maybeSingle();
      if (!row || row.status !== 'pending') {
        return { ok: false, error: 'Only pending fixes can be withdrawn.' };
      }
      if (row.author_id !== uid) {
        return { ok: false, error: 'You can only withdraw your own fixes.' };
      }
      const { error } = (await c.from('corrections').delete().eq('id', id)) as QueryResponse<unknown>;
      if (error) {
        return { ok: false, error: pgMessage(error, 'Could not withdraw — try again.') };
      }
      emit();
      return { ok: true };
    },

    async reviewCorrection(
      id: string,
      decision: ReviewDecision,
      comment?: string
    ): Promise<ActionResult> {
      const uid = await sessionUserId();
      if (!uid) return { ok: false, error: 'Sign in to review.' };
      if (decision === 'reject' && (comment?.trim() ?? '').length < C.minRejectionNoteLength) {
        return { ok: false, error: 'Rejections need a short note so the author knows what to fix.' };
      }
      const c = await db();
      const { data: row } = await c
        .from('corrections')
        .select<Pick<CorrectionRow, 'author_id' | 'status'>>('author_id,status')
        .eq('id', id)
        .maybeSingle();
      if (!row || row.status !== 'pending') {
        return { ok: false, error: 'This fix is no longer under review.' };
      }
      if (row.author_id === uid) {
        return { ok: false, error: 'You can’t review your own fix — peers decide.' };
      }
      const { error } = (await c.from('correction_reviews').insert({
        correction_id: id,
        reviewer_id: uid,
        decision,
        comment: comment?.trim() || null,
      })) as QueryResponse<unknown>;
      if (error) {
        return {
          ok: false,
          error: pgMessage(
            error,
            'This fix is no longer under review.',
            'You already reviewed this fix.'
          ),
        };
      }
      emit();
      return { ok: true };
    },

    async fileReport(
      questionId: string,
      reason: ReportReason,
      details?: string
    ): Promise<ActionResult> {
      const uid = await sessionUserId();
      if (!uid) return { ok: false, error: 'Sign in to report a question.' };
      if (reason === 'other' && !details?.trim()) {
        return { ok: false, error: 'Tell reviewers what the problem is so they know what to check.' };
      }
      const target = await communityTarget(questionId);
      if (target === 'missing') {
        return { ok: false, error: 'That question no longer exists.' };
      }
      if (target === 'own') {
        return {
          ok: false,
          error: 'This is your own question — propose a fix for it directly instead of reporting it.',
        };
      }
      const c = await db();
      const { error } = (await c.from('reports').insert({
        question_id: questionId,
        reporter_id: uid,
        reason,
        details: details?.trim() || null,
      })) as QueryResponse<unknown>;
      if (error) {
        return {
          ok: false,
          error: pgMessage(
            error,
            'That question no longer exists.',
            'You already reported this question — it’s in the review queue.'
          ),
        };
      }
      emit();
      return { ok: true };
    },

    async voteKeep(questionId: string): Promise<ActionResult> {
      const uid = await sessionUserId();
      if (!uid) return { ok: false, error: 'Sign in to review flagged questions.' };
      const target = await communityTarget(questionId);
      if (target === 'missing') {
        return { ok: false, error: 'That question no longer exists.' };
      }
      if (target === 'own') {
        return { ok: false, error: 'You can’t verify your own question — peers decide.' };
      }
      const c = await db();
      const open = await all<{ id: string }>(
        c.from('reports').select<{ id: string }>('id').eq('question_id', questionId).eq('status', 'open').limit(1)
      );
      if (open.length === 0) {
        return { ok: false, error: 'This question is no longer flagged.' };
      }
      const { error } = (await c.from('keep_votes').insert({
        question_id: questionId,
        user_id: uid,
      })) as QueryResponse<unknown>;
      if (error) {
        return {
          ok: false,
          error: pgMessage(
            error,
            'This question is no longer flagged.',
            'You already voted that this looks correct.'
          ),
        };
      }
      emit();
      return { ok: true };
    },

    async uploadPhoto(file: Blob): Promise<UrlResult> {
      const uid = await sessionUserId();
      if (!uid) return { ok: false, error: 'Sign in to upload a photo.' };
      let prepared: Blob;
      try {
        prepared = await preparePhoto(file);
      } catch (error) {
        return { ok: false, error: (error as Error).message };
      }
      const path = `${uid}/${crypto.randomUUID()}.jpg`;
      const c = await db();
      const { error } = await c
        .storage.from('question-images')
        .upload(path, prepared, { contentType: 'image/jpeg', upsert: false });
      if (error) {
        return { ok: false, error: 'Upload failed — check your connection and try again.' };
      }
      return { ok: true, url: c.storage.from('question-images').getPublicUrl(path).data.publicUrl };
    },

    async readElo(): Promise<EloState> {
      const uid = await sessionUserId();
      if (!uid) {
        // Guests drill on device-local ratings (same as today); signing up
        // starts a fresh server rating — a deliberate clean break.
        return (await localFallback()).readElo();
      }
      return readEloState(uid);
    },

    async answerRated(
      mapId: string,
      difficulty: QuestionDifficulty,
      correct: boolean
    ): Promise<EloResult> {
      const uid = await sessionUserId();
      if (!uid) {
        return (await localFallback()).answerRated(mapId, difficulty, correct);
      }
      const c = await db();
      const { data, error } = await c.rpc('answer_rated', {
        p_map: mapId,
        p_difficulty: difficulty,
        p_correct: correct,
      });
      if (error || !data) {
        throw new Error('Could not record your answer — check your connection.');
      }
      const result = data as {
        rating: number;
        answered: number;
        delta: number;
        bonus: number;
        winStreak: number;
      };
      // One extra round trip per answer keeps the overall exactly
      // consistent — cheap at this scale, and the math stays client-pure.
      const state = await readEloState(uid);
      return {
        state,
        mapId,
        mapRating: result.rating,
        mapAnswered: result.answered,
        delta: result.delta,
        bonus: result.bonus,
        winStreak: result.winStreak,
        overall: overallRating(state),
      };
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  // -- private helpers (closure shares emit/db) --------------------------------

  type TargetKind = 'official' | 'community' | 'own' | 'missing';

  async function communityTarget(questionId: string): Promise<TargetKind> {
    const c = await db();
    const uid = await sessionUserId();
    if (UUID_RE.test(questionId)) {
      const { data: row } = await c
        .from('questions')
        .select<Pick<QuestionRow, 'author_id' | 'status'>>('author_id,status')
        .eq('id', questionId)
        .maybeSingle();
      if (!row || row.status !== 'approved') return 'missing';
      return row.author_id === uid ? 'own' : 'community';
    }
    const { data: official } = await c
      .from('official_questions')
      .select<{ question_id: string }>('question_id')
      .eq('question_id', questionId)
      .maybeSingle();
    return official ? 'official' : 'missing';
  }

  async function deleteOwnQuestion(
    id: string,
    status: SubmissionStatus,
    messages: { gate: string; status: string; own: string }
  ): Promise<ActionResult> {
    const uid = await sessionUserId();
    if (!uid) return { ok: false, error: messages.gate };
    const c = await db();
    const { data: row } = await c
      .from('questions')
      .select<Pick<QuestionRow, 'author_id' | 'status'>>('author_id,status')
      .eq('id', id)
      .maybeSingle();
    if (!row || row.status !== status) {
      return { ok: false, error: messages.status };
    }
    if (row.author_id !== uid) {
      return { ok: false, error: messages.own };
    }
    const { error } = (await c.from('questions').delete().eq('id', id)) as QueryResponse<unknown>;
    if (error) {
      return { ok: false, error: pgMessage(error, 'Could not delete — try again.') };
    }
    emit();
    return { ok: true };
  }
}
