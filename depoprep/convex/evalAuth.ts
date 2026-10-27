// The app has no server-side sessions, so the evals dashboard is gated by a shared secret
// instead of a user role. Set it with `npx convex env set EVAL_ADMIN_KEY <secret>`.
// With no key set, evals stay locked (fail closed).
export function isEvalAdmin(adminKey: string | undefined): boolean {
  const expected = process.env.EVAL_ADMIN_KEY;
  return !!expected && adminKey === expected;
}
