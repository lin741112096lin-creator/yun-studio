import express from "express";
import path from "path";
import fs from "fs";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { EditMode, GoogleGenAI, GenerateVideosOperation, PersonGeneration, RawReferenceImage } from "@google/genai";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: ".env.local", override: true });

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const supabase: SupabaseClient | null = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;
const isPersistentAuthEnabled = Boolean(supabase);
const STARS_ENABLED = process.env.STARS_ENABLED === "true";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4173;
const VIDEO_CREATE_TIMEOUT_MS = 120_000;
const VIDEO_STATUS_REQUEST_TIMEOUT_MS = 15_000;
const VIDEO_STATUS_LOOKUP_DEADLINE_MS = 30_000;
const IMAGE_GENERATION_TIMEOUT_MS = 120_000;

type AuthRole = "admin" | "user";

interface StoredAuthUser {
  id: string;
  username: string;
  passwordHash: string;
  role: AuthRole;
  active: boolean;
  createdAt: number;
}

interface AuthSession {
  userId: string;
  expiresAt: number;
}

function toStoredAuthUser(row: any): StoredAuthUser {
  return {
    id: String(row.id),
    username: String(row.username),
    passwordHash: String(row.password_hash),
    role: row.role === "admin" ? "admin" : "user",
    active: Boolean(row.active),
    createdAt: new Date(row.created_at || Date.now()).getTime(),
  };
}

function sessionTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function persistentFindUserByUsername(username: string) {
  if (!supabase) return undefined;
  const { data, error } = await supabase.from("app_users").select("*").eq("username", username).maybeSingle();
  if (error) throw error;
  return data ? toStoredAuthUser(data) : undefined;
}

async function persistentFindUserById(id: string) {
  if (!supabase) return undefined;
  const { data, error } = await supabase.from("app_users").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toStoredAuthUser(data) : undefined;
}

async function persistentListUsers() {
  if (!supabase) return [] as StoredAuthUser[];
  const { data, error } = await supabase.from("app_users").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map(toStoredAuthUser);
}

async function persistentSaveUser(user: StoredAuthUser) {
  if (!supabase) return;
  const { error } = await supabase.from("app_users").upsert({
    id: user.id,
    username: user.username,
    password_hash: user.passwordHash,
    role: user.role,
    active: user.active,
    created_at: new Date(user.createdAt).toISOString(),
  });
  if (error) throw error;
}

async function persistentDeleteSessionsForUser(userId: string) {
  if (!supabase) return;
  const { error } = await supabase.from("auth_sessions").delete().eq("user_id", userId);
  if (error) throw error;
}

async function persistentCreateSession(token: string, userId: string, expiresAt: number) {
  if (!supabase) return;
  const { error } = await supabase.from("auth_sessions").insert({
    token_hash: sessionTokenHash(token),
    user_id: userId,
    expires_at: new Date(expiresAt).toISOString(),
  });
  if (error) throw error;
}

async function persistentDeleteSession(token: string) {
  if (!supabase) return;
  const { error } = await supabase.from("auth_sessions").delete().eq("token_hash", sessionTokenHash(token));
  if (error) throw error;
}

async function persistentGetUserForToken(token: string) {
  if (!supabase) return undefined;
  const { data, error } = await supabase
    .from("auth_sessions")
    .select("user_id, expires_at")
    .eq("token_hash", sessionTokenHash(token))
    .maybeSingle();
  if (error) throw error;
  if (!data) return undefined;
  if (new Date(data.expires_at).getTime() <= Date.now()) {
    await persistentDeleteSession(token);
    return undefined;
  }
  return persistentFindUserById(String(data.user_id));
}

async function persistentGetWalletBalance(userId: string) {
  if (!supabase) return 0;
  const { data, error } = await supabase.from("wallets").select("balance").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return Math.max(0, Number(data?.balance || 0));
}

