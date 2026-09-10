'use client';

import { useState, type FormEvent } from 'react';
import { LogOut, User, Zap } from 'lucide-react';
import { useAsyncAction, useBackend, useMyWork, useSessionUser } from '@/hooks/useCommunity';
import { COMMUNITY_CONFIG as C } from '@/lib/community/config';
import {
  overallRating,
  playedMaps,
  rankForRating,
  readElo,
  totalAnswered,
} from '@/lib/community/elo';
import { mapLabel } from '@/lib/community/maps';
import { DifficultyBadge, Modal, inputClass } from './ui';

/**
 * Account dialog: sign in / create account / profile.
 * Accounts own submissions and power the one-review-per-user rules.
 */
export default function AuthDialog({ onClose }: { onClose: () => void }) {
  const { data: user, loading: userLoading } = useSessionUser();
  const { backend, kind } = useBackend();
  const { data: myWork, loading: myWorkLoading } = useMyWork();
  const { busy, run } = useAsyncAction();
  const hosted = kind === 'supabase';
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [login, setLogin] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Dialog mounts fresh on open, so this is always the current device rating
  // (rated answers sync the device copy on both backends).
  const [elo] = useState(() => readElo());
  const overall = overallRating(elo);
  const rank = rankForRating(overall.rating);
  const maps = playedMaps(elo);

  if (userLoading || (user && myWorkLoading && !myWork)) {
    return (
      <Modal label="Account" onClose={onClose}>
        <p className="text-sm text-zinc-500">Loading…</p>
      </Modal>
    );
  }

  if (user) {
    const mySubs = myWork?.submissions ?? [];
    const approved = mySubs.filter((s) => s.status === 'approved').length;
    const fixesApproved =
      myWork?.corrections.filter((c) => c.status === 'approved').length ?? 0;
    const reportsFiled = myWork?.reports.length ?? 0;
    const reviewsGiven = myWork?.reviewsGiven ?? 0;

    const handleSignOut = () => {
      if (!backend) return;
      void run(async () => {
        await backend.signOut();
        onClose();
      });
    };

    return (
      <Modal label="Your account" onClose={onClose}>
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-full bg-emerald-900 border border-emerald-700 flex items-center justify-center font-extrabold text-emerald-300 text-lg">
            {user.displayName.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="font-bold text-zinc-100 truncate">{user.displayName}</p>
            <p className="text-xs text-zinc-500">@{user.username}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4">
          {[
            { label: `Overall (${rank.label})`, value: overall.rating },
            { label: 'Rated answers', value: totalAnswered(elo) },
            { label: 'Win streak', value: elo.winStreak },
            { label: 'Maps played', value: overall.mapsPlayed },
            { label: 'Questions live', value: approved },
            { label: 'Submissions', value: mySubs.length },
            { label: 'Reviews given', value: reviewsGiven },
            { label: 'Fixes applied', value: fixesApproved },
            { label: 'Reports filed', value: reportsFiled },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-center"
            >
              <p className="text-xl font-extrabold text-zinc-100 tabular-nums">{stat.value}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-2">
            Ratings by map
          </p>
          {maps.length === 0 ? (
            <p className="text-xs text-zinc-500 leading-relaxed">
              No rated maps yet — drill to place each map separately.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {maps.map((m) => (
                <div
                  key={m.mapId}
                  className="flex items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-950/50 px-3 py-2"
                >
                  <span className="text-xs font-bold text-zinc-200">{mapLabel(m.mapId)}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-[11px] text-zinc-500 tabular-nums">
                      {m.answered} answer{m.answered === 1 ? '' : 's'}
                    </span>
                    <DifficultyBadge
                      difficulty={rankForRating(m.rating).id}
                      extra={`${m.rating}`}
                    />
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleSignOut}
          disabled={busy}
          className="mt-4 w-full py-2.5 rounded-xl font-semibold text-sm border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </Modal>
    );
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!backend) return;
    setError(null);
    void run(async () => {
      const result =
        mode === 'signin'
          ? await backend.signIn(login, password)
          : await backend.signUp(username, email, password, displayName);
      if (result.ok) {
        onClose();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <Modal label={mode === 'signin' ? 'Sign in' : 'Create account'} onClose={onClose}>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-800/60 border border-zinc-800 p-1 text-sm font-bold">
        {(['signin', 'signup'] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            aria-pressed={mode === m}
            className={`py-2 rounded-lg transition-colors ${
              mode === m ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {m === 'signin' ? 'Sign in' : 'Sign up'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
        {mode === 'signin' ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400" htmlFor="auth-login">
              {hosted ? 'Email' : 'Username'}
            </label>
            <input
              id="auth-login"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoComplete={hosted ? 'email' : 'username'}
              autoFocus
              maxLength={hosted ? 254 : C.usernameMax}
              placeholder={hosted ? 'you@example.com' : 'e.g. ratking42'}
              className={inputClass}
            />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400" htmlFor="auth-user">
                Username
              </label>
              <input
                id="auth-user"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                maxLength={C.usernameMax}
                placeholder="e.g. ratking42"
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400" htmlFor="auth-email">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                maxLength={254}
                placeholder="you@example.com"
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400" htmlFor="auth-display">
                Display name <span className="text-zinc-600 normal-case">(optional)</span>
              </label>
              <input
                id="auth-display"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={32}
                placeholder="Shown on your questions"
                className={inputClass}
              />
            </div>
          </>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400" htmlFor="auth-pass">
            Password
          </label>
          <input
            id="auth-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            maxLength={128}
            placeholder={mode === 'signin' ? 'Your password' : `Min ${C.passwordMin} characters`}
            className={inputClass}
          />
        </div>
        {error && (
          <p role="alert" className="text-xs text-red-400">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className={`w-full py-2.5 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2 ${
            busy
              ? 'bg-zinc-800 text-zinc-500 cursor-wait'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
          }`}
        >
          <User className="w-4 h-4" />
          {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <div className="mt-3 pt-3 border-t border-zinc-800">
        {!hosted && (
          <button
            onClick={() => {
              if (!backend) return;
              void run(async () => {
                await backend.signInDemo();
                onClose();
              });
            }}
            className="w-full py-2.5 rounded-xl font-semibold text-sm border border-dashed border-zinc-700 text-amber-300 hover:bg-zinc-800/60 transition-colors flex items-center justify-center gap-2"
          >
            <Zap className="w-4 h-4" /> Just exploring? Use the demo account
          </button>
        )}
        <p className="mt-2 text-[11px] text-zinc-600 leading-relaxed">
          {hosted
            ? 'Your account syncs across devices — submissions, reviews, and reports follow you.'
            : 'Accounts currently live on this device (a stand-in until hosted auth lands) — your submissions, reviews, and reports are what keep the question pool honest.'}
        </p>
      </div>
    </Modal>
  );
}
