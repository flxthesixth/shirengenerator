"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "./supabase/client";

const OWNER_EMAIL = "flxthe6th@gmail.com";

export type AccessState = {
  loading: boolean;
  hasAccess: boolean;
  isOwner: boolean;
  plan: "trial" | "pro" | null;
  expiresAt: string | null;
  usedGenerations: number;
  maxGenerations: number; // 0 = unlimited
};

const EMPTY: AccessState = {
  loading: true,
  hasAccess: false,
  isOwner: false,
  plan: null,
  expiresAt: null,
  usedGenerations: 0,
  maxGenerations: 0,
};

function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  return crypto.subtle.digest("SHA-256", data).then((buf) =>
    Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

export function normalizeToken(raw: string): string {
  return raw.trim().replace(/\s+/g, "");
}

export function useAccess(userEmail: string | null | undefined) {
  const [state, setState] = useState<AccessState>(EMPTY);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) return;
    const { data, error } = await supabase.rpc("access_status");
    if (error || !data || data.length === 0) {
      setState((s) => ({ ...s, loading: false, hasAccess: false, plan: null }));
      return;
    }
    const row = data[0];
    setState({
      loading: false,
      hasAccess: true,
      isOwner: (userEmail ?? "").toLowerCase() === OWNER_EMAIL,
      plan: row.plan,
      expiresAt: row.expires_at,
      usedGenerations: row.used_generations ?? 0,
      maxGenerations: row.max_generations ?? 0,
    });
  }, [userEmail]);

  useEffect(() => {
    if (!userEmail) {
      setState(EMPTY);
      return;
    }
    setState({ ...EMPTY, isOwner: userEmail.toLowerCase() === OWNER_EMAIL });
    void refresh();
  }, [userEmail, refresh]);

  const activate = useCallback(
    async (rawToken: string): Promise<{ ok: boolean; error?: string }> => {
      const supabase = createClient();
      if (!supabase) return { ok: false, error: "Client tidak siap." };
      const token = normalizeToken(rawToken);
      if (token.length < 16) return { ok: false, error: "Format token tidak valid." };
      const tokenHash = await sha256Hex(token);
      const { data, error } = await supabase.rpc("activate_access_token", {
        p_token_hash: tokenHash,
      });
      if (error) {
        const msg = error.message || "";
        if (msg.includes("TOKEN_INVALID")) return { ok: false, error: "Token tidak dikenal atau sudah dicabut." };
        return { ok: false, error: "Gagal aktivasi token." };
      }
      const row = data?.[0];
      setState({
        loading: false,
        hasAccess: true,
        isOwner: (userEmail ?? "").toLowerCase() === OWNER_EMAIL,
        plan: row?.plan ?? null,
        expiresAt: row?.expires_at ?? null,
        usedGenerations: row?.used_generations ?? 0,
        maxGenerations: row?.max_generations ?? 0,
      });
      return { ok: true };
    },
    [userEmail]
  );

  const consume = useCallback(
    async (count: number): Promise<{ ok: boolean; error?: string }> => {
      const supabase = createClient();
      if (!supabase) return { ok: false, error: "Client tidak siap." };
      const { data, error } = await supabase.rpc("consume_generations", { p_count: count });
      if (error) {
        const msg = error.message || "";
        if (msg.includes("GENERATION_LIMIT_REACHED"))
          return { ok: false, error: "Limit generate habis untuk token ini." };
        if (msg.includes("ACCESS_REQUIRED"))
          return { ok: false, error: "Akses tidak aktif. Masukkan token." };
        return { ok: false, error: "Gagal mencatat generate." };
      }
      const row = data?.[0];
      setState((s) => ({
        ...s,
        hasAccess: true,
        plan: row?.plan ?? s.plan,
        expiresAt: row?.expires_at ?? s.expiresAt,
        usedGenerations: row?.used_generations ?? s.usedGenerations,
        maxGenerations: row?.max_generations ?? s.maxGenerations,
      }));
      return { ok: true };
    },
    []
  );

  const createToken = useCallback(
    async (plan: "trial" | "pro"): Promise<{ ok: boolean; token?: string; error?: string }> => {
      const supabase = createClient();
      if (!supabase) return { ok: false, error: "Client tidak siap." };
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      const token =
        plan === "trial" ? "TRIAL-" : "PRO-";
      const body = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 32);
      const full = `${token}${body.toUpperCase()}`;
      const tokenHash = await sha256Hex(full);
      const { error } = await supabase.rpc("create_access_token", {
        p_token_hash: tokenHash,
        p_plan: plan,
      });
      if (error) {
        const msg = error.message || "";
        if (msg.includes("OWNER_ONLY")) return { ok: false, error: "Hanya owner yang bisa membuat token." };
        return { ok: false, error: "Gagal membuat token." };
      }
      return { ok: true, token: full };
    },
    []
  );

  return { ...state, refresh, activate, consume, createToken };
}
