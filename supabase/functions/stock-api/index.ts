import { createClient } from "jsr:@supabase/supabase-js@2.57.4";
import { validateSnapshot, enrich } from "./stock-core.js";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function sha256(text: string) {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));
}
async function requireSession(req: Request) {
  const token = req.headers.get("x-session-token") || "";
  if (!token) return null;
  const tokenHash = await sha256(token);
  const { data: s } = await db.from("app_sessions").select("user_id,expires_at").eq("token_hash", tokenHash).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!s) return null;
  const { data: u } = await db.from("app_users").select("id,username,display_name,role,active").eq("id", s.user_id).eq("active", true).maybeSingle();
  return u || null;
}

const canEdit = (u: any) => ["admin", "conferente"].includes(String(u?.role || "").toLowerCase());
const todayBR = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const rowKey = (r: any) => String(r?.id || `${r?.area || ""}|${r?.address || ""}|${r?.sku_code || ""}`);
const isFefoReady = (r: any) => ["Prioridade FEFO", "Aguardar lote anterior"].includes(String(r?.fefo_status || "")) && Number.isFinite(Number(r?.pallets)) && Number(r.pallets) > 0;

function diffRows(before: any[] = [], after: any[] = []) {
  const a = new Map(before.map((r) => [rowKey(r), r]));
  const b = new Map(after.map((r) => [rowKey(r), r]));
  const keys = new Set([...a.keys(), ...b.keys()]);
  const out: any[] = [];
  const fields = ["area", "address", "sku_code", "sku_name", "received_on", "expires_on", "pallets", "lock"];
  for (const k of keys) {
    const x = a.get(k), y = b.get(k);
    if (!x && y) { out.push({ id: k, type: "ADDED", after: y }); continue; }
    if (x && !y) { out.push({ id: k, type: "REMOVED", before: x }); continue; }
    const changes: any = {};
    for (const f of fields) if (JSON.stringify(x?.[f] ?? null) !== JSON.stringify(y?.[f] ?? null)) changes[f] = { before: x?.[f] ?? null, after: y?.[f] ?? null };
    if (Object.keys(changes).length) out.push({ id: k, type: "CHANGED", area: y?.area || x?.area, address: y?.address || x?.address, sku_code: y?.sku_code || x?.sku_code, changes });
  }
  return out;
}

function sortedFefoRows(rows: any[], sku: string, area: string) {
  return rows
    .filter((r: any) => r.source_sheet === "Base Ruas" && String(r.sku_code || "") === sku && r.area === area && isFefoReady(r))
    .sort((a: any, b: any) => (a.expires_on || "9999").localeCompare(b.expires_on || "9999") || (a.received_on || "9999").localeCompare(b.received_on || "9999") || String(a.address || "").localeCompare(String(b.address || ""), "pt-BR", { numeric: true }));
}

