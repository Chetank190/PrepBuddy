import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

// Password hashes never leave the backend; every query that returns a user goes through this.
export function toPublicUser(user: Doc<"users">) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

export const register = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("lawyer"), v.literal("client")),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    if (existing) throw new Error("Email already registered");
    return await ctx.db.insert("users", args);
  },
});

// Compares the browser-computed hash on the server, so the stored hash is never sent to clients.
export const login = query({
  args: { email: v.string(), passwordHash: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    if (!user) return { status: "no_account" as const };
    if (user.passwordHash !== args.passwordHash) return { status: "wrong_password" as const };
    return { status: "ok" as const, user: toPublicUser(user) };
  },
});

export const getById = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.id);
    return user && toPublicUser(user);
  },
});

export const getAllClients = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "client"))
      .collect()
      .then((users) => users.map(toPublicUser));
  },
});