async function persistentAdjustStars(userId: string, amount: number, reason: string, actorId: string) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("adjust_wallet", {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
    p_actor_id: actorId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { balance: Number(row.balance), updatedAt: new Date(row.updated_at || Date.now()).getTime() } : null;
}

async function persistentGetUsage(userId: string) {
  if (!supabase) return { image: 0, video: 0, chat: 0, total: 0, updatedAt: Date.now() };
  const { data, error } = await supabase.from("usage_summary").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return {
    image: Number(data?.image_count || 0),
    video: Number(data?.video_count || 0),
    chat: Number(data?.chat_count || 0),
    total: Number(data?.total_count || 0),
    updatedAt: new Date(data?.updated_at || Date.now()).getTime(),
  };
}

const AUTH_DIR = path.join(process.cwd(), ".auth");
const AUTH_USERS_FILE = path.join(AUTH_DIR, "users.json");
const AUTH_USAGE_FILE = path.join(AUTH_DIR, "usage.json");
const AUTH_USAGE_LOG_FILE = path.join(AUTH_DIR, "usage-log.json");
const AUTH_WALLETS_FILE = path.join(AUTH_DIR, "wallets.json");
const AUTH_LEDGER_FILE = path.join(AUTH_DIR, "star-ledger.json");
const AUTH_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const authSessions = new Map<string, AuthSession>();

function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyPassword(password: string, storedHash: string) {
  const [salt, expectedHex] = storedHash.split(":");
  if (!salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function readAuthUsers(): StoredAuthUser[] {
  try {
    if (!fs.existsSync(AUTH_USERS_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(AUTH_USERS_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAuthUsers(users: StoredAuthUser[]) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(AUTH_USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

type StarKind = "image" | "video" | "chat";
interface StarWallet { balance: number; updatedAt: number }
interface StarLedgerEntry { id: string; userId: string; amount: number; balance: number; reason: string; actorId: string; createdAt: number }
type WalletStore = Record<string, StarWallet>;

const STAR_COSTS: Record<StarKind, number> = { chat: 1, image: 5, video: 20 };

function readWallets(): WalletStore {
  try {
    if (!fs.existsSync(AUTH_WALLETS_FILE)) return {};
    const parsed = JSON.parse(fs.readFileSync(AUTH_WALLETS_FILE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeWallets(wallets: WalletStore) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(AUTH_WALLETS_FILE, JSON.stringify(wallets, null, 2), "utf8");
}

function readStarLedger(): StarLedgerEntry[] {
  try {
    if (!fs.existsSync(AUTH_LEDGER_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(AUTH_LEDGER_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStarLedger(entries: StarLedgerEntry[]) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(AUTH_LEDGER_FILE, JSON.stringify(entries.slice(-5000), null, 2), "utf8");
}

async function getStarBalance(userId: string) {
  if (isPersistentAuthEnabled) return persistentGetWalletBalance(userId);
  return Math.max(0, Number(readWallets()[userId]?.balance || 0));
}

async function adjustStars(userId: string, amount: number, reason: string, actorId: string) {
  if (isPersistentAuthEnabled) return persistentAdjustStars(userId, amount, reason, actorId);
  const wallets = readWallets();
  const current = wallets[userId] || { balance: 0, updatedAt: Date.now() };
  const nextBalance = current.balance + amount;
  if (nextBalance < 0) return null;
  const nextWallet = { balance: nextBalance, updatedAt: Date.now() };
  wallets[userId] = nextWallet;
  writeWallets(wallets);

  const ledger = readStarLedger();
  ledger.push({
    id: `star_${Date.now()}_${randomBytes(4).toString("hex")}`,
    userId,
    amount,
    balance: nextBalance,
    reason,
    actorId,
    createdAt: Date.now(),
  });
  writeStarLedger(ledger);
  return nextWallet;
}

async function reserveStars(req: express.Request, res: express.Response, kind: StarKind) {
  if (!STARS_ENABLED) return true;
  const user = (req as express.Request & { authUser?: StoredAuthUser }).authUser;
  if (!user || user.role === "admin") return true;
  const amount = STAR_COSTS[kind];
  const balance = await getStarBalance(user.id);
  if (balance < amount) {
    res.status(402).json({ error: `星币余额不足，本次需要 ${amount} 星币，当前余额 ${balance} 星币`, requiredStars: amount, balance });
    return false;
  }

  const wallet = await adjustStars(user.id, -amount, `${kind} generation`, user.id);
  if (!wallet) {
    res.status(402).json({ error: "星币余额不足", requiredStars: amount, balance });
    return false;
  }
  res.once("finish", () => {
    if (res.statusCode >= 400) {
      void adjustStars(user.id, amount, `${kind} generation refund`, user.id).catch((error) => {
        console.error("Failed to refund stars:", error);
      });
    }
  });
  return true;
}

type UsageKind = "image" | "video" | "chat";
type UsageRecord = Record<string, { image: number; video: number; chat: number; total: number; updatedAt: number }>;

interface UsageLogEntry {
  id: string;
  userId: string;
  username: string;
  kind: UsageKind;
  provider?: string;
  model?: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  stars: number;
  status: "requested";
  createdAt: number;
}

type UsageLogDetails = Omit<Partial<UsageLogEntry>, "id" | "userId" | "username" | "kind" | "stars" | "status" | "createdAt">;

function readUsage(): UsageRecord {
  try {
    if (!fs.existsSync(AUTH_USAGE_FILE)) return {};
    const parsed = JSON.parse(fs.readFileSync(AUTH_USAGE_FILE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readUsageLogs(): UsageLogEntry[] {
  try {
    if (!fs.existsSync(AUTH_USAGE_LOG_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(AUTH_USAGE_LOG_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeUsageLogs(logs: UsageLogEntry[]) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(AUTH_USAGE_LOG_FILE, JSON.stringify(logs.slice(-10000), null, 2), "utf8");
}

async function persistentRecordUsage(user: StoredAuthUser, kind: UsageKind, details: UsageLogDetails = {}) {
  if (!supabase) return;
  const current = await persistentGetUsage(user.id);
  const next = {
    user_id: user.id,
    image_count: current.image + (kind === "image" ? 1 : 0),
    video_count: current.video + (kind === "video" ? 1 : 0),
    chat_count: current.chat + (kind === "chat" ? 1 : 0),
    total_count: current.total + 1,
    updated_at: new Date().toISOString(),
  };
  const { error: summaryError } = await supabase.from("usage_summary").upsert(next);
  if (summaryError) throw summaryError;

  const { error: logError } = await supabase.from("usage_logs").insert({
    id: `usage_${Date.now()}_${randomBytes(4).toString("hex")}`,
    user_id: user.id,
    username: user.username,
    kind,
    provider: details.provider,
    model: details.model,
    aspect_ratio: details.aspectRatio,
    resolution: details.resolution,
    duration: details.duration,
    stars: STARS_ENABLED && user.role !== "admin" ? STAR_COSTS[kind] : 0,
    status: "requested",
    created_at: new Date().toISOString(),
  });
  if (logError) throw logError;
}

async function persistentListUsageLogs(username: string, kind: string, limit: number) {
  if (!supabase) return [] as UsageLogEntry[];
  let query = supabase.from("usage_logs").select("*").order("created_at", { ascending: false }).limit(limit);
  if (username) query = query.ilike("username", `%${username}%`);
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((entry: any): UsageLogEntry => ({
    id: String(entry.id),
    userId: String(entry.user_id),
    username: String(entry.username),
    kind: entry.kind,
    provider: entry.provider || undefined,
    model: entry.model || undefined,
    aspectRatio: entry.aspect_ratio || undefined,
    resolution: entry.resolution || undefined,
    duration: entry.duration == null ? undefined : Number(entry.duration),
    stars: Number(entry.stars || 0),
    status: "requested",
    createdAt: new Date(entry.created_at || Date.now()).getTime(),
  }));
}

async function recordUsage(req: express.Request, kind: UsageKind, details: UsageLogDetails = {}) {
  const user = (req as express.Request & { authUser?: StoredAuthUser }).authUser;
  if (!user) return;
  if (isPersistentAuthEnabled) {
    await persistentRecordUsage(user, kind, details);
    return;
  }
  const usage = readUsage();
  const current = usage[user.id] || { image: 0, video: 0, chat: 0, total: 0, updatedAt: Date.now() };
  current[kind] += 1;
  current.total += 1;
  current.updatedAt = Date.now();
  usage[user.id] = current;
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(AUTH_USAGE_FILE, JSON.stringify(usage, null, 2), "utf8");

  const createdAt = Date.now();
  const logs = readUsageLogs();
  logs.push({
    id: `usage_${createdAt}_${randomBytes(4).toString("hex")}`,
    userId: user.id,
    username: user.username,
    kind,
    ...details,
    stars: STARS_ENABLED && user.role !== "admin" ? STAR_COSTS[kind] : 0,
    status: "requested",
    createdAt,
  });
  writeUsageLogs(logs);
}

function ensureInitialAdmin() {
  const users = readAuthUsers();
  if (users.some((user) => user.role === "admin")) return users;

  const adminUsername = String(process.env.AUTH_ADMIN_USERNAME || "").trim();
  const adminPassword = String(process.env.AUTH_ADMIN_PASSWORD || "");
  if (!adminUsername || !adminPassword) {
    throw new Error("AUTH_ADMIN_USERNAME and AUTH_ADMIN_PASSWORD are required when creating the first admin account.");
  }
  const admin: StoredAuthUser = {
    id: "admin",
    username: adminUsername,
    passwordHash: hashPassword(adminPassword),
    role: "admin",
    active: true,
    createdAt: Date.now(),
  };
  users.push(admin);
  writeAuthUsers(users);
  return users;
}

async function initializePersistentAuth() {
  if (!supabase) return;
  const { count, error: countError } = await supabase.from("app_users").select("id", { count: "exact", head: true });
  if (countError) throw countError;
  if ((count || 0) > 0) return;

  const users = ensureInitialAdmin();
  const { error: usersError } = await supabase.from("app_users").insert(users.map((user) => ({
    id: user.id,
    username: user.username,
    password_hash: user.passwordHash,
    role: user.role,
    active: user.active,
    created_at: new Date(user.createdAt).toISOString(),
  })));
  if (usersError) throw usersError;

  const wallets = readWallets();
  const walletRows = Object.entries(wallets).map(([userId, wallet]) => ({
    user_id: userId,
    balance: Math.max(0, Number(wallet.balance || 0)),
    updated_at: new Date(wallet.updatedAt || Date.now()).toISOString(),
  }));
  if (walletRows.length) {
    const { error } = await supabase.from("wallets").upsert(walletRows);
    if (error) throw error;
  }

  const ledgerRows = readStarLedger().map((entry) => ({
    id: entry.id,
    user_id: entry.userId,
    amount: entry.amount,
    balance_after: entry.balance,
    reason: entry.reason,
    actor_id: entry.actorId,
    created_at: new Date(entry.createdAt).toISOString(),
  }));
  if (ledgerRows.length) {
    const { error } = await supabase.from("star_ledger").upsert(ledgerRows);
    if (error) throw error;
  }

  const usage = readUsage();
  const usageRows = Object.entries(usage).map(([userId, value]) => ({
    user_id: userId,
    image_count: value.image,
    video_count: value.video,
    chat_count: value.chat,
    total_count: value.total,
    updated_at: new Date(value.updatedAt || Date.now()).toISOString(),
  }));
  if (usageRows.length) {
    const { error } = await supabase.from("usage_summary").upsert(usageRows);
    if (error) throw error;
  }

  const usageRowsFromFile = readUsageLogs().map((entry) => ({
    id: entry.id,
    user_id: entry.userId,
    username: entry.username,
    kind: entry.kind,
    provider: entry.provider,
    model: entry.model,
    aspect_ratio: entry.aspectRatio,
    resolution: entry.resolution,
    duration: entry.duration,
    stars: entry.stars,
    status: entry.status,
    created_at: new Date(entry.createdAt).toISOString(),
  }));
  if (usageRowsFromFile.length) {
    const { error } = await supabase.from("usage_logs").upsert(usageRowsFromFile);
    if (error) throw error;
  }

  console.log(`Migrated ${users.length} auth users from local storage to Supabase.`);
}

function publicAuthUser(user: StoredAuthUser) {
  return { id: user.id, username: user.username, role: user.role, active: user.active, createdAt: user.createdAt };
}

async function getAuthUser(req: express.Request): Promise<StoredAuthUser | undefined> {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (isPersistentAuthEnabled) {
    if (!token) return undefined;
    return persistentGetUserForToken(token);
  }
  const session = token ? authSessions.get(token) : undefined;
  if (!session || session.expiresAt <= Date.now()) {
    if (token) authSessions.delete(token);
    return undefined;
  }
  const user = ensureInitialAdmin().find((item) => item.id === session.userId && item.active);
  return user;
}

async function requireAuth(req: express.Request, res: express.Response, role?: AuthRole) {
  const user = await getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: "请先登录" });
    return undefined;
  }
  if (role && user.role !== role) {
    res.status(403).json({ error: "没有管理员权限" });
    return undefined;
  }
  return user;
}

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Allow the GitHub Pages frontend to call this separately hosted API server.
const frontendOrigin = process.env.FRONTEND_ORIGIN;
app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;
  if (!frontendOrigin || requestOrigin === frontendOrigin) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin || "*");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// Helper to instantiate GoogleGenAI lazily
function getGenAIClient(apiKey?: string) {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    return null;
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 45000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error: any) {
    if (controller.signal.aborted) {
      throw new Error(`上游接口响应超时（${Math.round(timeoutMs / 1000)} 秒），请检查接口地址或服务状态`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

const PRODUCT_IDENTITY_RULES =
  "产品一致性硬性规则：参考图中的原产品是画面核心主体，但允许加入人物、模特、手部或消费者作为辅助主体，用于穿着、手持、操作和展示产品。不得改变产品类别、主体外形轮廓、比例结构、颜色色调、材质纹理、图案文字、Logo、包装和关键细节；不得替换、重绘、添加或删除产品部件；人物不能遮挡产品关键细节。服装类商品必须保留原图的版型、裙摆或衣摆轮廓、长度、褶皱、缝线、格纹或印花的大小与排列、面料质感和边缘细节，不得借加入人物之机重新设计服装。只能增加真实合理的使用场景、人物互动、光线和镜头运动。若场景与产品外观冲突，优先保持产品原样。";

const IMAGE_REFERENCE_LOCK_RULES =
  "参考图是产品外观的唯一真实来源。请以参考图中的产品为底图进行保守编辑，只改变背景、人物姿势、环境和光线；不要重新设计或重新绘制产品。对于裙子等服装，原图中的裙摆轮廓、长度、褶皱、格纹/印花、缝线、面料纹理和边缘必须逐项保持一致。人物只作为辅助主体，人物的身体、手臂或桌面不得遮挡产品关键细节；如果无法同时加入人物并保持产品细节，优先保留原产品，不要生成变体。";

const VIDEO_CONTINUITY_RULES =
  "视频时间轴与连续性硬性规则：必须使用分段结构（0-3秒）、（3-6秒）、（6-9秒）、（9-12秒）；如果视频总时长不足，按实际时长压缩时间段。每个时间段必须保持同一个人物的脸部、发型、肤色、体型、服装和配饰一致；保持同一个产品的主体、颜色、纹理、材质、结构、Logo、包装和比例一致；人物的嘴型、口型和说话状态要连续自然，不能出现嘴部变形、随机换脸或口型跳变；保持手指、四肢、人物与产品的相对位置连续，避免突然增加人物、产品或部件。";

// Helper function to check if a URL is a valid video URL (excluding images, endpoints & schemas)
function isValidVideoUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== "string") return false;
  const trimmed = urlStr.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://") && !trimmed.startsWith("data:video/")) {
    return false;
  }

  const lower = trimmed.toLowerCase();
  if (
    lower.includes("schema.org") ||
    lower.includes("w3.org") ||
    lower.includes("docs.") ||
    lower.includes("swagger") ||
    lower.includes("github.com")
  ) {
    return false;
  }

  // Filter out API route/status endpoints which are not actual video files
  const cleanPath = lower.split("?")[0].split("#")[0];
  const isDirectVideoExt =
    cleanPath.endsWith(".mp4") ||
    cleanPath.endsWith(".webm") ||
    cleanPath.endsWith(".mov") ||
    cleanPath.endsWith(".m3u8") ||
    trimmed.startsWith("data:video/");

  if (!isDirectVideoExt) {
    if (
      cleanPath.includes("/status") ||
      cleanPath.includes("/query") ||
      cleanPath.includes("/generate") ||
      cleanPath.includes("/tasks") ||
      cleanPath.includes("/jobs") ||
      cleanPath.includes("/callback") ||
      cleanPath.includes("/detail")
    ) {
      return false;
    }
  }

  // Filter out pure static image extensions
  const pureImageExts = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".bmp", ".ico"];
  if (pureImageExts.some((ext) => cleanPath.endsWith(ext))) {
    return false;
  }

  // Filter out pure image indicator paths unless direct video extensions exist
  if (
    cleanPath.includes("cover") ||
    cleanPath.includes("thumbnail") ||
    cleanPath.includes("avatar") ||
    cleanPath.includes("poster") ||
    cleanPath.includes("preview") ||
    cleanPath.includes("icon")
  ) {
    if (!isDirectVideoExt) {
      return false;
    }
  }

  return true;
}

// Helper function to thoroughly extract video URL from various JSON response formats
function extractVideoUrl(data: any): string | undefined {
  if (!data) return undefined;

  if (typeof data === "string") {
    const trimmed = data.trim();
    if (isValidVideoUrl(trimmed)) return trimmed;
    try {
      const parsed = JSON.parse(trimmed);
      const parsedUrl = extractVideoUrl(parsed);
      if (parsedUrl) return parsedUrl;
    } catch {
      // Chat-style providers may return a JSON object or a URL inside message text.
    }
    const embeddedUrl = trimmed.match(/https?:\/\/[^\s"'<>]+/i)?.[0]?.replace(/[),.;]+$/, "");
    return embeddedUrl && isValidVideoUrl(embeddedUrl) ? embeddedUrl : undefined;
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      const url = extractVideoUrl(item);
      if (url) return url;
    }
    return undefined;
  }

  if (typeof data === "object") {
    // 1. Direct check of common video field names
    const preferredKeys = [
      "video_url",
      "videoUrl",
      "video_uri",
      "videoUri",
      "mp4_url",
      "mp4",
      "media_url",
      "mediaUrl",
      "file_url",
      "fileUrl",
      "output_url",
      "outputUrl",
      "download_url",
      "downloadUrl",
      "result_url",
      "resultUrl",
      "cdn_url",
      "play_url",
      "src",
    ];

    for (const key of preferredKeys) {
      const val = data[key];
      if (typeof val === "string" && isValidVideoUrl(val)) {
        return val.trim();
      }
    }

    // 2. Scan preferred nested objects first
    const preferredObjKeys = ["data", "result", "output", "response", "video", "videos", "media", "task_result", "choices", "message", "content"];
    for (const key of preferredObjKeys) {
      if (data[key] && typeof data[key] === "object") {
        const found = extractVideoUrl(data[key]);
        if (found) return found;
      }
    }

    // 3. Only scan string properties if they strictly end with video extensions or data URLs
    for (const key of Object.keys(data)) {
      if (preferredObjKeys.includes(key) || preferredKeys.includes(key)) continue;
      // Skip API config keys that might be present in debug responses
      if (key.includes("apiUrl") || key.includes("targetUrl") || key.includes("endpoint") || key.includes("statusUrl")) continue;

      const val = data[key];
      if (typeof val === "object" && val !== null) {
        const found = extractVideoUrl(val);
        if (found) return found;
      } else if (typeof val === "string") {
        const lowerVal = val.trim().toLowerCase();
        if (
          lowerVal.endsWith(".mp4") ||
          lowerVal.endsWith(".webm") ||
          lowerVal.endsWith(".mov") ||
          lowerVal.endsWith(".m3u8") ||
          lowerVal.startsWith("data:video/")
        ) {
          if (isValidVideoUrl(val)) return val.trim();
        }
      }
    }
  }

  return undefined;
}

function normalizeImageResult(value: any): string | undefined {
  if (typeof value === "string") {
    const text = value.trim().replace(/^['"]|['"]$/g, "");
    if (!text) return undefined;
    if (text.startsWith("data:image/")) return text;
    if (/^(https?:|\/)/i.test(text)) return text;
    if (/^[A-Za-z0-9+/=\s]+$/.test(text) && text.length > 128) {
      return `data:image/png;base64,${text.replace(/\s+/g, "")}`;
    }
    try {
      return normalizeImageResult(JSON.parse(text));
    } catch {
      return undefined;
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = normalizeImageResult(item);
      if (result) return result;
    }
    return undefined;
  }

  if (value && typeof value === "object") {
    for (const key of ["imageUrl", "image_url", "url", "b64_json", "base64", "data", "result", "output", "images", "image", "choices", "message", "content"]) {
      const result = normalizeImageResult(value[key]);
      if (result) return result;
    }
  }

  return undefined;
}

// Helper to extract Task/Operation ID from API response
function extractTaskId(data: any): string | undefined {
  if (typeof data === "string") {
    try {
      return extractTaskId(JSON.parse(data));
    } catch {
      return undefined;
    }
  }
  if (!data || typeof data !== "object") return undefined;

  const keys = [
    "id",
    "task_id",
    "taskId",
    "operation",
    "operation_id",
    "operationId",
    "operationName",
    "job_id",
    "jobId",
    "request_id",
    "requestId",
    "uuid",
  ];

  for (const k of keys) {
    const val = data[k];
    if (val && (typeof val === "string" || typeof val === "number")) {
      const strVal = String(val).trim();
      if (strVal && !strVal.startsWith("http://") && !strVal.startsWith("https://")) {
        return strVal;
      }
    }
  }

  const subObjs = [data.data, data.result, data.output, data.response];
  for (const sub of subObjs) {
    if (sub && typeof sub === "object") {
      const found = extractTaskId(sub);
      if (found) return found;
    }
  }

  return undefined;
}

function extractStatusUrl(data: any): string | undefined {
  if (!data || typeof data !== "object") return undefined;

  const keys = [
    "status_url",
    "statusUrl",
    "status_uri",
    "statusUri",
    "poll_url",
    "pollUrl",
    "polling_url",
    "pollingUrl",
    "query_url",
    "queryUrl",
    "task_url",
    "taskUrl",
  ];

  const isStatusLikeUrl = (value: unknown): value is string => {
    if (typeof value !== "string" || !value.trim()) return false;
    const lower = value.toLowerCase();
    return /\/status|\/tasks?|\/jobs?|\/query|\/operations?|\/generations?/.test(lower);
  };

  for (const key of keys) {
    if (isStatusLikeUrl(data[key])) return data[key].trim();
  }

  if (isStatusLikeUrl(data.url)) return data.url.trim();

  for (const key of ["links", "data", "result", "output", "response"]) {
    const nested = data[key];
    if (nested && typeof nested === "object") {
      const found = extractStatusUrl(nested);
      if (found) return found;
    }
  }

  return undefined;
}

function formatUpstreamError(data: any): { code?: string; message: string } | undefined {
  if (!data || typeof data !== "object") return undefined;

  const nested = data.data && typeof data.data === "object" ? data.data : undefined;
  const rawCode = data.error_code || data.errorCode || nested?.error_code || nested?.errorCode;
  const rawMessage =
    data.error ||
    data.fail_reason ||
    data.error_message ||
    nested?.error ||
    nested?.fail_reason ||
    nested?.error_message ||
    data.message ||
    data.msg ||
    nested?.message ||
    nested?.msg;

  if (!rawCode && !rawMessage) return undefined;

  const message = typeof rawMessage === "string" ? rawMessage : JSON.stringify(rawMessage || "上游渲染失败");
  return {
    code: rawCode ? String(rawCode) : undefined,
    message: message || "上游渲染失败",
  };
}

// Helper to check if API response is a route not found error
function isInvalidRouteResponse(data: any): boolean {
  if (!data || typeof data !== "object") return true;

  const code = Number(data.code || data.status || data.statusCode);
  if (code === 404 || code === 405 || code === 400 || code === 500) {
    return true;
  }

  const msg = String(data.message || data.msg || data.error || data.detail || "").toLowerCase();
  if (
    msg.includes("not found") ||
    msg.includes("invalid route") ||
    msg.includes("route not found") ||
    msg.includes("cannot get") ||
    msg.includes("cannot post") ||
    msg.includes("unsupported endpoint") ||
    msg.includes("does not exist")
  ) {
    return true;
  }

  return false;
}

// 1. Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 1.1 Authentication stores only account metadata; generated media stays in the browser.
app.post("/api/auth/login", async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  const user = isPersistentAuthEnabled
    ? await persistentFindUserByUsername(username)
    : ensureInitialAdmin().find((item) => item.username === username && item.active);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: "账号或密码不正确" });
    return;
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + AUTH_SESSION_TTL_MS;
  if (isPersistentAuthEnabled) await persistentCreateSession(token, user.id, expiresAt);
  else authSessions.set(token, { userId: user.id, expiresAt });
  res.json({ token, user: publicAuthUser(user) });
});

app.get("/api/auth/me", async (req, res) => {
  const user = await requireAuth(req, res);
  if (user) res.json({ user: publicAuthUser(user) });
});

app.post("/api/auth/logout", async (req, res) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token) {
    if (isPersistentAuthEnabled) await persistentDeleteSession(token);
    else authSessions.delete(token);
  }
  res.json({ success: true });
});

app.get("/api/auth/me/usage", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const usage = isPersistentAuthEnabled
    ? await persistentGetUsage(user.id)
    : readUsage()[user.id] || { image: 0, video: 0, chat: 0, total: 0, updatedAt: Date.now() };
  res.json({ usage });
});

app.get("/api/auth/me/wallet", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const balance = user.role === "admin" ? null : await getStarBalance(user.id);
  res.json({ wallet: { balance, unlimited: user.role === "admin", enabled: STARS_ENABLED } });
});

app.post("/api/auth/password", async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const currentPassword = String(req.body?.currentPassword || "");
  const newPassword = String(req.body?.newPassword || "");
  if (!verifyPassword(currentPassword, user.passwordHash)) {
    res.status(400).json({ error: "当前密码不正确" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "新密码至少需要 8 位" });
    return;
  }
  if (isPersistentAuthEnabled) {
    const { error } = await supabase!.from("app_users").update({ password_hash: hashPassword(newPassword) }).eq("id", user.id);
    if (error) throw error;
    res.json({ success: true });
    return;
  }
  const users = ensureInitialAdmin();
  const target = users.find((item) => item.id === user.id);
  if (!target) {
    res.status(404).json({ error: "账号不存在" });
    return;
  }
  target.passwordHash = hashPassword(newPassword);
  writeAuthUsers(users);
  res.json({ success: true });
});

app.get("/api/auth/admin/users", async (req, res) => {
  if (!(await requireAuth(req, res, "admin"))) return;
  const users = isPersistentAuthEnabled ? await persistentListUsers() : ensureInitialAdmin();
  const enriched = await Promise.all(users.map(async (user) => ({
    ...publicAuthUser(user),
    starBalance: user.role === "admin" ? null : await getStarBalance(user.id),
  })));
  res.json({ users: enriched, starsEnabled: STARS_ENABLED });
});

app.get("/api/auth/admin/usage-logs", async (req, res) => {
  if (!(await requireAuth(req, res, "admin"))) return;
  const username = String(req.query.username || "").trim().toLowerCase();
  const kind = String(req.query.kind || "").trim();
  const requestedLimit = Number(req.query.limit || 200);
  const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(500, requestedLimit)) : 200;
  const logs = isPersistentAuthEnabled
    ? await persistentListUsageLogs(username, kind, limit)
    : readUsageLogs()
      .filter((entry) => !username || entry.username.toLowerCase().includes(username))
      .filter((entry) => !kind || entry.kind === kind)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  res.json({ logs });
});

app.post("/api/auth/admin/users", async (req, res) => {
  if (!(await requireAuth(req, res, "admin"))) return;
  const requestedUsername = String(req.body?.username || "").trim();
  const username = requestedUsername || `cs_${randomBytes(5).toString("hex").toUpperCase()}`;
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(username)) {
    res.status(400).json({ error: "账号需使用 3-32 位字母、数字、下划线或短横线" });
    return;
  }
  const existingUser = isPersistentAuthEnabled
    ? await persistentFindUserByUsername(username)
    : ensureInitialAdmin().find((user) => user.username === username);
  if (existingUser) {
    res.status(409).json({ error: "账号已存在，请换一个账号" });
    return;
  }

  const password = randomBytes(12).toString("base64url");
  const user: StoredAuthUser = {
    id: `user_${randomBytes(8).toString("hex")}`,
    username,
    passwordHash: hashPassword(password),
    role: "user",
    active: true,
    createdAt: Date.now(),
  };
  if (isPersistentAuthEnabled) {
    await persistentSaveUser(user);
    const { error } = await supabase!.from("wallets").upsert({ user_id: user.id, balance: 0, updated_at: new Date().toISOString() });
    if (error) throw error;
  } else {
    const users = ensureInitialAdmin();
    users.push(user);
    writeAuthUsers(users);
  }
  res.json({ user: publicAuthUser(user), credentials: { username, password } });
});

app.post("/api/auth/admin/users/lookup", async (req, res) => {
  if (!(await requireAuth(req, res, "admin"))) return;
  const username = String(req.body?.username || "").trim();
  const target = isPersistentAuthEnabled
    ? await persistentFindUserByUsername(username)
    : ensureInitialAdmin().find((user) => user.username.toLowerCase() === username.toLowerCase());
  if (!target) {
    res.status(404).json({ error: "未找到这个客户账号" });
    return;
  }
  res.json({ user: publicAuthUser(target), wallet: { balance: await getStarBalance(target.id), enabled: STARS_ENABLED } });
});

app.post("/api/auth/admin/stars", async (req, res) => {
  const actor = await requireAuth(req, res, "admin");
  if (!actor) return;
  if (!STARS_ENABLED) {
    res.status(409).json({ error: "星币功能暂未开放，当前不支持充值或扣费" });
    return;
  }
  const username = String(req.body?.username || "").trim();
  const target = isPersistentAuthEnabled
    ? await persistentFindUserByUsername(username)
    : ensureInitialAdmin().find((user) => user.username.toLowerCase() === username.toLowerCase());
  if (!target) {
    res.status(404).json({ error: "账号不存在" });
    return;
  }
  const amount = Number(req.body?.amount);
  if (!Number.isInteger(amount) || amount <= 0 || amount > 1_000_000) {
    res.status(400).json({ error: "充值星币数量必须是 1-1000000 的整数" });
    return;
  }
  const wallet = await adjustStars(target.id, amount, String(req.body?.reason || "admin recharge"), actor.id);
  res.json({ wallet });
});

app.post("/api/auth/admin/users/:userId/reset-password", async (req, res) => {
  if (!(await requireAuth(req, res, "admin"))) return;
  const target = isPersistentAuthEnabled
    ? await persistentFindUserById(req.params.userId)
    : ensureInitialAdmin().find((user) => user.id === req.params.userId);
  if (!target) {
    res.status(404).json({ error: "账号不存在" });
    return;
  }

  const password = "12345678";
  const passwordHash = hashPassword(password);
  if (isPersistentAuthEnabled) {
    const { error } = await supabase!.from("app_users").update({ password_hash: passwordHash }).eq("id", target.id);
    if (error) throw error;
    await persistentDeleteSessionsForUser(target.id);
  } else {
    const users = ensureInitialAdmin();
    const localTarget = users.find((user) => user.id === target.id);
    if (localTarget) {
      localTarget.passwordHash = passwordHash;
      writeAuthUsers(users);
    }
    for (const [token, session] of authSessions) {
      if (session.userId === target.id) authSessions.delete(token);
    }
  }
  res.json({ user: publicAuthUser(target), credentials: { username: target.username, password } });
});

app.use("/api", async (req, res, next) => {
  if (req.method === "OPTIONS" || req.path === "/health" || req.path.startsWith("/auth")) {
    next();
    return;
  }
  const user = await requireAuth(req, res);
  if (!user) return;
  (req as express.Request & { authUser?: StoredAuthUser }).authUser = user;
  next();
});

// 2. Preset Endpoints Info
app.get("/api/presets", (_req, res) => {
  res.json({
    presets: [
      {
        id: "google-veo",
        name: "Google Veo (Built-in GenAI)",
        description: "Google 官方高质量视频生成模型 (veo-3.1-lite / veo-3.1)",
        defaultUrl: "https://generativelanguage.googleapis.com",
        supportsImageToVideo: true,
        supportsPromptEnhancer: true,
        models: ["veo-3.1-lite-generate-preview", "veo-3.1-generate-preview"],
      },
      {
        id: "openai-sora",
        name: "OpenAI Sora API / Compatible",
        description: "OpenAI 官方及 OpenAI 格式第三方中转 API",
        defaultUrl: "https://api.openai.com/v1/videos/generations",
        supportsImageToVideo: true,
        supportsPromptEnhancer: true,
        models: ["sora-1.0", "sora-turbo"],
      },
      {
        id: "runway-gen3",
        name: "Runway Gen-3 Alpha",
        description: "Runway 电影级画面视频生成 API",
        defaultUrl: "https://api.runwayml.com/v1/tasks",
        supportsImageToVideo: true,
        supportsPromptEnhancer: false,
        models: ["gen3a_turbo"],
      },
      {
        id: "luma-dream-machine",
        name: "Luma Dream Machine",
        description: "Luma AI 极速高逼真视频生成 API",
        defaultUrl: "https://api.lumalabs.ai/dream-machine/v1/generations",
        supportsImageToVideo: true,
        supportsPromptEnhancer: false,
        models: ["dream-machine-v1"],
      },
      {
        id: "minimax-video",
        name: "MiniMax 海螺视频",
        description: "MiniMax 高逼真动作与人物视频 API",
        defaultUrl: "https://api.minimax.chat/v1/video_generation",
        supportsImageToVideo: true,
        supportsPromptEnhancer: false,
        models: ["video-01"],
      },
      {
        id: "kling-ai",
        name: "Kling AI 快手可灵",
        description: "可灵 AI 视频生成 REST API 接口",
        defaultUrl: "https://api.klingai.com/v1/videos/text2video",
        supportsImageToVideo: true,
        supportsPromptEnhancer: false,
        models: ["kling-v1", "kling-v1-5"],
      },
      {
        id: "custom-rest",
        name: "自定义通用 REST 接口",
        description: "支持任意格式的自定义 API 接口代理",
        defaultUrl: "",
        supportsImageToVideo: true,
        supportsPromptEnhancer: true,
        models: ["custom-model"],
      },
    ],
  });
});

// 3. AI Prompt Polish & Expansion Route
app.post("/api/enhance-prompt", async (req, res) => {
  try {
    const { prompt, style, cameraMotion, type = "image", targetLanguage = "zh", apiKey, chatConfig } = req.body;
    if (!prompt) {
      res.status(400).json({ error: "提示词不能为空" });
      return;
    }

    const systemInstruction = type === "video"
      ? `你是一位顶级 AI 视频导演与视觉艺术专家（专精 Veo, Sora, Runway, Kling 等视频大模型）。
请将用户的原始描述扩充为具备极高画质与专业运镜的视频生成 Prompt。
要求：
1. 丰富主体姿态与动态动作、背景空间细节与环境光影。
2. 加入专业运镜语言（如：${cameraMotion || "镜头平滑推进、微距特写、戏剧性打光"}）。
3. 描述画面美感与质感（如：${style || "电影级质感、物理真实光影、细腻纹理、无噪点"}）。
4. 必须直接输出润色后的最佳提示词文本，不要包含任何多余解释、问候或 Markdown 代码块。`
      : `你是一位顶级 AI 商业摄影师与视觉美学大师（专精 Midjourney, Flux, Imagen 等图像大模型）。
请将用户的初始画面概念描述扩充为一个具备极高细节与艺术感官的专业图像 Prompt。
要求：
1. 丰富主体的材质细节、造型面部、服饰动态与情感氛围。
2. 描述环境空间、构图层次、背景与自然光线。
3. 强化光影打光与艺术风格（如：${style || "写实摄影、自然大片光影、体积光、细腻纹理、8K超清画质"}）。
4. 必须直接输出润色后的精炼最佳提示词文本，不要包含任何多余解释、前缀标号或 Markdown 代码块。`;

    const userContent = `原始描述: "${prompt}"\n艺术风格: "${style || "无"}"\n运镜指示: "${cameraMotion || "无"}"\n输出语言: "${targetLanguage}"`;

    const concisePromptRule = "Return only the concise final prompt. Keep only the key subject, action, scene, camera, and visual style. Do not explain your reasoning, do not repeat constraints, and keep the result under 120 words.";
    let enhancedPrompt: string | null = null;

    // A. Try Gemini API
    const ai = getGenAIClient(apiKey || chatConfig?.apiKey);
    if (ai) {
      enhancedPrompt = await callGeminiGenerateText(ai, `${systemInstruction}\n\n${concisePromptRule}`, userContent, 0.7);
    }

    // B. Try Chat API proxy if Gemini didn't return text
    if (!enhancedPrompt && chatConfig && chatConfig.apiKey) {
      try {
        const chatRes = await fetch(resolveChatTargetUrl(chatConfig.provider, chatConfig.apiUrl), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${chatConfig.apiKey}`,
          },
          body: JSON.stringify({
            model: chatConfig.selectedModel || "gpt-4o-mini",
            messages: [
              { role: "system", content: `${systemInstruction}\n\n${concisePromptRule}` },
              { role: "user", content: userContent },
            ],
            temperature: 0.7,
            stream: false,
          }),
        });

        if (chatRes.ok) {
          const chatData = await chatRes.json();
          const reply = chatData?.choices?.[0]?.message?.content?.trim();
          if (reply && reply.length > 5) {
            enhancedPrompt = reply.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
          }
        }
      } catch (cErr: any) {
        console.warn("[Enhance Prompt] Chat API proxy failed:", cErr?.message || cErr);
      }
    }

    // C. Smart Dynamic Enhancer Fallback
    if (!enhancedPrompt) {
      const styleSuffix = style ? `，${style}` : "，电影级光影质感";
      const cameraSuffix = cameraMotion ? `，${cameraMotion}` : "";
      if (type === "video") {
        enhancedPrompt = `${prompt}${styleSuffix}${cameraSuffix}，主体与环境细节生动逼真，超清8K画质，动态流畅连贯，极致视觉冲击力`;
      } else {
        enhancedPrompt = `${prompt}${styleSuffix}，高精细节刻画，自然光影透射，极佳景深与构图，超写实质感，8K分辨率`;
      }
    }

    res.json({ enhancedPrompt });
  } catch (err: any) {
    console.error("Enhance prompt error:", err);
    res.status(500).json({
      error: err.message || "提示词润色失败",
      enhancedPrompt: req.body.prompt,
    });
  }
});

// Helper for calling Gemini with fallback models
async function callGeminiGenerateText(
  ai: GoogleGenAI,
  systemInstruction: string,
  userPrompt: string,
  temperature: number = 0.7
): Promise<string | null> {
  const modelsToTry = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.5-pro"];
  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: userPrompt,
        config: {
          systemInstruction,
          temperature,
        },
      });
      const text = response.text?.trim();
      if (text && text.length > 3) {
        return text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
      }
    } catch (e: any) {
      console.warn(`[Gemini Text] Model ${model} failed:`, e?.message || e);
    }
  }
  return null;
}

async function loadInlineImageData(imageUrl: string): Promise<{ mimeType: string; data: string } | null> {
  const dataMatch = imageUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (dataMatch) return { mimeType: dataMatch[1], data: dataMatch[2] };
  if (!/^https?:\/\//i.test(imageUrl)) return null;

  try {
    const imageRes = await safeFetch(imageUrl, { headers: { "User-Agent": "CloudStudio/1.0" } });
    const contentType = imageRes.headers.get("content-type")?.split(";", 1)[0].trim() || "";
    if (!imageRes.ok || !contentType.startsWith("image/")) return null;
    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
    if (!imageBuffer.length || imageBuffer.length > 12 * 1024 * 1024) return null;
    return { mimeType: contentType, data: imageBuffer.toString("base64") };
  } catch (error: any) {
    console.warn("[AI Writer] Reference image download skipped:", error?.message || error);
    return null;
  }
}

async function callGeminiGenerateTextWithImage(
  ai: GoogleGenAI,
  systemInstruction: string,
  userPrompt: string,
  imageUrl: string,
  temperature: number = 0.2,
): Promise<string | null> {
  const image = await loadInlineImageData(imageUrl);
  if (!image) return null;

  const modelsToTry = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.5-pro"];
  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{
          role: "user",
          parts: [
            { text: userPrompt },
            { inlineData: image },
          ],
        }],
        config: {
          systemInstruction,
          temperature,
        },
      });
      const text = response.text?.trim();
      if (text && text.length > 3) {
        return text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
      }
    } catch (error: any) {
      console.warn(`[Gemini Image Writer] Model ${model} failed:`, error?.message || error);
    }
  }
  return null;
}

function resolveChatTargetUrl(provider: string, apiUrl?: string): string {
  if (apiUrl?.trim()) return apiUrl.trim();

  const builtInUrls: Record<string, string> = {
    "openai-chat": "https://api.openai.com/v1/chat/completions",
    "anthropic-claude": "https://api.anthropic.com/v1/messages",
    "deepseek-chat": "https://api.deepseek.com/v1/chat/completions",
    "ycvip-chat": "https://ycvip.net/v1/chat/completions",
  };

  return builtInUrls[provider] || "https://api.openai.com/v1/chat/completions";
}

function resolveImageTargetUrl(provider: string, apiUrl?: string): string {
  if (apiUrl?.trim()) return apiUrl.trim();
  if (provider === "ai2api-image" || provider === "custom-image") return "https://ai2api.cc/v1/images/generations";
  if (provider === "flux-ycvip") return "https://ycvip.net/v1/images/generations";
  return "https://api.openai.com/v1/images/generations";
}

function resolveVideoTargetUrl(provider: string, apiUrl?: string): string | undefined {
  const builtInUrls: Record<string, string> = {
    "ycvip-grok": "https://ycvip.net/v1/media/generate",
    "openai-sora": "https://api.openai.com/v1/videos/generations",
    "runway-gen3": "https://api.runwayml.com/v1/tasks",
    "luma-dream-machine": "https://api.lumalabs.ai/dream-machine/v1/generations",
    "minimax-video": "https://api.minimax.chat/v1/video_generation",
    "kling-ai": "https://api.klingai.com/v1/videos/text2video",
  };

  // YCVIP is the fixed video gateway. Do not allow the browser to override it.
  if (provider === "ycvip-grok" || (provider === "custom-rest" && !apiUrl?.trim())) {
    return builtInUrls["ycvip-grok"];
  }
  if (apiUrl?.trim()) return apiUrl.trim();

  return builtInUrls[provider];
}

// 3.1 AI Prompt Writer Assistant Route (AI 帮写提示词)
app.post("/api/ai-writer-prompt", async (req, res) => {
  try {
    const { topic, theme, cameraPreference, targetLanguage = "zh", mode = "video", imageUrl, apiKey, chatConfig } = req.body;
    if (!topic) {
      res.status(400).json({ error: "创意主题或想法不能为空" });
      return;
    }

    const systemInstruction = `你是一位顶级 AI 视频生成导播与视觉艺术专家（专精 Google Veo、OpenAI Sora、Runway 等核心模型）。
你的任务是根据用户的灵感点子或短语，自动帮写出一段具备极高连贯性、画面美感、逼真物理与动作细节的专业 AI 视频生成提示词 (Prompt)。

撰写要求：
1. **画面主体与动态**：细节生动，动作流畅逼真。
2. **环境空间与光影**：精准构图，丰富的空间质感与符合主题的光影效果 (${theme || "电影大片氛围"})。
3. **镜头运镜**：体现专业电影镜头语言 (${cameraPreference || "平滑推镜头"})。
4. **输出规范**：直接输出完整的一段精炼提示词段落，不要带有标签、说明文字或 Markdown 列表。
如果目标语言为英文 (en)，请生成精湛英文提示词；如果为中文 (zh)，请生成高水准中文提示词。`;

    const writerInstruction = mode === "image-negative"
      ? imageUrl
        ? "You are an expert AI image negative-prompt writer. Inspect the provided reference image itself. List only visible details that a future image generation must not change or damage, such as deformation, wrong colors, altered materials, missing patterns, structural errors, blur, extra objects, text, watermark, and artifacts. Do not guess details that are unclear. Return only a concise comma-separated negative prompt. Do not describe the desired image or add explanations."
        : "You are an expert AI image negative-prompt writer. Based on the user's image subject, list unwanted elements such as deformation, anatomy errors, blur, low quality, extra objects, text, watermark, and artifacts. Return only a concise comma-separated negative prompt. Do not describe the desired image and do not add explanations."
      : mode === "image"
        ? "You are an expert AI image prompt writer. Create a concise visual prompt covering subject, composition, environment, lighting, materials, framing, and style. Preserve the user's core idea. Return only the final prompt, with no explanation or headings."
        : systemInstruction;

    const userContent = mode === "image-negative" && imageUrl
      ? `请检查用户上传的参考图，生成与这张图直接相关的反向提示词。补充主题: "${topic || "参考图"}"。语言: "${targetLanguage}"。`
      : `创意主题: "${topic}"\n期望氛围风格: "${theme || "默认"}"\n运镜偏好: "${
        cameraPreference || "默认"
      }"\n语言: "${targetLanguage}"`;

    const conciseWriterRule = mode === "image-negative"
      ? "Return only a short comma-separated list of unwanted elements. Keep it under 80 words."
      : mode === "image"
        ? "Return only a concise final image prompt with key points. Avoid decorative filler and keep it under 120 words."
        : "Return only a concise final video prompt with key points. Do not explain reasoning, avoid decorative filler, and keep it under 120 words.";
    let generatedPrompt: string | null = null;

    // A. Try Gemini
    const ai = getGenAIClient(apiKey || chatConfig?.apiKey);
    if (ai) {
      generatedPrompt = mode === "image-negative" && imageUrl
        ? await callGeminiGenerateTextWithImage(ai, `${writerInstruction}\n\n${conciseWriterRule}`, userContent, imageUrl, 0.2)
        : await callGeminiGenerateText(ai, `${writerInstruction}\n\n${conciseWriterRule}`, userContent, 0.8);
    }

    // B. Try Chat API proxy if Gemini unavailable
    if (!generatedPrompt && chatConfig && chatConfig.apiKey) {
      try {
        const chatUserMessage = mode === "image-negative" && imageUrl
          ? {
              role: "user",
              content: [
                { type: "text", text: userContent },
                { type: "image_url", image_url: { url: imageUrl } },
              ],
            }
          : { role: "user", content: userContent };
        const chatRes = await fetch(resolveChatTargetUrl(chatConfig.provider, chatConfig.apiUrl), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${chatConfig.apiKey}`,
          },
          body: JSON.stringify({
            model: chatConfig.selectedModel || "gpt-4o-mini",
            messages: [
              { role: "system", content: `${writerInstruction}\n\n${conciseWriterRule}` },
              chatUserMessage,
            ],
            temperature: 0.8,
            stream: false,
          }),
        });

        if (chatRes.ok) {
          const chatData = await chatRes.json();
          const reply = chatData?.choices?.[0]?.message?.content?.trim();
          if (reply && reply.length > 5) {
            generatedPrompt = reply.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
          }
        }
      } catch (cErr: any) {
        console.warn("[AI Writer Prompt] Chat API proxy failed:", cErr?.message || cErr);
      }
    }

    // C. Dynamic Fallback
    if (!generatedPrompt && mode === "image-negative" && imageUrl) {
      res.status(502).json({ error: "参考图识别失败，请检查视觉模型、API Key 或接口配置后重试。" });
      return;
    }
    if (!generatedPrompt && mode === "image-negative") {
      generatedPrompt = "deformation, anatomy errors, blur, low quality, noise, extra objects, text, watermark, artifacts";
    }
    if (!generatedPrompt) {
      generatedPrompt = `${topic}，${theme || "电影级视觉质感"}，${
        cameraPreference || "镜头平滑推近"
      }，高清8K质感，极具视觉冲击力与逼真细节，画面连贯自然`;
    }

    res.json({ generatedPrompt });
  } catch (err: any) {
    console.error("AI Writer prompt error:", err);
    res.status(500).json({
      error: err.message || "AI 帮写提示词生成失败",
      generatedPrompt: req.body.topic,
    });
  }
});

function extractMessageFromObject(obj: any): { text: string; reasoning: string; error?: string } {
  if (!obj) return { text: "", reasoning: "" };
  if (typeof obj === "string") return { text: obj, reasoning: "" };

  const error = obj.error?.message || obj.error?.details || (typeof obj.error === "string" ? obj.error : "");
  let text = "";
  let reasoning = "";

  const choices = Array.isArray(obj.choices) ? obj.choices : [];
  if (choices.length > 0) {
    const choice = choices[0];
    const target = choice.delta || choice.message || choice;

    if (typeof target === "string") {
      text = target;
    } else if (typeof target.content === "string") {
      text = target.content;
    } else if (Array.isArray(target.content)) {
      text = target.content
        .map((item: any) => (typeof item === "string" ? item : item?.text || item?.content || ""))
        .join("");
    } else if (typeof target.text === "string") {
      text = target.text;
    } else if (typeof choice.text === "string") {
      text = choice.text;
    }

    if (typeof target.reasoning_content === "string") {
      reasoning = target.reasoning_content;
    } else if (typeof target.reasoning === "string") {
      reasoning = target.reasoning;
    } else if (typeof target.thinking === "string") {
      reasoning = target.thinking;
    }
  } else {
    if (typeof obj.content === "string") text = obj.content;
    else if (Array.isArray(obj.content)) {
      text = obj.content
        .map((item: any) => (typeof item === "string" ? item : item?.text || ""))
        .join("");
    } else if (typeof obj.response === "string") text = obj.response;
    else if (typeof obj.text === "string") text = obj.text;
    else if (typeof obj.output === "string") text = obj.output;

    if (typeof obj.reasoning_content === "string") reasoning = obj.reasoning_content;
    else if (typeof obj.reasoning === "string") reasoning = obj.reasoning;
  }

  return { text, reasoning, error };
}

function parseProxyResponseBody(rawText: string): string {
  const trimmedRaw = rawText.trim();
  if (!trimmedRaw) return "（接口未返回内容）";

  // 1. Try single JSON
  try {
    const json = JSON.parse(trimmedRaw);
    const { text, reasoning, error } = extractMessageFromObject(json);
    if (error) return `接口错误: ${error}`;

    let result = "";
    if (reasoning) result += `> 💭 思考过程:\n${reasoning}\n\n`;
    if (text) result += text;

    if (result) return result;
    return typeof json === "string" ? json : JSON.stringify(json);
  } catch (_) {}

  // 2. Stream / SSE lines / line-by-line parsing
  const lines = trimmedRaw.split(/\r?\n/);
  let accumulatedText = "";
  let accumulatedReasoning = "";
  let lastError = "";

  for (const line of lines) {
    const l = line.trim();
    if (!l || l.startsWith(":")) continue;

    let payload = l;
    if (l.startsWith("data:")) {
      payload = l.slice(5).trim();
    }

    if (payload === "[DONE]" || payload === "DONE" || payload === "data: [DONE]") continue;

    try {
      const parsed = JSON.parse(payload);
      const { text, reasoning, error } = extractMessageFromObject(parsed);
      if (error) lastError = error;
      if (text) accumulatedText += text;
      if (reasoning) accumulatedReasoning += reasoning;
    } catch (_) {
      if (!l.startsWith("data:") && !l.startsWith("event:")) {
        accumulatedText += l + "\n";
      }
    }
  }

  let finalReply = "";
  if (accumulatedReasoning.trim()) {
    finalReply += `> 💭 思考过程:\n${accumulatedReasoning.trim()}\n\n`;
  }
  if (accumulatedText.trim()) {
    finalReply += accumulatedText.trim();
  } else if (lastError) {
    finalReply = `接口报错: ${lastError}`;
  } else {
    // Sanitize any leftover raw SSE formatting or [DONE] markers
    finalReply = trimmedRaw
      .replace(/^data:\s*/gm, "")
      .replace(/\[DONE\]/g, "")
      .trim();
  }

  if (!finalReply || finalReply === "[DONE]") {
    finalReply = "（上游接口完成响应，但未接收到有效文本）";
  }

  return finalReply;
}

// 3.2 AI Chat / Dialogue Endpoint (支持自定义接口与 API Key)
app.post("/api/chat", async (req, res) => {
  try {
    const {
      messages = [],
      systemInstruction = "你是一位博学、严谨且富有创造力的 AI 智能对话助理。",
      temperature = 0.7,
      provider = "google-gemini",
      apiUrl,
      apiKey,
      model = "gemini-3.6-flash",
    } = req.body;

    if (!messages || messages.length === 0) {
      res.status(400).json({ error: "消息列表不能为空" });
      return;
    }

    if (!(await reserveStars(req, res, "chat"))) return;
    await recordUsage(req, "chat", { provider, model });

    // Google Gemini GenAI
    if (provider === "google-gemini" || (!apiUrl && model.includes("gemini"))) {
      const ai = getGenAIClient(apiKey);
      if (!ai) {
        res.status(400).json({
          error: "未配置 Gemini API Key，请在顶部【接口配置】中设置正确的 API Key。",
        });
        return;
      }

      const contents = messages.map((m: any) => {
        const img = m.imageUrl || m.image_url;
        const textContent = m.content || "";
        const parts: any[] = [{ text: textContent }];
        if (img) {
          const dataMatch = typeof img === "string" ? img.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/) : null;
          if (dataMatch) {
            parts.push({ inlineData: { mimeType: dataMatch[1], data: dataMatch[2] } });
          }
        }
        if (img) {
          parts.push({ text: `\n[用户提供图片/参考图 URL: ${img}]` });
        }
        return {
          role: m.role === "assistant" ? "model" : "user",
          parts,
        };
      });

      const response = await ai.models.generateContent({
        model: model || "gemini-3.6-flash",
        contents,
        config: {
          systemInstruction,
          temperature: Number(temperature) || 0.7,
        },
      });

      res.json({
        success: true,
        response: response.text || "（未收到模型响应文本）",
        provider: "google-gemini",
      });
      return;
    }

    // C. OpenAI / Anthropic / Custom REST proxy format
    const targetUrl = resolveChatTargetUrl(provider, apiUrl);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
      headers["x-api-key"] = apiKey;
    }

    const formattedMessages = [
      ...(systemInstruction ? [{ role: "system", content: systemInstruction }] : []),
      ...messages.map((m: any) => {
        const imageUrl = m.imageUrl || m.image_url;
        if (imageUrl && m.role === "user") {
          return {
            role: m.role,
            content: [
              {
                type: "text",
                text: m.content || "描述这张图片",
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                },
              },
            ],
          };
        }
        return {
          role: m.role,
          content: m.content,
        };
      }),
    ];

    const activeModel = model || "gpt-5.6-luna";
    const reqBodyBase = {
      model: activeModel,
      messages: formattedMessages,
      temperature: Number(temperature) || 0.7,
    };

    let replyContent: string | undefined = undefined;

    // Helper to send chat fetch
    const tryFetchChat = async (requestModel: string, isStream: boolean) => {
      const resp = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...reqBodyBase,
          model: requestModel,
          stream: isStream,
        }),
      });
      return resp;
    };

    // Attempt 1: Stream mode with requested model
    let proxyRes = await tryFetchChat(activeModel, true);
    
    // Attempt 2: If stream failed (non-200), try non-stream mode with requested model
    if (!proxyRes.ok) {
      const streamErrText = await proxyRes.text();
      // If error is all_vendors_failed and model is not gpt-4o-mini, try gpt-4o-mini fallback
      if ((streamErrText.includes("all_vendors_failed") || streamErrText.includes("no available candidates")) && activeModel !== "gpt-4o-mini") {
        console.warn(`[Chat Proxy] Model '${activeModel}' failed with all_vendors_failed. Retrying with fallback model 'gpt-4o-mini'...`);
        proxyRes = await tryFetchChat("gpt-4o-mini", false);
      } else {
        proxyRes = await tryFetchChat(activeModel, false);
      }

      if (!proxyRes.ok) {
        const finalErrText = await proxyRes.text();
        if (finalErrText.includes("all_vendors_failed") || finalErrText.includes("no available candidates")) {
          throw new Error(`上游服务商未提供该模型（${activeModel}）的可用中转通道（all_vendors_failed）。请在顶部【接口配置】中更换模型（如 gpt-4o-mini / deepseek-chat），或切换为 Gemini 官方接口。`);
        }
        throw new Error(`Chat API 响应异常 (${proxyRes.status}): ${finalErrText.slice(0, 250)}`);
      }
    }

    let rawText = await proxyRes.text();
    replyContent = parseProxyResponseBody(rawText);

    // Attempt 3: If response body had no content, try non-stream
    if (!replyContent || replyContent === "（上游接口完成响应，但未接收到有效文本）") {
      try {
        const retryRes = await tryFetchChat(activeModel, false);
        if (retryRes.ok) {
          const retryText = await retryRes.text();
          const retryReply = parseProxyResponseBody(retryText);
          if (retryReply && retryReply !== "（上游接口完成响应，但未接收到有效文本）") {
            replyContent = retryReply;
          }
        }
      } catch (retryErr) {
        console.error("Chat retry with stream: false failed:", retryErr);
      }
    }

    res.json({
      success: true,
      response: replyContent,
      provider: provider || "custom-chat",
    });
  } catch (err: any) {
    console.error("Chat API error:", err);
    res.status(500).json({ error: err.message || "对话接口调用失败" });
  }
});

// 3.3 AI Image Generation Endpoint (支持自定义接口与 API Key)
app.post("/api/generate-image", async (req, res) => {
  try {
    const {
      prompt,
      negativePrompt,
      aspectRatio = "1:1",
      style,
      provider = "google-imagen",
      apiUrl,
      apiKey,
      model = "imagen-3.0-generate-002",
      referenceImage,
    } = req.body;

    if (!prompt) {
      res.status(400).json({ error: "绘图提示词不能为空" });
      return;
    }

    if (!(await reserveStars(req, res, "image"))) return;
    await recordUsage(req, "image", { provider, model, aspectRatio });

    // Google Imagen GenAI
    if (provider === "google-imagen" || (!apiUrl && model.includes("imagen"))) {
      const ai = getGenAIClient(apiKey);
      if (!ai) {
        res.status(400).json({
          error: "未配置 Gemini API Key，请在顶部【接口配置】中设置正确的 API Key。",
        });
        return;
      }

      let fullPrompt = prompt;
      if (style) fullPrompt += `, in ${style} style`;
      if (negativePrompt) fullPrompt += `, avoid: ${negativePrompt}`;
      if (referenceImage) fullPrompt += `\n\n${IMAGE_REFERENCE_LOCK_RULES}\n\n${PRODUCT_IDENTITY_RULES}`;

      const selectedModel = model.includes("imagen") ? model : "imagen-3.0-generate-002";

      let base64Img: string | undefined;
      let base64MimeType = "image/jpeg";

      // Use Imagen editing when a reference image exists. This keeps the original
      // product pixels and structure authoritative instead of redrawing the item.
      if (referenceImage && typeof referenceImage === "string") {
        const mimeMatch = referenceImage.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (mimeMatch) {
          const [, mimeType, base64Data] = mimeMatch;
          try {
            const reference = new RawReferenceImage();
            reference.referenceImage = { mimeType, imageBytes: base64Data };
            const editedResponse = await ai.models.editImage({
              model: "imagen-3.0-capability-001",
              prompt: fullPrompt,
              referenceImages: [reference],
              config: {
                numberOfImages: 1,
                outputMimeType: "image/jpeg",
                aspectRatio: aspectRatio === "16:9" ? "16:9" : aspectRatio === "9:16" ? "9:16" : aspectRatio === "4:3" ? "4:3" : aspectRatio === "3:4" ? "3:4" : "1:1",
                negativePrompt: negativePrompt || "redesigned clothing, changed hemline, changed plaid pattern, changed fabric, changed pleats, changed silhouette, missing product details, extra product parts, occluded product",
                editMode: EditMode.EDIT_MODE_PRODUCT_IMAGE,
                personGeneration: PersonGeneration.ALLOW_ADULT,
              },
            });
            base64Img = editedResponse.generatedImages?.[0]?.image?.imageBytes;
          } catch (editErr: any) {
            console.warn("Imagen reference edit failed; falling back to standard generation:", editErr?.message || editErr);
          }
        }
      }

      // Some API keys expose Gemini image editing but not Imagen capability models.
      // Try the multimodal image model before falling back to text-only generation.
      if (referenceImage && typeof referenceImage === "string" && !base64Img) {
        const mimeMatch = referenceImage.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (mimeMatch) {
          const [, mimeType, base64Data] = mimeMatch;
          try {
            const editedResponse: any = await ai.models.generateContent({
              model: "gemini-2.5-flash-image",
              contents: [{
                role: "user",
                parts: [
                  { inlineData: { mimeType, data: base64Data } },
                  { text: `Use the attached image as the exact product source. Add the requested person and scene while preserving the product unchanged. ${fullPrompt}` },
                ],
              }],
              config: {
                responseModalities: ["IMAGE"],
                imageConfig: {
                  aspectRatio: aspectRatio === "16:9" ? "16:9" : aspectRatio === "9:16" ? "9:16" : aspectRatio === "4:3" ? "4:3" : aspectRatio === "3:4" ? "3:4" : "1:1",
                },
              },
            });
            const imagePart = editedResponse.candidates?.[0]?.content?.parts?.find((part: any) => part.inlineData?.data);
            if (imagePart?.inlineData?.data) {
              base64Img = imagePart.inlineData.data;
              base64MimeType = imagePart.inlineData.mimeType || "image/png";
            }
          } catch (editErr: any) {
            console.warn("Gemini image edit fallback failed; using standard generation:", editErr?.message || editErr);
          }
        }
      }

      if (base64Img) {
        res.json({
          success: true,
          imageUrl: `data:${base64MimeType};base64,${base64Img}`,
          provider: "google-imagen-edit",
          prompt,
        });
        return;
      }

      try {
        const response = await ai.models.generateImages({
          model: selectedModel,
          prompt: fullPrompt,
          config: {
            numberOfImages: 1,
            outputMimeType: "image/jpeg",
            aspectRatio: aspectRatio === "16:9" ? "16:9" : aspectRatio === "9:16" ? "9:16" : aspectRatio === "4:3" ? "4:3" : aspectRatio === "3:4" ? "3:4" : "1:1",
          },
        });
        base64Img = response.generatedImages?.[0]?.image?.imageBytes;
      } catch (primaryErr: any) {
        console.warn(`Primary Imagen model (${selectedModel}) failed:`, primaryErr?.message || primaryErr);
        // Fallback to imagen-3.0-fast-generate-001 if primary model fails
        if (selectedModel !== "imagen-3.0-fast-generate-001") {
          try {
            const fallbackRes = await ai.models.generateImages({
              model: "imagen-3.0-fast-generate-001",
              prompt: fullPrompt,
              config: {
                numberOfImages: 1,
                outputMimeType: "image/jpeg",
                aspectRatio: aspectRatio === "16:9" ? "16:9" : aspectRatio === "9:16" ? "9:16" : aspectRatio === "4:3" ? "4:3" : aspectRatio === "3:4" ? "3:4" : "1:1",
              },
            });
            base64Img = fallbackRes.generatedImages?.[0]?.image?.imageBytes;
          } catch (fallbackErr: any) {
            throw new Error(`Google Imagen 绘图失败: ${primaryErr?.message || fallbackErr?.message || "请确认 API Key 是否具备 Imagen 权限"}`);
          }
        } else {
          throw new Error(`Google Imagen 绘图失败: ${primaryErr?.message || "请确认 API Key 是否具备 Imagen 权限"}`);
        }
      }

      if (base64Img) {
        res.json({
          success: true,
          imageUrl: `data:image/jpeg;base64,${base64Img}`,
          provider: "google-imagen",
          prompt,
        });
        return;
      } else {
        throw new Error("Imagen 接口未返回有效图片数据，请确认提示词未触发安全过滤。");
      }
    }

    // C. OpenAI DALL-E / Custom REST API Proxy
    const targetUrl = resolveImageTargetUrl(provider, apiUrl);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
      headers["x-api-key"] = apiKey;
    }

    let size = "1024x1024";
    if (aspectRatio === "16:9") size = "1792x1024";
    else if (aspectRatio === "9:16") size = "1024x1792";

    let fullPrompt = prompt;
    if (style) fullPrompt += `, ${style} style`;
    if (negativePrompt) fullPrompt += `, avoid: ${negativePrompt}`;
    if (referenceImage) fullPrompt += `\n\n${IMAGE_REFERENCE_LOCK_RULES}\n\n${PRODUCT_IDENTITY_RULES}`;
    const protectedNegativePrompt = [
      negativePrompt,
      referenceImage ? "redesigned product, changed clothing, changed hemline, changed plaid pattern, changed fabric, changed pleats, changed silhouette, missing product details, extra product parts, occluded product" : "",
    ].filter(Boolean).join(", ");

    const isYcvipOrCustom =
      !targetUrl.includes("api.openai.com") ||
      (model && (model.includes("gpt-image") || model.includes("flux") || model.includes("midjourney")));

    // Build payload according to endpoint provider specifications
    const requestPayload: Record<string, any> = {
      model: model || "gpt-image-2",
      prompt: fullPrompt,
      n: 1,
      size,
    };
    if (protectedNegativePrompt) {
      requestPayload.negative_prompt = protectedNegativePrompt;
      requestPayload.negativePrompt = protectedNegativePrompt;
    }

    if (isYcvipOrCustom) {
      if (referenceImage) {
        requestPayload.mode = "image-edit";
        requestPayload.quality = "low";
        requestPayload.images = [referenceImage];
        requestPayload.image_url = referenceImage;
        requestPayload.reference_image = referenceImage;
        requestPayload.input_image = referenceImage;
      } else {
        requestPayload.quality = "low";
      }
    } else if (referenceImage) {
      requestPayload.image_url = referenceImage;
    }

    let targetRes = await fetchWithTimeout(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestPayload),
    }, IMAGE_GENERATION_TIMEOUT_MS);

    if (!targetRes.ok) {
      const errText = await targetRes.text();
      const lowerErrText = errText.toLowerCase();
      let referenceRetrySucceeded = false;
      const needsReferenceImageRetry = Boolean(referenceImage) && (
        lowerErrText.includes("请上传参考") ||
        lowerErrText.includes("参考商品图片") ||
        lowerErrText.includes("reference image") ||
        lowerErrText.includes("image input") ||
        lowerErrText.includes("input image")
      );

      if (needsReferenceImageRetry) {
        const retryPayload = {
          ...requestPayload,
          image: referenceImage,
          imageUrl: referenceImage,
          referenceImage,
          reference_image: referenceImage,
          input_image: referenceImage,
          init_image: referenceImage,
          input_images: [referenceImage],
          messages: [{
            role: "user",
            content: [
              { type: "text", text: fullPrompt },
              { type: "image_url", image_url: { url: referenceImage } },
            ],
          }],
        };
        const retryRes = await fetchWithTimeout(targetUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(retryPayload),
        }, IMAGE_GENERATION_TIMEOUT_MS);
        if (retryRes.ok) {
          targetRes = retryRes;
          referenceRetrySucceeded = true;
        }
      }

      if (!referenceRetrySucceeded) {
      if (lowerErrText.includes("field messages is required") || lowerErrText.includes("messages is required")) {
        throw new Error("当前图像接口地址返回了对话接口错误：该地址要求 messages 字段。请在【图像接口】中填写图像生成地址（通常是 /images/generations），不要填写 /chat/completions。若服务商只支持对话式生图，需要单独适配该服务商的请求格式。");
      }
      throw new Error(`图像 API 接口状态异常 (${targetRes.status}): ${errText.slice(0, 200)}`);
      }
    }

    const data: any = await targetRes.json();
    const rawImageResult =
      data.data?.[0]?.url ||
      (data.data?.[0]?.b64_json ? `data:image/png;base64,${data.data[0].b64_json}` : null) ||
      data.image_url ||
      data.url ||
      data.result;

    let resultUrl = normalizeImageResult(rawImageResult) || normalizeImageResult(data);

    if (!resultUrl) {
      throw new Error("图像 API 返回结果中未解析到有效图片 URL 或图片数据");
    }

    // Cache remote image results so temporary upstream URLs do not break after navigation.
    if (/^https?:\/\//i.test(resultUrl)) {
      try {
        const imageRes = await safeFetch(resultUrl, {
          headers: { "User-Agent": "CloudStudio/1.0" },
        });
        const contentType = imageRes.headers.get("content-type") || "";
        if (imageRes.ok && contentType.toLowerCase().startsWith("image/")) {
          const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
          if (imageBuffer.length > 0 && imageBuffer.length <= 12 * 1024 * 1024) {
            const mimeType = contentType.split(";", 1)[0].trim() || "image/png";
            resultUrl = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
          }
        }
      } catch (cacheError: any) {
        console.warn("Remote image cache skipped:", cacheError?.message || cacheError);
      }
    }

    res.json({
      success: true,
      imageUrl: resultUrl,
      provider: provider || "custom-image",
      prompt,
    });
  } catch (err: any) {
    console.error("Generate image error:", err);
    res.status(500).json({ error: err.message || "图像生成请求失败" });
  }
});

// 4. AI Video Generation & Sync Task Manager Architecture

interface ServerTaskRecord {
  taskId: string;
  operationName: string;
  provider: string;
  model: string;
  prompt: string;
  mode: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  apiKey?: string;
  apiUrl?: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  hasExplicitProgress?: boolean;
  stage: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  lastPolledAt?: number;
  cachedStatusUrl?: string;
  cachedStatusMethod?: "GET" | "POST";
  rawResponse?: any;
}

class ServerVideoTaskManager {
  private tasks = new Map<string, ServerTaskRecord>();

  register(record: Partial<ServerTaskRecord> & { operationName: string; provider: string }): ServerTaskRecord {
    const taskId = record.taskId || record.operationName;
    const now = Date.now();
    const existing = this.tasks.get(taskId) || this.tasks.get(record.operationName);

    const fullRecord: ServerTaskRecord = {
      taskId,
      operationName: record.operationName,
      provider: record.provider,
      model: record.model || "veo-3.1",
      prompt: record.prompt || "",
      mode: record.mode || "text-to-video",
      aspectRatio: record.aspectRatio,
      resolution: record.resolution,
      duration: record.duration,
      apiKey: record.apiKey,
      apiUrl: record.apiUrl,
      status: record.status || (record.videoUrl ? "completed" : "processing"),
      progress: record.progress !== undefined ? record.progress : (record.videoUrl ? 100 : 0),
      hasExplicitProgress: record.hasExplicitProgress !== undefined ? record.hasExplicitProgress : existing?.hasExplicitProgress,
      stage: record.stage || (record.videoUrl ? "上游生成已完成" : "任务已创建，正在与上游集群对接..."),
      videoUrl: record.videoUrl,
      thumbnailUrl: record.thumbnailUrl,
      error: record.error,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      cachedStatusUrl: record.cachedStatusUrl || existing?.cachedStatusUrl,
      cachedStatusMethod: record.cachedStatusMethod || existing?.cachedStatusMethod,
      rawResponse: record.rawResponse || existing?.rawResponse,
    };

    this.tasks.set(taskId, fullRecord);
    if (record.operationName !== taskId) {
      this.tasks.set(record.operationName, fullRecord);
    }
    return fullRecord;
  }

  get(id?: string): ServerTaskRecord | undefined {
    if (!id) return undefined;
    return this.tasks.get(id);
  }

  update(id: string, updates: Partial<ServerTaskRecord>): ServerTaskRecord | undefined {
    const record = this.tasks.get(id);
    if (!record) return undefined;
    Object.assign(record, updates, { updatedAt: Date.now() });
    return record;
  }
}

const videoTaskManager = new ServerVideoTaskManager();

// 4.1 Create Video Generation Task Route
app.post("/api/generate-video", async (req, res) => {
  try {
    const {
      mode = "text-to-video",
      provider = "google-veo",
      apiUrl,
      apiKey,
      prompt,
      negativePrompt,
      image, // { data: base64, mimeType: string }
      lastFrame,
      aspectRatio: rawAspectRatio = "16:9",
      resolution: rawResolution = "720p",
      duration: rawDuration = 8,
      cameraMotion,
      style,
      model = "veo-3.1-lite-generate-preview",
    } = req.body;

    const aspectRatio = rawAspectRatio === "9:16" ? "9:16" : "16:9";
    const resolution = rawResolution === "480p" ? "480p" : "720p";
    const parsedDuration = Number(rawDuration);
    const duration = [8, 10, 12, 15].includes(parsedDuration) ? parsedDuration : 8;

    if (!prompt && !image) {
      res.status(400).json({ error: "请输入提示词或上传初始图片" });
      return;
    }

    if (!(await reserveStars(req, res, "video"))) return;
    await recordUsage(req, "video", { provider, model, aspectRatio, resolution, duration });

    // A. Simulation Mode Task Creation
    if (provider === "simulation") {
      const mockOpName = `mock_op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const taskRecord = videoTaskManager.register({
        taskId: mockOpName,
        operationName: mockOpName,
        provider: "simulation",
        model,
        prompt: prompt || "模拟生成视频",
        mode,
        aspectRatio,
        resolution,
        duration,
        status: "processing",
        progress: 10,
        stage: "模拟算力节点初始化中...",
      });

      res.json({
        success: true,
        provider: "simulation",
        taskId: taskRecord.taskId,
        operationName: taskRecord.operationName,
        status: "processing",
        progress: 10,
        stage: taskRecord.stage,
      });
      return;
    }

    // B. Google Veo Integration
    if (provider === "google-veo") {
      const ai = getGenAIClient(apiKey);
      if (!ai) {
        res.status(400).json({
          error: "尚未配置 Gemini API Key，请在顶部【接口配置】中设置正确的 API Key。",
        });
        return;
      }

      let imagePayload = undefined;
      if (image && image.data) {
        const cleanData = image.data.replace(/^data:image\/\w+;base64,/, "");
        imagePayload = {
          imageBytes: cleanData,
          mimeType: image.mimeType || "image/png",
        };
      }

      let finalPrompt = prompt || "";
      if (style) finalPrompt += `, ${style} style`;
      if (cameraMotion) finalPrompt += `, camera motion: ${cameraMotion}`;
      if (negativePrompt) finalPrompt += `. Avoid: ${negativePrompt}`;
      if (imagePayload) finalPrompt += `\n\n${PRODUCT_IDENTITY_RULES}\n\n${VIDEO_CONTINUITY_RULES}`;

      const selectedModel = model.includes("veo") ? model : "veo-3.1-lite-generate-preview";

      const config: any = {
        numberOfVideos: 1,
        resolution,
        aspectRatio: aspectRatio === "9:16" ? "9:16" : "16:9",
      };

      if (lastFrame && lastFrame.data) {
        config.lastFrame = {
          imageBytes: lastFrame.data.replace(/^data:image\/\w+;base64,/, ""),
          mimeType: lastFrame.mimeType || "image/png",
        };
      }

      const operation = await ai.models.generateVideos({
        model: selectedModel,
        prompt: finalPrompt,
        image: imagePayload,
        config,
      });

      const taskRecord = videoTaskManager.register({
        taskId: operation.name,
        operationName: operation.name,
        provider: "google-veo",
        model: selectedModel,
        prompt: prompt || "",
        mode,
        apiKey,
        aspectRatio,
        resolution,
        duration,
        status: "processing",
        progress: 10,
        stage: "任务已成功提交至 Google Veo 算力节点...",
      });

      res.json({
        success: true,
        provider: "google-veo",
        taskId: taskRecord.taskId,
        operationName: taskRecord.operationName,
        status: "processing",
        progress: 10,
        stage: taskRecord.stage,
      });
      return;
    }

    // C. REST API / YCVIP / Grok / Sora / Kling / MiniMax Integration
    const targetUrl = resolveVideoTargetUrl(provider, apiUrl);
    const isChatCompletionVideo = Boolean(targetUrl && /\/chat\/completions(?:$|\?)/i.test(targetUrl));
    const isYcvipMedia = provider === "ycvip-grok" || (targetUrl && targetUrl.includes("ycvip.net")) || model.includes("grok") || model.includes("sora") || model.includes("veo");
    const protectedVideoPrompt = image?.data
      ? `${prompt || "商品展示视频"}\n\n${PRODUCT_IDENTITY_RULES}\n\n${VIDEO_CONTINUITY_RULES}`
      : prompt;

    if (targetUrl) {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (apiKey) {
          headers["Authorization"] = `Bearer ${apiKey}`;
          headers["x-api-key"] = apiKey;
        }

        let payload: any;
        if (isChatCompletionVideo) {
          const chatContent = image?.data
            ? [
                { type: "text", text: protectedVideoPrompt || "生成商品展示视频" },
                { type: "image_url", image_url: { url: image.data } },
              ]
            : protectedVideoPrompt || "生成商品展示视频";
          payload = {
            model: model || "sora-2",
            messages: [{ role: "user", content: chatContent }],
            temperature: 0.7,
            stream: false,
          };
        } else if (isYcvipMedia) {
          payload = {
            model: model || "veo-3.1",
            prompt: protectedVideoPrompt,
            params: {
              aspect_ratio: aspectRatio,
              duration: String(duration),
              quality: "快速",
              resolution: resolution.toLowerCase(),
              mode: mode === "image-to-video" ? "reference" : "text-to-video",
              images: image && image.data ? [image.data] : [],
              audios: [],
              videos: [],
            }
          };
          payload.params.quality = "标准";
          if (mode === "text-to-video") {
            payload.params = {
              aspect_ratio: aspectRatio,
              duration,
            };
          }
        } else {
          payload = {
            model,
            prompt: protectedVideoPrompt,
            negative_prompt: negativePrompt,
            aspect_ratio: aspectRatio,
            resolution,
            duration,
            image_url: image ? image.data : undefined,
            camera_motion: cameraMotion,
          };
        }

        const targetRes = await fetchWithTimeout(targetUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        }, VIDEO_CREATE_TIMEOUT_MS);

        if (!targetRes.ok) {
          const errText = await targetRes.text();
          throw new Error(`上游接口创建失败 (${targetRes.status}): ${errText.slice(0, 200) || targetRes.statusText}`);
        }

        const data: any = await targetRes.json();
        const extractedUrl = extractVideoUrl(data);
        const taskName =
          extractTaskId(data) || data.id || data.task_id || data.operation_id || data.operationName || data.name || `task_${Date.now()}`;

        const statusStr = String(data.status || data.state || data.task_status || "").toLowerCase();
        const initialError = formatUpstreamError(data);
        const isInitialFailed =
          ["failed", "error", "fail", "rejected", "blocked", "unsafe"].includes(statusStr) ||
          data.failed === true ||
          data.success === false ||
          data.ok === false ||
          Boolean(initialError?.code);
        const isExplicitDone = ["completed", "success", "succeeded", "finished", "done"].includes(statusStr) || data.done === true;
        const isDirectVideoAvailable = !isInitialFailed && isExplicitDone && Boolean(extractedUrl);
        const isChatResponseMissingVideo = isChatCompletionVideo && !isInitialFailed && !extractedUrl;

        // Pre-determine status URL if ycvip or standard REST pattern
        let initialCachedStatusUrl = extractStatusUrl(data);
        if (initialCachedStatusUrl && initialCachedStatusUrl.startsWith("/")) {
          initialCachedStatusUrl = new URL(initialCachedStatusUrl, targetUrl).toString();
        }
        if (!initialCachedStatusUrl && isYcvipMedia && !isChatCompletionVideo) {
          initialCachedStatusUrl = `https://ycvip.net/v1/media/status/${taskName}`;
        }
        const initialErrorText = initialError
          ? `${initialError.code ? `${initialError.code}: ` : ""}${initialError.message}`
          : undefined;

        const taskRecord = videoTaskManager.register({
          taskId: taskName,
          operationName: taskName,
          provider: isYcvipMedia && !isChatCompletionVideo ? "ycvip-grok" : (provider || "custom"),
          model,
          prompt: protectedVideoPrompt || "",
          mode,
          apiUrl: targetUrl,
          apiKey,
          aspectRatio,
          resolution,
          duration,
          status: isInitialFailed || isChatResponseMissingVideo ? "failed" : isDirectVideoAvailable ? "completed" : "processing",
          progress: isInitialFailed || isChatResponseMissingVideo ? 0 : isDirectVideoAvailable ? 100 : 15,
          stage: isInitialFailed ? "上游任务创建失败" : isDirectVideoAvailable ? "上游生成已完成" : "已完成上游集群节点调度，正在生成关键帧...",
          videoUrl: isDirectVideoAvailable ? extractedUrl : undefined,
          error: isInitialFailed
            ? initialErrorText
            : isChatResponseMissingVideo
              ? "对话式视频接口已响应，但没有返回可播放的视频地址"
              : undefined,
          cachedStatusUrl: initialCachedStatusUrl,
          rawResponse: data,
        });

        res.json({
          success: true,
          provider: taskRecord.provider,
          taskId: taskRecord.taskId,
          operationName: taskRecord.operationName,
          status: taskRecord.status,
          progress: taskRecord.progress,
          stage: taskRecord.stage,
          error: taskRecord.error,
          directVideoUrl: isDirectVideoAvailable ? extractedUrl : undefined,
          rawResponse: data,
        });
      } catch (proxyErr: any) {
        console.error("Upstream API generate video error:", proxyErr);
        res.status(200).json({
          success: false,
          error: `调用上游 API 失败: ${proxyErr.message}`,
        });
      }
      return;
    }

    res.status(400).json({ error: "未知的服务商类型或缺少 API 接口配置" });
  } catch (err: any) {
    console.error("Generate video route error:", err);
    res.status(500).json({ error: err.message || "视频生成任务创建失败" });
  }
});

// 4.2 Query & Synchronize Video Status Route
app.post("/api/video-status", async (req, res) => {
  try {
    const { provider = "google-veo", operationName, taskId: reqTaskId, apiKey, apiUrl, progress: clientProgress } = req.body;
    // The upstream operation name is the canonical polling key. The client task ID is local UI state.
    const lookupId = operationName || reqTaskId;

    if (!lookupId) {
      res.status(400).json({ error: "缺少任务标识 (operationName 或 taskId)" });
      return;
    }

    // 1. Resolve or Register Task Record in Server State Manager
    let task = videoTaskManager.get(lookupId);
    if (!task) {
      task = videoTaskManager.register({
        taskId: lookupId,
        operationName: operationName || lookupId,
        provider: provider || "custom",
        apiKey,
        apiUrl,
        status: "processing",
        progress: Number(clientProgress) || 10,
        stage: "正在恢复并与上游节点进行同步...",
      });
    } else {
      // Update config if updated credentials provided by client
      if (apiKey) task.apiKey = apiKey;
      if (apiUrl) task.apiUrl = apiUrl;
    }

    // 2. Return cached terminal state if already completed or failed
    if (task.status === "completed" && task.videoUrl) {
      res.json({
        done: true,
        failed: false,
        progress: 100,
        stage: task.stage || "上游生成已完成",
        videoUrl: task.videoUrl,
        thumbnailUrl: task.thumbnailUrl,
      });
      return;
    }

    if (task.status === "failed") {
      res.json({
        done: false,
        failed: true,
        error: task.error || "上游生成失败",
        stage: task.stage || "任务执行异常",
      });
      return;
    }

    // 3. Deduplicate rapid polling requests (< 1000ms threshold)
    const now = Date.now();
    if (task.lastPolledAt && (now - task.lastPolledAt < 1000)) {
      res.json({
        done: task.status === "completed",
        failed: false,
        progress: task.progress,
        stage: task.stage,
        videoUrl: task.videoUrl,
        error: undefined,
      });
      return;
    }

    task.lastPolledAt = now;

    // A. Simulation Mode Sync
    if (task.provider === "simulation" || lookupId.startsWith("mock_op_")) {
      const elapsedSeconds = (now - task.createdAt) / 1000;
      if (elapsedSeconds < 10) {
        const prog = Math.min(98, Math.round((elapsedSeconds / 10) * 100));
        let stage = "正在构建 3D 神经网络潜空间...";
        if (prog > 30) stage = "正在生成关键帧光影与动作矢量...";
        if (prog > 60) stage = "正在进行帧间插值与平滑渲染...";
        if (prog > 85) stage = "正在合成高码率视频编码...";

        videoTaskManager.update(task.taskId, { progress: prog, stage });
        res.json({
          done: false,
          progress: prog,
          stage,
          elapsedSeconds: Math.round(elapsedSeconds),
        });
        return;
      }

      const mockVideos = [
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
      ];
      const selectedVideo = mockVideos[Math.abs(lookupId.length) % mockVideos.length];

      videoTaskManager.update(task.taskId, {
        status: "completed",
        progress: 100,
        stage: "视频生成完成！",
        videoUrl: selectedVideo,
        thumbnailUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80",
      });

      res.json({
        done: true,
        progress: 100,
        stage: "视频生成完成！",
        videoUrl: selectedVideo,
      });
      return;
    }

    // B. Google Veo Status Sync
    if (task.provider === "google-veo") {
      const ai = getGenAIClient(apiKey || task.apiKey);
      if (!ai) {
        res.status(400).json({ error: "缺少 Gemini API Key" });
        return;
      }

      const op = new GenerateVideosOperation();
      op.name = task.operationName;
      const updated = await ai.operations.getVideosOperation({ operation: op });

      if (updated.done) {
        if (updated.error) {
          const errMsg = String((updated.error as any)?.message || "Google Veo 渲染失败");
          videoTaskManager.update(task.taskId, {
            status: "failed",
            error: errMsg,
            stage: "Google Veo 任务失败",
          });
          res.json({
            done: false,
            failed: true,
            error: errMsg,
            stage: "Google Veo 任务失败",
          });
          return;
        }

        const videoObj = updated.response?.generatedVideos?.[0]?.video;
        const finalUrl = videoObj?.uri || `/api/video-download?operationName=${encodeURIComponent(task.operationName)}`;
        videoTaskManager.update(task.taskId, {
          status: "completed",
          progress: 100,
          hasExplicitProgress: true,
          stage: "Google Veo 渲染成功",
          videoUrl: finalUrl,
        });

        res.json({
          done: true,
          failed: false,
          progress: 100,
          hasExplicitProgress: true,
          stage: "Google Veo 渲染成功",
          videoUrl: finalUrl,
        });
      } else {
        videoTaskManager.update(task.taskId, {
          hasExplicitProgress: false,
          stage: "Google Veo 算力节点渲染中...",
        });

        res.json({
          done: false,
          failed: false,
          hasExplicitProgress: false,
          progress: task.progress || 0,
          stage: "Google Veo 算力节点渲染中...",
        });
      }
      return;
    }

    // C. REST API / YCVIP / Sora / Custom Provider Upstream Sync
    if (lookupId.startsWith("http://") || lookupId.startsWith("https://") || lookupId.startsWith("data:video/")) {
      videoTaskManager.update(task.taskId, {
        status: "completed",
        progress: 100,
        stage: "渲染完成",
        videoUrl: lookupId,
      });

      res.json({
        done: true,
        failed: false,
        progress: 100,
        stage: "渲染完成",
        videoUrl: lookupId,
      });
      return;
    }

    const targetApiUrl = resolveVideoTargetUrl(task.provider, apiUrl || task.apiUrl);
    if (!targetApiUrl) {
      res.json({
        done: false,
        failed: true,
        error: "缺少视频上游接口地址，请在接口配置中填写自定义地址",
      });
      return;
    }
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const effectiveKey = apiKey || task.apiKey;
    if (effectiveKey) {
      headers["Authorization"] = `Bearer ${effectiveKey}`;
      headers["x-api-key"] = effectiveKey;
    }

    const cleanBaseUrl = targetApiUrl.replace(/\/+$/, "");
    const parentBaseUrl = cleanBaseUrl
      .replace(/\/generate$/, "")
      .replace(/\/generations$/, "")
      .replace(/\/media$/, "")
      .replace(/\/videos$/, "/v1")
      .replace(/\/video$/, "/v1");

    let upstreamData: any = null;
    let successfulStatusUrl: string | undefined = task.cachedStatusUrl;

    // 1. Check cached status URL first if available
    if (successfulStatusUrl) {
      try {
        const statusRes = await fetchWithTimeout(successfulStatusUrl, { headers }, VIDEO_STATUS_REQUEST_TIMEOUT_MS);
        if (statusRes.ok) {
          const data: any = await statusRes.json();
          if (data && typeof data === "object" && !isInvalidRouteResponse(data)) {
            upstreamData = data;
          }
        }
      } catch (e) {
        // Cached URL failed, reset
        successfulStatusUrl = undefined;
      }
    }

    // 2. Build candidate endpoints in deterministic priority order if not found via cached URL
    if (!upstreamData) {
      const statusDeadline = Date.now() + VIDEO_STATUS_LOOKUP_DEADLINE_MS;
      const getCandidateUrls: string[] = [];

      // A. Special YCVIP / Grok / Sora endpoints
      if (task.provider === "ycvip-grok" || targetApiUrl.includes("ycvip.net")) {
        getCandidateUrls.push(
          `https://ycvip.net/v1/media/status/${task.operationName}`,
          `https://ycvip.net/v1/media/status?id=${encodeURIComponent(task.operationName)}`,
          `https://ycvip.net/v1/media/generate?id=${encodeURIComponent(task.operationName)}`
        );
      }

      // B. Standard OpenAPI / REST path parameters
      getCandidateUrls.push(
        `${cleanBaseUrl}/${task.operationName}`,
        `${cleanBaseUrl}/status/${task.operationName}`,
        `${cleanBaseUrl}/tasks/${task.operationName}`,
        `${cleanBaseUrl}/jobs/${task.operationName}`,
        `${cleanBaseUrl}/query/${task.operationName}`,
        `${parentBaseUrl}/tasks/${task.operationName}`,
        `${parentBaseUrl}/videos/${task.operationName}`,
        `${parentBaseUrl}/media/status/${task.operationName}`
      );

      // C. Query string parameters
      getCandidateUrls.push(
        `${cleanBaseUrl}?id=${encodeURIComponent(task.operationName)}`,
        `${cleanBaseUrl}?task_id=${encodeURIComponent(task.operationName)}`,
        `${cleanBaseUrl}/status?id=${encodeURIComponent(task.operationName)}`,
        `${cleanBaseUrl}/status?task_id=${encodeURIComponent(task.operationName)}`
      );

      for (const url of getCandidateUrls) {
        if (Date.now() >= statusDeadline) break;
        try {
          const statusRes = await fetchWithTimeout(url, { headers }, VIDEO_STATUS_REQUEST_TIMEOUT_MS);
          if (statusRes.ok) {
            const data: any = await statusRes.json();
            if (data && typeof data === "object" && !isInvalidRouteResponse(data)) {
              upstreamData = data;
              successfulStatusUrl = url;
              break;
            }
          }
        } catch (_) {}
      }

      // D. Try POST endpoints if GET candidates returned nothing
      if (!upstreamData && Date.now() < statusDeadline) {
        const postCandidates = [
          `${cleanBaseUrl}/query`,
          `${cleanBaseUrl}/status`,
          `${cleanBaseUrl}/detail`,
          `${parentBaseUrl}/media/status`,
          `${parentBaseUrl}/status`,
        ];

        for (const postUrl of postCandidates) {
          if (Date.now() >= statusDeadline) break;
          try {
            const statusRes = await fetchWithTimeout(postUrl, {
              method: "POST",
              headers,
              body: JSON.stringify({
                id: task.operationName,
                task_id: task.operationName,
                operation_id: task.operationName,
              }),
            }, VIDEO_STATUS_REQUEST_TIMEOUT_MS);
            if (statusRes.ok) {
              const data: any = await statusRes.json();
              if (data && typeof data === "object" && !isInvalidRouteResponse(data)) {
                upstreamData = data;
                successfulStatusUrl = postUrl;
                break;
              }
            }
          } catch (_) {}
        }
      }
    }

    // 3. Process matched upstream response
    if (upstreamData) {
      const data = upstreamData;
      const extractedUrl = extractVideoUrl(data);
      const rawStatus =
        data.status ??
        data.state ??
        data.task_status ??
        data.data?.status ??
        data.data?.state ??
        data.data?.task_status ??
        data.code;
      const statusStr = String(rawStatus || "").toLowerCase();
      const upstreamError = formatUpstreamError(data);
      const upstreamErrorCode = upstreamError?.code;
      const explicitErrorMessage =
        data.error ||
        data.fail_reason ||
        data.error_message ||
        data.data?.error ||
        data.data?.fail_reason ||
        data.data?.error_message;

      // Cache successful endpoint URL for subsequent polls
      if (successfulStatusUrl) {
        videoTaskManager.update(task.taskId, { cachedStatusUrl: successfulStatusUrl });
      }

      const isFailed =
        statusStr === "failed" ||
        statusStr === "error" ||
        statusStr === "fail" ||
        statusStr === "rejected" ||
        data.failed === true ||
        data.success === false ||
        data.ok === false ||
        Boolean(upstreamErrorCode) ||
        Boolean(explicitErrorMessage) ||
        Number(rawStatus) >= 400;

      if (isFailed) {
        const message = upstreamError?.message || data.message || data.msg || "上游渲染失败";
        const errMsg = upstreamErrorCode ? `${upstreamErrorCode}: ${message}` : message;
        videoTaskManager.update(task.taskId, {
          status: "failed",
          error: errMsg,
          stage: "上游任务执行异常",
        });

        res.json({
          done: false,
          failed: true,
          error: errMsg,
          stage: "上游任务执行异常",
          rawResponse: data,
        });
        return;
      }

      const isPendingOrProcessing =
        ["processing", "in_progress", "in-progress", "pending", "queued", "starting", "running", "waiting", "generating", "executing"].includes(statusStr) ||
        data.done === false ||
        data.completed === false ||
        data.data?.done === false ||
        data.data?.completed === false ||
        data.status === 1 ||
        data.data?.status === 1 ||
        data.state === "processing" ||
        data.data?.state === "processing";

      const isExplicitCompleted =
        ["completed", "success", "succeeded", "finished", "done"].includes(statusStr) ||
        data.done === true ||
        data.completed === true ||
        data.data?.done === true ||
        data.data?.completed === true;

      if (isExplicitCompleted && !extractedUrl) {
        const errMsg = "上游已返回完成状态，但没有返回可用的视频地址";
        videoTaskManager.update(task.taskId, {
          status: "failed",
          error: errMsg,
          stage: "上游完成但缺少视频地址",
        });
        res.json({
          done: false,
          failed: true,
          error: errMsg,
          stage: "上游完成但缺少视频地址",
          rawResponse: data,
        });
        return;
      }

      const isDone = !isPendingOrProcessing && (isExplicitCompleted || Boolean(extractedUrl));

      if (isDone && extractedUrl) {
        videoTaskManager.update(task.taskId, {
          status: "completed",
          progress: 100,
          hasExplicitProgress: true,
          stage: "上游生成已完成",
          videoUrl: extractedUrl,
        });

        res.json({
          done: true,
          failed: false,
          progress: 100,
          hasExplicitProgress: true,
          stage: "上游生成已完成",
          videoUrl: extractedUrl,
          rawResponse: data,
        });
        return;
      }

      // Parse numerical progress if explicitly returned by upstream
      let realProgress: number | undefined = undefined;
      let hasExplicitProgress = false;

      const rawProg =
        data.progress ??
        data.percentage ??
        data.task_progress ??
        data.data?.progress ??
        data.data?.percentage ??
        data.data?.task_progress;
      if (typeof rawProg === "number") {
        realProgress = Math.min(100, Math.max(0, Math.round(rawProg)));
        hasExplicitProgress = true;
      } else if (typeof rawProg === "string") {
        const parsed = parseFloat(rawProg.replace("%", ""));
        if (!isNaN(parsed)) {
          realProgress = Math.min(100, Math.max(0, Math.round(parsed)));
          hasExplicitProgress = true;
        }
      }

      const upstreamMsg = data.message || data.stage || rawStatus || data.data?.message || data.data?.stage || data.msg;
      const stageMsg = upstreamMsg ? `[上游节点] ${upstreamMsg}` : "与上游算力节点实时同步中...";
      const finalProg = realProgress !== undefined ? realProgress : (task.progress || 0);

      videoTaskManager.update(task.taskId, {
        progress: finalProg,
        hasExplicitProgress,
        stage: stageMsg,
      });

      res.json({
        done: false,
        failed: false,
        hasExplicitProgress,
        progress: finalProg,
        stage: stageMsg,
        rawResponse: data,
      });
      return;
    }

    // Fallback status when waiting for upstream data
    const stageMsg = "正在轮询与同步上游数据中...";

    videoTaskManager.update(task.taskId, {
      hasExplicitProgress: false,
      stage: stageMsg,
    });

    res.json({
      done: false,
      failed: false,
      hasExplicitProgress: false,
      progress: task.progress || 0,
      stage: stageMsg,
    });
  } catch (err: any) {
    console.error("Video status check error:", err);
    res.status(500).json({ error: err.message || "检查视频生成状态失败" });
  }
});

// Helper to check SSRF safety for video download URL proxy
function isSafeDownloadUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== "string") return false;
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();

    // Block localhost, internal hostnames, and metadata endpoints
    if (
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".lan") ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname === "::" ||
      hostname.includes("metadata")
    ) {
      return false;
    }

    // Parse IPv4 address variations (decimal, octal, hex)
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = hostname.match(ipv4Regex);
    if (match) {
      const [, p1, p2] = match.map(Number);
      if (p1 === 127) return false; // Loopback
      if (p1 === 10) return false;  // Private 10.0.0.0/8
      if (p1 === 172 && p2 >= 16 && p2 <= 31) return false; // Private 172.16.0.0/12
      if (p1 === 192 && p2 === 168) return false; // Private 192.168.0.0/16
      if (p1 === 169 && p2 === 254) return false; // Link-local / AWS/GCP Metadata
      if (p1 === 100 && p2 >= 64 && p2 <= 127) return false; // CGNAT
      if (p1 === 0) return false;
    }

    // Block integer / hex encoded loopback/private IPs
    if (/^(0x[0-9a-f]+|\d+)$/i.test(hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

// Safe fetch wrapper that handles redirects manually and validates every hop against SSRF rules
async function safeFetch(urlStr: string, options: RequestInit = {}, maxRedirects = 3): Promise<Response> {
  let currentUrl = urlStr;
  let redirects = 0;

  while (redirects <= maxRedirects) {
    if (!isSafeDownloadUrl(currentUrl)) {
      throw new Error("下载目标地址属于禁止访问的网络段 (SSRF拦截)");
    }

    const response = await fetch(currentUrl, {
      ...options,
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        return response;
      }
      const nextUrl = new URL(location, currentUrl).toString();
      if (!isSafeDownloadUrl(nextUrl)) {
        throw new Error("跳转目标地址属于禁止访问的网络段 (SSRF拦截)");
      }
      currentUrl = nextUrl;
      redirects++;
    } else {
      return response;
    }
  }

  throw new Error("HTTP 重定向次数过多");
}

// 6. Video Proxy Download Route (Avoid CORS for Veo & Remote URLs)
const handleVideoDownload = async (req: express.Request, res: express.Response) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }

  try {
    const videoUrl = (req.body?.videoUrl || req.query?.videoUrl || req.query?.url) as string | undefined;
    const operationName = (req.body?.operationName || req.query?.operationName) as string | undefined;
    
    // Safely extract API Key from Headers (x-api-key / Authorization) or body/query fallback
    const authHeader = req.headers["authorization"];
    const bearerKey = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : undefined;
    const headerKey = (req.headers["x-api-key"] as string) || bearerKey;
    const apiKey = headerKey || req.body?.apiKey || (req.query?.apiKey as string);

    let targetUrl = videoUrl;
    if (!targetUrl && typeof operationName === "string" && (operationName.startsWith("http://") || operationName.startsWith("https://"))) {
      targetUrl = operationName;
    }

    // SSRF validation if targetUrl is present
    if (targetUrl && !isSafeDownloadUrl(targetUrl)) {
      res.status(400).json({ error: "非法或受保护的网络下载地址 (SSRF拦截)" });
      return;
    }

    // If targetUrl is missing but operationName is a Veo operation name ("operations/...")
    if (!targetUrl && operationName && typeof operationName === "string" && operationName.startsWith("operations/")) {
      try {
        const ai = getGenAIClient(apiKey);
        if (ai) {
          const op = new GenerateVideosOperation();
          op.name = operationName;
          const updated = await ai.operations.getVideosOperation({ operation: op });
          const uri = updated.response?.generatedVideos?.[0]?.video?.uri;
          if (uri && isSafeDownloadUrl(uri)) {
            targetUrl = uri;
          }
        }
      } catch (e) {
        console.warn("Could not retrieve video URI from Veo operation:", e);
      }
    }

    // Fallback sample MP4 if simulation or missing URL
    if (!targetUrl && operationName && (operationName.startsWith("mock_op_") || operationName.includes("mock"))) {
      targetUrl = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
    }

    // A. Direct Video URL Proxy Download using safeFetch
    if (targetUrl && isSafeDownloadUrl(targetUrl)) {
      try {
        const effectiveKey = apiKey || process.env.GEMINI_API_KEY || "";
        const fetchHeaders: Record<string, string> = {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        };
        if (effectiveKey) {
          fetchHeaders["x-goog-api-key"] = effectiveKey;
          fetchHeaders["Authorization"] = `Bearer ${effectiveKey}`;
          fetchHeaders["x-api-key"] = effectiveKey;
        }

        let fetchUrl = targetUrl;
        if (effectiveKey && fetchUrl.includes("generativelanguage.googleapis.com") && !fetchUrl.includes("key=")) {
          fetchUrl += (fetchUrl.includes("?") ? "&" : "?") + `key=${encodeURIComponent(effectiveKey)}`;
        }

        const mediaRes = await safeFetch(fetchUrl, { headers: fetchHeaders });
        if (mediaRes.ok) {
          const contentType = mediaRes.headers.get("content-type") || "video/mp4";
          res.setHeader("Content-Type", contentType.includes("video") ? contentType : "video/mp4");
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="ai_video_${Date.now()}.mp4"`
          );
          
          const arrayBuffer = await mediaRes.arrayBuffer();
          res.setHeader("Content-Length", arrayBuffer.byteLength.toString());
          res.send(Buffer.from(arrayBuffer));
          return;
        }
      } catch (proxyErr: any) {
        console.warn("Direct video URL safeFetch failed:", proxyErr?.message || proxyErr);
      }
    }

    // B. Google Veo Operations Video Fetching
    if (operationName && typeof operationName === "string" && operationName.startsWith("operations/")) {
      try {
        const ai = getGenAIClient(apiKey);
        if (ai) {
          const op = new GenerateVideosOperation();
          op.name = operationName;
          const updated = await ai.operations.getVideosOperation({ operation: op });
          const uri = updated.response?.generatedVideos?.[0]?.video?.uri;

          if (uri && isSafeDownloadUrl(uri)) {
            const effectiveKey = apiKey || process.env.GEMINI_API_KEY;
            const videoRes = await safeFetch(uri, {
              headers: { "x-goog-api-key": effectiveKey || "" },
            });

            if (videoRes.ok) {
              res.setHeader("Content-Type", "video/mp4");
              res.setHeader(
                "Content-Disposition",
                `attachment; filename="veo_video_${Date.now()}.mp4"`
              );
              const arrayBuffer = await videoRes.arrayBuffer();
              res.setHeader("Content-Length", arrayBuffer.byteLength.toString());
              res.send(Buffer.from(arrayBuffer));
              return;
            }
          }
        }
      } catch (veoErr: any) {
        console.warn("Google Veo operation query failed (404/expired):", veoErr?.message || veoErr);
      }
    }

    res.status(404).json({
      error: "未查找到有效的视频资源，请确认生成已完成或网络地址正确。",
    });
  } catch (err: any) {
    console.error("Video download proxy error:", err);
    res.status(500).json({ error: err.message || "视频下载代理异常" });
  }
};

app.get("/api/video-download", handleVideoDownload);
app.post("/api/video-download", handleVideoDownload);

// 7. Vite / Production Fallback Handler
async function startServer() {
  if (isPersistentAuthEnabled) {
    await initializePersistentAuth();
  }
  // A local build may leave dist/ behind; only explicit production mode should serve it.
  const isProd = process.env.NODE_ENV === "production" && fs.existsSync(path.join(process.cwd(), "dist", "index.html"));

  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    // Support both Render's domain root and a static-hosting subpath such as /yun-studio.
    app.use(express.static(distPath, { index: false }));
    app.use("/yun-studio", express.static(distPath, { index: false }));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/") || path.extname(req.path)) {
        next();
        return;
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`VisionCraft Studio server running on http://0.0.0.0:${PORT}`);
  });
}

export { app };

if (!process.env.CLOUDBASE_FUNCTION) {
  startServer();
}