async function latestSnapshot() {
  const { data, error } = await db.from("stock_snapshots").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

async function persistSnapshot(args: {
  latest: any;
  payload: any;
  user: any;
  action: "EDIT" | "BULK_EDIT" | "IMPORT" | "CONSUME";
  changedRows: any[];
  note?: string;
}) {
  const { latest, payload, user, action, changedRows, note } = args;
  const { data, error } = await db.from("stock_snapshots").insert({
    payload,
    as_of: payload.as_of,
    source_name: String(payload.source_name || "Atualização no painel").slice(0, 200),
    created_by: user.id,
    previous_id: latest?.id || null,
  }).select("id,created_at").single();
  if (error) {
    if (error.code === "23505") throw new Error("Atualização concorrente. Recarregue a base.");
    throw error;
  }
  const compact = changedRows.slice(0, 250).map((x: any) => x.type === "CHANGED" ? x : {
    id: x.id,
    type: x.type,
    area: x.area || x.after?.area || x.before?.area,
    address: x.address || x.after?.address || x.before?.address,
    sku_code: x.sku_code || x.after?.sku_code || x.before?.sku_code,
    used: x.used,
    before_pallets: x.before_pallets,
    after_pallets: x.after_pallets,
  });
  const { error: auditError } = await db.from("stock_audit_log").insert({
    snapshot_id: data.id,
    previous_snapshot_id: latest?.id || null,
    user_id: user.id,
    action,
    changed_count: changedRows.length,
    changed_rows: compact,
    note: String(note || payload.source_name || "").slice(0, 300),
  });
  if (auditError) throw auditError;
  return data;
}


function policyPeriodCode(reviewStart: string) {
  const y = Number(String(reviewStart).slice(0, 4));
  const m = Number(String(reviewStart).slice(5, 7));
  return `${y}-H${m <= 6 ? 1 : 2}`;
}
function roundHalf(v: number) { return Math.ceil(v * 2) / 2; }
function daysUntil(date: string | null, today: string) {
  if (!date) return null;
  const a = Date.parse(today + "T00:00:00Z"), b = Date.parse(date + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}
async function policyVersionById(id: string) {
  const { data, error } = await db.from("stock_policy_versions").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}
async function policyItems(versionId: string) {
  const rows: any[] = [];
  for (let offset = 0;; offset += 1000) {
    const { data, error } = await db.from("stock_policy_items").select("*").eq("version_id", versionId).order("sku_code").range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}
async function policyMetrics(periodCode: string) {
  const { data, error } = await db.from("stock_policy_oor_metrics").select("*").eq("period_code", periodCode);
  if (error) throw error;
  return new Map((data || []).map((x: any) => [String(x.sku_code), x]));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const user = await requireSession(req);
    if (!user) return json({ error: "Sessão inválida ou expirada" }, 401);
    const body = await req.json();
    const latest = await latestSnapshot();

    if (body.action === "get") {
      const month = String(body.month || "");
      if (!/^\d{4}-\d{2}$/.test(month)) return json({ error: "Mês inválido" }, 400);
      const curves: any[] = [];
      for (let offset = 0;; offset += 1000) {
        const { data, error } = await db.from("abc_items").select("area,sku_code,curve_class,sku_name").eq("reference_month", month + "-01").in("area", ["Regulador", "Marketplace", "Câmara Fria"]).range(offset, offset + 999);
        if (error) throw error;
        curves.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      if (!latest) return json({ snapshot: null, curves });
      const today = todayBR();
      return json({ snapshot: latest, curves, ...enrich(latest.payload, curves, today) });
    }

    if (body.action === "lookup_replenishment") {
      if (!latest) return json({ snapshot: null, rows: [] });
      const area = String(body.area || "Regulador");
      if (area !== "Regulador") return json({ error: "Área inválida para reabastecimento" }, 400);
      const codes = [...new Set((Array.isArray(body.codes) ? body.codes : []).map((x: any) => String(x || "").trim()).filter((x: string) => /^\d+$/.test(x)))].slice(0, 50);
      if (!codes.length) return json({ error: "Informe ao menos um código de produto" }, 400);
      const enriched = enrich(latest.payload, [], todayBR());
      const wanted = new Set(codes);
      const rows = enriched.rows.filter((r: any) => r.source_sheet === "Base Ruas" && r.area === area && wanted.has(String(r.sku_code || ""))).map((r: any) => ({
        id: r.id,
        area: r.area,
        address: r.address,
        sku_code: r.sku_code,
        sku_name: r.sku_name,
        received_on: r.received_on,
        expires_on: r.expires_on,
        pallets: r.pallets,
        lock: r.lock,
        fefo_status: r.fefo_status,
      }));
      return json({ snapshot: { id: latest.id, as_of: latest.as_of, created_at: latest.created_at }, rows });
    }

    if (body.action === "history") {
      const limit = Math.min(200, Math.max(1, Number(body.limit || 50)));
      const { data, error } = await db.from("stock_audit_log").select("id,created_at,action,changed_count,changed_rows,note,user_id,app_users(display_name,username,role)").order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return json({ items: data || [] });
    }


    if (body.action === "policy_list") {
      const { data, error } = await db.from("stock_policy_versions").select("*").order("effective_start", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return json({ versions: data || [] });
    }

    if (body.action === "policy_get") {
      let version: any = null;
      if (body.version_id) version = await policyVersionById(String(body.version_id));
      if (!version) {
        const today = todayBR();
        const { data: current, error: currentError } = await db.from("stock_policy_versions")
          .select("*").eq("status", "approved").lte("effective_start", today).gte("effective_end", today)
          .order("effective_start", { ascending: false }).limit(1).maybeSingle();
        if (currentError) throw currentError;
        version = current;
      }
      if (!version) {
        const { data, error } = await db.from("stock_policy_versions").select("*").eq("status", "approved")
          .order("effective_start", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (error) throw error;
        version = data;
      }
      if (!version) return json({ version: null, items: [] });
      const items = (await policyItems(version.id)).map((x: any) => ({
        sku_code: String(x.sku_code || ""),
        sku_name: String(x.sku_name || ""),
        unit_code: x.unit_code || null,
        avg_daily_qty: x.avg_daily_qty == null ? null : Number(x.avg_daily_qty),
        avg_daily_hl: x.avg_daily_hl == null ? null : Number(x.avg_daily_hl),
        min_days: x.min_days == null ? null : Number(x.min_days),
        objective_days: x.objective_days == null ? null : Number(x.objective_days),
        max_days: x.max_days == null ? null : Number(x.max_days),
        base_max_days: x.base_max_days == null ? null : Number(x.base_max_days),
        min_qty: x.min_qty == null ? null : Number(x.min_qty),
        objective_qty: x.objective_qty == null ? null : Number(x.objective_qty),
        max_qty: x.max_qty == null ? null : Number(x.max_qty),
        min_hl: x.min_hl == null ? null : Number(x.min_hl),
        objective_hl: x.objective_hl == null ? null : Number(x.objective_hl),
        max_hl: x.max_hl == null ? null : Number(x.max_hl),
        pallet_floor_qty: x.pallet_floor_qty == null ? null : Number(x.pallet_floor_qty),
        policy_source: x.policy_source || null,
        out_qty: x.out_qty == null ? null : Number(x.out_qty),
        over_qty: x.over_qty == null ? null : Number(x.over_qty),
        source_file: x.source_file || null,
        suggestion_basis: x.suggestion_basis || null,
        review_note: x.review_note || null,
      }));
      return json({ version, items });
    }

    if (body.action === "policy_prepare") {
      if (String(user.role || "").toLowerCase() !== "admin") return json({ error: "Somente ADM pode preparar uma nova Política de Estoque" }, 403);
      const code = String(body.code || "").trim();
      const reviewStart = String(body.review_start || ""), reviewEnd = String(body.review_end || "");
      const effectiveStart = String(body.effective_start || ""), effectiveEnd = String(body.effective_end || "");
      if (!/^R[12]\/\d{4}$/.test(code) || !/^\d{4}-\d{2}-\d{2}$/.test(reviewStart) || !/^\d{4}-\d{2}-\d{2}$/.test(reviewEnd) || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveStart) || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveEnd)) return json({ error: "Período da revisão inválido" }, 400);
      const { data: existing } = await db.from("stock_policy_versions").select("id").eq("code", code).maybeSingle();
      if (existing) return json({ error: code + " já existe" }, 409);
      const { data: base, error: baseError } = await db.from("stock_policy_versions").select("*").eq("status", "approved").order("effective_start", { ascending: false }).limit(1).maybeSingle();
      if (baseError) throw baseError;
      if (!base) return json({ error: "Não existe Política vigente para servir de base" }, 409);
      const { data: version, error: versionError } = await db.from("stock_policy_versions").insert({
        code, review_start: reviewStart, review_end: reviewEnd, effective_start: effectiveStart, effective_end: effectiveEnd,
        status: "draft", method_version: "fixed-out-over-v2",
        notes: "Em preparação. Limites copiados da política vigente para revisão semestral com histórico de vendas.",
        created_by: user.id
      }).select("*").single();
      if (versionError) throw versionError;
      const baseItems = await policyItems(base.id);
      const inserts = baseItems.map((x: any) => ({
        version_id: version.id, sku_code: x.sku_code, sku_name: x.sku_name, unit_code: x.unit_code,
        avg_daily_qty: x.avg_daily_qty, avg_daily_hl: x.avg_daily_hl,
        min_days: x.min_days, objective_days: x.objective_days, max_days: x.max_days, base_max_days: x.base_max_days,
        min_qty: x.min_qty, objective_qty: x.objective_qty, max_qty: x.max_qty,
        min_hl: x.min_hl, objective_hl: x.objective_hl, max_hl: x.max_hl,
        pallet_floor_qty: x.pallet_floor_qty, out_qty: x.out_qty, over_qty: x.over_qty,
        policy_source: x.policy_source, suggestion_basis: x.suggestion_basis,
        source_file: x.source_file, review_note: null, updated_by: user.id
      }));
      for (let i = 0; i < inserts.length; i += 250) {
        const { error } = await db.from("stock_policy_items").insert(inserts.slice(i, i + 250));
        if (error) throw error;
      }
      await db.from("stock_policy_audit_log").insert({ version_id: version.id, action: "GENERATE", details: { code, base_version_id: base.id, items: inserts.length }, user_id: user.id });
      return json({ ok: true, version_id: version.id, code, items: inserts.length });
    }

    if (body.action === "policy_edit") {
      if (String(user.role || "").toLowerCase() !== "admin") return json({ error: "Somente ADM pode revisar a Política de Estoque" }, 403);
      const versionId = String(body.version_id || ""), sku = String(body.sku_code || "").trim();
      const version = await policyVersionById(versionId);
      if (!version || version.status !== "draft") return json({ error: "Somente a próxima política em preparação pode ser editada" }, 409);
      const outQty = Number(body.out_qty), overQty = Number(body.over_qty);
      if (!Number.isFinite(outQty) || outQty < 0) return json({ error: "OUT deve ser maior ou igual a zero" }, 400);
      if (!Number.isFinite(overQty) || overQty <= outQty) return json({ error: "OVER deve ser maior que OUT" }, 400);
      const { data: currentItem, error: itemError } = await db.from("stock_policy_items").select("*").eq("version_id", versionId).eq("sku_code", sku).maybeSingle();
      if (itemError) throw itemError;
      if (!currentItem) return json({ error: "SKU não encontrado na política" }, 404);
      const patch = {
        out_qty: outQty, over_qty: overQty,
        review_note: String(body.review_note || "").slice(0, 500),
        updated_by: user.id, updated_at: new Date().toISOString()
      };
      const { error } = await db.from("stock_policy_items").update(patch).eq("version_id", versionId).eq("sku_code", sku);
      if (error) throw error;
      await db.from("stock_policy_audit_log").insert({
        version_id: versionId, sku_code: sku, action: "EDIT",
        details: { before: { out_qty: currentItem.out_qty, over_qty: currentItem.over_qty }, after: { out_qty: outQty, over_qty: overQty }, note: patch.review_note },
        user_id: user.id
      });
      return json({ ok: true });
    }

    if (body.action === "policy_approve") {
      if (String(user.role || "").toLowerCase() !== "admin") return json({ error: "Somente ADM pode aprovar a Política de Estoque" }, 403);
      const versionId = String(body.version_id || "");
      const version = await policyVersionById(versionId);
      if (!version || version.status !== "draft") return json({ error: "A versão não está disponível para aprovação" }, 409);
      const items = await policyItems(versionId);
      if (!items.length || items.some((x: any) => x.out_qty == null || x.over_qty == null || Number(x.over_qty) <= Number(x.out_qty))) return json({ error: "Existem SKUs sem limites OUT/OVER válidos" }, 409);
      await db.from("stock_policy_versions").update({ status: "superseded", updated_at: new Date().toISOString() }).eq("status", "approved").neq("id", versionId).lte("effective_start", version.effective_end).gte("effective_end", version.effective_start);
      const { error } = await db.from("stock_policy_versions").update({ status: "approved", approved_by: user.id, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", versionId);
      if (error) throw error;
      await db.from("stock_policy_audit_log").insert({ version_id: versionId, action: "APPROVE", details: { code: version.code, effective_start: version.effective_start, effective_end: version.effective_end }, user_id: user.id });
      return json({ ok: true });
    }

    if (body.action === "oor_dashboard") {
      const { data: summaryRows, error: summaryError } = await db.from("stock_oor_daily_summary")
        .select("reference_date,out_count,over_count,ok_count,total_count,source")
        .order("reference_date", { ascending: true });
      if (summaryError) throw summaryError;
      const all = (summaryRows || []).map((r: any) => ({
        reference_date: String(r.reference_date),
        out_count: Number(r.out_count || 0),
        over_count: Number(r.over_count || 0),
        ok_count: Number(r.ok_count || 0),
        total_count: Number(r.total_count || 0),
        source: r.source || null,
      }));
      if (!all.length) return json({ reference_date: null, dates: [], daily: null, accumulated: null, monthly: [] });

      let referenceDate = String(body.reference_date || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate) || !all.some((x: any) => x.reference_date === referenceDate)) {
        referenceDate = all[all.length - 1].reference_date;
      }
      const pct = (n: number, d: number) => d > 0 ? Number((n / d).toFixed(6)) : 0;
      const decorate = (x: any) => ({
        ...x,
        out_pct: pct(Number(x.out_count || 0), Number(x.total_count || 0)),
        over_pct: pct(Number(x.over_count || 0), Number(x.total_count || 0)),
        ok_pct: pct(Number(x.ok_count || 0), Number(x.total_count || 0)),
      });
      const daily = decorate(all.find((x: any) => x.reference_date === referenceDate));
      const month = referenceDate.slice(0, 7);
      const monthDaily = all.filter((x: any) => x.reference_date.slice(0, 7) === month);

      const { data: monthlyRows, error: monthlyError } = await db.from("stock_oor_monthly_summary")
        .select("reference_month,out_count,over_count,ok_count,total_count,source")
        .order("reference_month", { ascending: true });
      if (monthlyError) throw monthlyError;
      const monthly = (monthlyRows || []).map((r: any) => decorate({
        month: String(r.reference_month).slice(0, 7),
        out_count: Number(r.out_count || 0),
        over_count: Number(r.over_count || 0),
        ok_count: Number(r.ok_count || 0),
        total_count: Number(r.total_count || 0),
        source: r.source || null,
        days: all.filter((x: any) => x.reference_date.slice(0, 7) === String(r.reference_month).slice(0, 7)).length,
      }));
      const currentMonth = monthly.find((x: any) => x.month === month);
      const accumulated = currentMonth ? {
        ...currentMonth,
        through_date: monthDaily.length ? monthDaily[monthDaily.length - 1].reference_date : referenceDate,
      } : null;

      let policy: any = null;
      const { data: policyRow, error: policyError } = await db.from("stock_policy_versions").select("*")
        .eq("status", "approved").lte("effective_start", referenceDate).gte("effective_end", referenceDate)
        .order("effective_start", { ascending: false }).limit(1).maybeSingle();
      if (policyError) throw policyError;
      policy = policyRow || null;

      return json({
        reference_date: referenceDate,
        dates: all.map((x: any) => x.reference_date).reverse(),
        daily,
        accumulated,
        monthly,
        month_daily: monthDaily.map(decorate),
        policy,
        formula: {
          daily: "COUNTIFS(status,status_escolhido,data,dia) / COUNTIFS(data,dia)",
          accumulated: "COUNTIF(status,status_escolhido) / COUNT(data) no arquivo mensal",
          monthly: "mesmo cálculo do acumulado de cada arquivo mensal"
        }
      });
    }

    if (body.action === "oor_get") {
      let referenceDate = String(body.reference_date || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) {
        const { data, error } = await db.from("stock_oor_daily").select("reference_date").order("reference_date", { ascending: false }).limit(1).maybeSingle();
        if (error) throw error;
        referenceDate = String(data?.reference_date || "");
      }
      if (!referenceDate) return json({ reference_date: null, rows: [], dates: [], counts: {} });
      const rows: any[] = [];
      for (let offset = 0;; offset += 1000) {
        const { data, error } = await db.from("stock_oor_daily").select("*").eq("reference_date", referenceDate).order("sku_code").range(offset, offset + 999);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      const { data: dateRows, error: dateError } = await db.from("stock_oor_daily").select("reference_date").order("reference_date", { ascending: false }).limit(5000);
      if (dateError) throw dateError;
      const dates = [...new Set((dateRows || []).map((x: any) => String(x.reference_date)))].slice(0, 90);
      const counts: Record<string, number> = { OUT: 0, OVER: 0, OK: 0, SEM_POLITICA: 0 };
      for (const r of rows) counts[String(r.status || "SEM_POLITICA")] = (counts[String(r.status || "SEM_POLITICA")] || 0) + 1;
      let policy: any = null;
      const versionId = rows.find((x: any) => x.policy_version_id)?.policy_version_id;
      if (versionId) policy = await policyVersionById(String(versionId));
      return json({ reference_date: referenceDate, rows, dates, counts, policy });
    }

    if (body.action === "oor_import") {
      if (!canEdit(user)) return json({ error: "Seu perfil não possui permissão para atualizar o OOR" }, 403);
      const referenceDate = String(body.reference_date || "");
      const incoming = Array.isArray(body.rows) ? body.rows : [];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) return json({ error: "Data de referência inválida" }, 400);
      if (!incoming.length || incoming.length > 5000) return json({ error: "Base OOR vazia ou acima do limite" }, 400);
      const { data: policy, error: policyError } = await db.from("stock_policy_versions").select("*").eq("status", "approved").lte("effective_start", referenceDate).gte("effective_end", referenceDate).order("effective_start", { ascending: false }).limit(1).maybeSingle();
      if (policyError) throw policyError;
      if (!policy) return json({ error: "Não existe Política de Estoque vigente para esta data" }, 409);
      const limits = new Map((await policyItems(policy.id)).map((x: any) => [String(x.sku_code), x]));
      const prepared = incoming.map((r: any) => {
        const sku = String(r.sku_code || "").trim(), qty = Number(r.available_qty);
        if (!/^\d+$/.test(sku) || !Number.isFinite(qty)) throw new Error("SKU ou quantidade inválida na base OOR");
        const lim: any = limits.get(sku);
        let status = "SEM_POLITICA";
        if (lim && lim.out_qty != null && lim.over_qty != null) {
          if (qty >= Number(lim.over_qty)) status = "OVER";
          else if (qty <= Number(lim.out_qty)) status = "OUT";
          else status = "OK";
        }
        return {
          reference_date: referenceDate, sku_code: sku, sku_name: String(r.sku_name || lim?.sku_name || ""),
          unit_code: r.unit_code || lim?.unit_code || null, available_qty: qty, status,
          out_qty: lim?.out_qty ?? null, over_qty: lim?.over_qty ?? null, policy_version_id: policy.id,
          source_file: String(body.source_file || "").slice(0, 240) || null, imported_by: user.id, imported_at: new Date().toISOString()
        };
      });
      const { error: deleteError } = await db.from("stock_oor_daily").delete().eq("reference_date", referenceDate);
      if (deleteError) throw deleteError;
      for (let i = 0; i < prepared.length; i += 500) {
        const { error } = await db.from("stock_oor_daily").insert(prepared.slice(i, i + 500));
        if (error) throw error;
      }
      const counts: Record<string, number> = {};
      for (const r of prepared) counts[r.status] = (counts[r.status] || 0) + 1;
      const summaryPayload = {
        reference_date: referenceDate,
        out_count: Number(counts.OUT || 0),
        over_count: Number(counts.OVER || 0),
        ok_count: Number(counts.OK || 0),
        total_count: prepared.length,
        source: String(body.source_file || "AGENTE_OOR").slice(0, 240),
        updated_at: new Date().toISOString()
      };
      const { error: summaryUpsertError } = await db.from("stock_oor_daily_summary").upsert(summaryPayload, { onConflict: "reference_date" });
      if (summaryUpsertError) throw summaryUpsertError;
      const monthStart = referenceDate.slice(0, 7) + "-01";
      const monthDate = new Date(monthStart + "T00:00:00Z");
      monthDate.setUTCMonth(monthDate.getUTCMonth() + 1);
      const nextMonth = monthDate.toISOString().slice(0, 10);
      const { data: monthRows, error: monthRowsError } = await db.from("stock_oor_daily_summary")
        .select("out_count,over_count,ok_count,total_count")
        .gte("reference_date", monthStart).lt("reference_date", nextMonth);
      if (monthRowsError) throw monthRowsError;
      const monthTotals = (monthRows || []).reduce((a: any, x: any) => {
        a.out_count += Number(x.out_count || 0); a.over_count += Number(x.over_count || 0);
        a.ok_count += Number(x.ok_count || 0); a.total_count += Number(x.total_count || 0); return a;
      }, { out_count: 0, over_count: 0, ok_count: 0, total_count: 0 });
      const { error: monthUpsertError } = await db.from("stock_oor_monthly_summary").upsert({
        reference_month: monthStart, ...monthTotals, source: "AGENTE_OOR", updated_at: new Date().toISOString()
      }, { onConflict: "reference_month" });
      if (monthUpsertError) throw monthUpsertError;
      return json({ ok: true, reference_date: referenceDate, rows: prepared.length, counts, policy: { id: policy.id, code: policy.code } });
    }

    if (body.action === "edit_row") {
      if (!canEdit(user)) return json({ error: "Seu perfil não possui permissão para atualizar o estoque" }, 403);
      if (!latest) return json({ error: "Nenhuma base de estoque ativa" }, 409);
      if (String(body.previous_id || "") !== String(latest.id)) return json({ error: "O estoque foi atualizado por outra pessoa. Recarregue antes de salvar." }, 409);
      const rowId = String(body.row_id || "");
      const payload = structuredClone(latest.payload);
      const target = payload.rows.find((r: any) => String(r.id) === rowId);
      if (!target) return json({ error: "Registro da Base Ruas não encontrado" }, 404);
      const patch = body.patch || {};
      const allowed = ["sku_code", "sku_name", "received_on", "expires_on", "pallets", "lock", "inventory_confirmed"];
      for (const key of allowed) if (Object.prototype.hasOwnProperty.call(patch, key)) target[key] = patch[key];
      payload.as_of = todayBR();
      payload.source_name = "Atualização no painel";
      validateSnapshot(payload);
      const changes = diffRows(latest.payload.rows || [], payload.rows || []);
      if (!changes.length) return json({ ok: true, id: latest.id, changed_count: 0 });
      const data = await persistSnapshot({ latest, payload, user, action: "EDIT", changedRows: changes, note: body.note || `Atualização ${target.address}` });
      return json({ ok: true, ...data, changed_count: changes.length });
    }

    if (body.action === "consume_plan") {
      if (!canEdit(user)) return json({ error: "Seu perfil não possui permissão para registrar consumo" }, 403);
      if (!latest) return json({ error: "Nenhuma base de estoque ativa" }, 409);
      if (String(body.previous_id || "") !== String(latest.id)) return json({ error: "O estoque foi atualizado por outra pessoa. Atualize o produto antes de consumir." }, 409);
      const sku = String(body.sku_code || "").trim();
      const area = String(body.area || "Regulador");
      const requested = Number(body.requested);
      if (!/^\d+$/.test(sku)) return json({ error: "Código de produto inválido" }, 400);
      if (area !== "Regulador") return json({ error: "Área inválida para reabastecimento" }, 400);
      if (!Number.isFinite(requested) || requested <= 0) return json({ error: "Informe a necessidade em paletes" }, 400);

      const today = todayBR();
      const current = enrich(latest.payload, [], today);
      const candidates = sortedFefoRows(current.rows, sku, area);
      const available = Number(candidates.reduce((s: number, r: any) => s + Number(r.pallets || 0), 0).toFixed(4));
      if (available + 0.000001 < requested) return json({ error: `Estoque insuficiente. Disponível: ${available} PLT`, available, requested }, 409);

      const payload = structuredClone(latest.payload);
      let remainingNeed = Number(requested.toFixed(4));
      const changed: any[] = [];
      for (const row of candidates) {
        if (remainingNeed <= 0.000001) break;
        const before = Number(row.pallets || 0);
        const used = Math.min(before, remainingNeed);
        const after = Math.max(0, Number((before - used).toFixed(4)));
        const target = payload.rows.find((r: any) => String(r.id) === String(row.id));
        if (!target) continue;
        target.pallets = after;
        target.inventory_confirmed = true;
        changed.push({ id: target.id, type: "CONSUME", area: target.area, address: target.address, sku_code: target.sku_code, used: Number(used.toFixed(4)), before_pallets: before, after_pallets: after });
        remainingNeed = Math.max(0, Number((remainingNeed - used).toFixed(4)));
      }
      if (remainingNeed > 0.000001) return json({ error: "Não foi possível montar o consumo completo. Atualize a consulta." }, 409);

      payload.as_of = today;
      payload.source_name = "Consumo consolidado via Reabastecimento";
      validateSnapshot(payload);
      const baseNote = `Consumo consolidado ${sku} · ${requested} PLT · ${changed.length} posição(ões)`;
      const note = body.note ? `${baseNote} · ${String(body.note).slice(0, 180)}` : baseNote;
      const data = await persistSnapshot({ latest, payload, user, action: "CONSUME", changedRows: changed, note });
      return json({ ok: true, ...data, sku_code: sku, used: requested, positions: changed.length, available_before: available, plan: changed.map((x: any) => ({ address: x.address, used: x.used, remaining: x.after_pallets })) });
    }

    if (body.action === "consume") {
      if (!canEdit(user)) return json({ error: "Seu perfil não possui permissão para registrar consumo" }, 403);
      if (!latest) return json({ error: "Nenhuma base de estoque ativa" }, 409);
      if (String(body.previous_id || "") !== String(latest.id)) return json({ error: "O estoque foi atualizado por outra pessoa. Recarregue antes de consumir." }, 409);
      const rowId = String(body.row_id || "");
      const used = Number(body.used);
      if (!Number.isFinite(used) || used <= 0) return json({ error: "Informe a quantidade consumida" }, 400);

      const today = todayBR();
      const enriched = enrich(latest.payload, [], today);
      const currentView = enriched.rows.find((r: any) => String(r.id) === rowId);
      if (!currentView || currentView.source_sheet !== "Base Ruas") return json({ error: "Posição da Base Ruas não encontrada" }, 404);
      if (currentView.fefo_status !== "Prioridade FEFO") return json({ error: "Este lote não é a prioridade FEFO atual. Atualize a consulta antes de consumir." }, 409);
      const currentPallets = Number(currentView.pallets);
      if (!Number.isFinite(currentPallets) || currentPallets <= 0) return json({ error: "Saldo da posição não está informado" }, 400);
      if (used > currentPallets) return json({ error: `Consumo maior que o saldo disponível (${currentPallets})` }, 400);

      const payload = structuredClone(latest.payload);
      const target = payload.rows.find((r: any) => String(r.id) === rowId);
      const remaining = Math.max(0, Number((currentPallets - used).toFixed(4)));
      target.pallets = remaining;
      target.inventory_confirmed = true;
      payload.as_of = today;
      payload.source_name = "Consumo via Reabastecimento";
      validateSnapshot(payload);
      const changed = [{ id: rowId, type: "CONSUME", area: target.area, address: target.address, sku_code: target.sku_code, used, before_pallets: currentPallets, after_pallets: remaining }];
      const data = await persistSnapshot({ latest, payload, user, action: "CONSUME", changedRows: changed, note: body.note || `Consumo ${target.sku_code} · ${target.address}` });
      return json({ ok: true, ...data, remaining, used, address: target.address, sku_code: target.sku_code });
    }

    if (body.action === "save") {
      if (!canEdit(user)) return json({ error: "Seu perfil não possui permissão para atualizar o estoque" }, 403);
      if (String(body.previous_id || "") !== String(latest?.id || "")) return json({ error: "O estoque foi atualizado por outra pessoa. Recarregue antes de salvar." }, 409);
      const payload = validateSnapshot(body.payload);
      if (JSON.stringify(payload).length > 5000000) return json({ error: "Base excede o limite de tamanho" }, 400);
      if (!payload.maps || !payload.targets) return json({ error: "Configuração dos layouts ausente" }, 400);
      const changes = diffRows(latest?.payload?.rows || [], payload.rows || []);
      const action = String(body.change_type || "").toUpperCase() === "IMPORT" ? "IMPORT" : changes.length > 1 ? "BULK_EDIT" : "EDIT";
      const data = await persistSnapshot({ latest, payload, user, action: action as any, changedRows: changes, note: body.note || payload.source_name || "" });
      return json({ ok: true, ...data, changed_count: changes.length });
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Erro ao processar estoque" }, 400);
  }
});