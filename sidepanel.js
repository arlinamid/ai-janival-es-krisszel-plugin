/* global React, ReactDOM, lucide, LanguageModel */
const { useCallback, useEffect, useMemo, useRef, useState } = React;

const SUPPORTED_TEXT_LANGUAGES = ["en", "es", "ja"];
const KNOWLEDGE_FILES = ["database/posts-categorized.json"];
const MAX_CONTEXT_CHARS = 7000;
const DEFAULT_GROUP_POST_BASE =
  "https://www.facebook.com/groups/ai.janival.es.krisszel/posts/";
const APP_NAME = "AI - Janival és Krisszel";
const SCHEDULE_URL = "http://www.ai-janival-es-krisszel.hu/schedule.json";
const FBS_POSTS_KEY = "fbs.posts";
const FBS_CATS_KEY = "fbs.cats";
const DEFAULT_CATEGORY = "Általános";
const DEFAULT_SYSTEM_PROMPT =
  "You are a concise, helpful assistant. Answer in the user's language when possible.";
const STOP_WORDS = new Set([
  "a",
  "az",
  "egy",
  "és",
  "vagy",
  "hogy",
  "ha",
  "de",
  "is",
  "nem",
  "igen",
  "mint",
  "mert",
  "meg",
  "már",
  "majd",
  "csak",
  "ezt",
  "azt",
  "ez",
  "ki",
  "mi",
  "mit",
  "milyen",
  "melyik",
  "rola",
  "errol",
  "arrol",
  "alapjan",
  "posztok",
  "poszt",
  "posztol",
  "posztolt",
  "posztjai",
  "mikrol",
  "altalaban",
  "mondott",
  "ami",
  "amit",
  "aki",
  "akik",
  "van",
  "volt",
  "lesz",
  "lehet",
  "kell",
  "kellene",
  "the",
  "and",
  "or",
  "to",
  "of",
  "in",
  "for",
  "with",
  "on",
  "by",
  "from",
  "it",
  "this",
  "that"
]);
const HUNGARIAN_SUFFIXES = [
  "aitok",
  "eitek",
  "otok",
  "etek",
  "atok",
  "jei",
  "jai",
  "rol",
  "bol",
  "tol",
  "hoz",
  "hez",
  "ban",
  "ben",
  "nak",
  "nek",
  "val",
  "vel",
  "ert",
  "kent",
  "kor",
  "ig",
  "ra",
  "re",
  "ba",
  "be",
  "je",
  "ja",
  "ei",
  "ai",
  "on",
  "en",
  "ok",
  "ek",
  "ak",
  "ot",
  "et",
  "at"
];

const iconAttrMap = {
  class: "className",
  "stroke-width": "strokeWidth",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin"
};

function toReactAttrs(attrs) {
  return Object.fromEntries(
    Object.entries(attrs || {}).map(([key, value]) => [iconAttrMap[key] || key, value])
  );
}

function Icon({ name, size = 18, strokeWidth = 2, className = "" }) {
  const nodes = lucide?.icons?.[name];

  if (!nodes) {
    return null;
  }

  return React.createElement(
    "svg",
    {
      className: `icon ${className}`.trim(),
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true"
    },
    nodes.map(([tag, attrs], index) =>
      React.createElement(tag, { key: `${name}-${index}`, ...toReactAttrs(attrs) })
    )
  );
}

function buildLanguageOptions(outputLanguage) {
  return {
    expectedInputs: [{ type: "text", languages: SUPPORTED_TEXT_LANGUAGES }],
    expectedOutputs: [{ type: "text", languages: [outputLanguage] }]
  };
}

function formatError(error) {
  if (!error) {
    return "Ismeretlen hiba.";
  }

  return error.message ? `${error.name || "Error"}: ${error.message}` : String(error);
}

function storageKeyList(keys) {
  if (Array.isArray(keys)) {
    return keys;
  }

  if (typeof keys === "string") {
    return [keys];
  }

  return keys && typeof keys === "object" ? Object.keys(keys) : [];
}

function localStorageGet(keys) {
  const result = {};

  storageKeyList(keys).forEach((key) => {
    try {
      const raw = window.localStorage?.getItem(key);
      result[key] = raw ? JSON.parse(raw) : undefined;
    } catch {
      result[key] = undefined;
    }
  });

  return result;
}

function extensionStorageGet(keys) {
  return new Promise((resolve) => {
    if (!self.chrome?.storage?.local) {
      resolve(localStorageGet(keys));
      return;
    }

    chrome.storage.local.get(keys, resolve);
  });
}

function extensionStorageSet(values) {
  return new Promise((resolve) => {
    if (!self.chrome?.storage?.local) {
      Object.entries(values).forEach(([key, value]) => {
        window.localStorage?.setItem(key, JSON.stringify(value));
      });
      resolve();
      return;
    }

    chrome.storage.local.set(values, resolve);
  });
}

function normalizePostMap(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value.filter((post) => post?.id).map((post) => [String(post.id), post])
    );
  }

  return value && typeof value === "object" ? value : {};
}

async function getSavedPostMap() {
  const result = await extensionStorageGet(FBS_POSTS_KEY);
  return normalizePostMap(result[FBS_POSTS_KEY]);
}

async function setSavedPostMap(posts) {
  await extensionStorageSet({ [FBS_POSTS_KEY]: posts });
}

async function getSavedPosts() {
  const posts = Object.values(await getSavedPostMap());

  return posts.sort((a, b) => {
    return new Date(b.savedAt || 0).getTime() - new Date(a.savedAt || 0).getTime();
  });
}

async function getSavedCategories() {
  const result = await extensionStorageGet(FBS_CATS_KEY);
  const cats = Array.isArray(result[FBS_CATS_KEY]) ? result[FBS_CATS_KEY] : [];

  if (!cats.some((cat) => cat.name === DEFAULT_CATEGORY)) {
    const next = [{ name: DEFAULT_CATEGORY, createdAt: new Date().toISOString() }, ...cats];
    await extensionStorageSet({ [FBS_CATS_KEY]: next });
    return next;
  }

  return cats;
}

async function saveSavedCategory(name) {
  const cats = await getSavedCategories();

  if (cats.some((cat) => cat.name.toLowerCase() === name.toLowerCase())) {
    return;
  }

  await extensionStorageSet({
    [FBS_CATS_KEY]: [...cats, { name, createdAt: new Date().toISOString() }]
  });
}

async function deleteSavedCategory(name) {
  const cats = (await getSavedCategories()).filter((cat) => cat.name !== name);
  const posts = await getSavedPostMap();

  Object.values(posts).forEach((post) => {
    if (post.category === name) {
      post.category = DEFAULT_CATEGORY;
    }
  });

  await extensionStorageSet({ [FBS_CATS_KEY]: cats, [FBS_POSTS_KEY]: posts });
}

async function saveSavedPost(post) {
  const posts = await getSavedPostMap();
  const id = String(post.id || post.postId || extractPostIdFromUrl(post.url));

  if (!id) {
    throw new Error("Nem található posztazonosító.");
  }

  posts[id] = {
    ...post,
    id,
    url: post.url || getPostUrl({ postId: id }),
    category: post.category || DEFAULT_CATEGORY,
    savedAt: post.savedAt || new Date().toISOString()
  };

  await setSavedPostMap(posts);
}

async function deleteSavedPost(postId) {
  const posts = await getSavedPostMap();
  delete posts[String(postId)];
  await setSavedPostMap(posts);
}

async function updateSavedPostCategory(postId, category) {
  const posts = await getSavedPostMap();

  if (posts[postId]) {
    posts[postId] = { ...posts[postId], category };
    await setSavedPostMap(posts);
  }
}

// ─── IndexedDB – Chat session CRUD ───────────────────────────────────────────
const CHAT_DB_NAME = "fbs-chat-db";
const CHAT_DB_VERSION = 1;
const SESSIONS_STORE = "sessions";

function openChatDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CHAT_DB_NAME, CHAT_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        const store = db.createObjectStore(SESSIONS_STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAllSessions() {
  const db = await openChatDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, "readonly");
    const req = tx.objectStore(SESSIONS_STORE).index("createdAt").getAll();
    req.onsuccess = () => resolve((req.result || []).reverse());
    req.onerror = () => reject(req.error);
  });
}

async function dbSaveSession(session) {
  const db = await openChatDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, "readwrite");
    tx.objectStore(SESSIONS_STORE).put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDeleteSession(id) {
  const db = await openChatDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, "readwrite");
    tx.objectStore(SESSIONS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbGetLatestSession() {
  const all = await dbGetAllSessions();
  return all[0] || null;
}

function sessionTitle(messages) {
  const first = messages.find((m) => m.role === "user");
  return first ? String(first.content).slice(0, 60) : "Névtelen chat";
}

// ─────────────────────────────────────────────────────────────────────────────

function validateCategoryName(raw, existingNames = []) {
  const name = (raw || "").trim();

  if (!name) {
    return "A kategória neve nem lehet üres.";
  }

  if (name.length > 40) {
    return "A kategória neve max. 40 karakter lehet.";
  }

  if (!/[\p{L}\p{N}]/u.test(name)) {
    return "A kategória neve legalább egy betűt vagy számot tartalmazzon.";
  }

  const lower = name.toLowerCase();

  if (lower === "all") {
    return `A(z) "${name}" név foglalt.`;
  }

  if (existingNames.some((existing) => existing.toLowerCase() === lower)) {
    return `Már létezik "${name}" nevű kategória.`;
  }

  return null;
}

function extractPostIdFromUrl(url) {
  const value = String(url || "");
  let match;
  match = value.match(/\/permalink\/(\d+)/);
  if (match) return match[1];
  match = value.match(/\/posts\/(\d+)/);
  if (match) return match[1];
  match = value.match(/story_fbid=(\d+)/);
  if (match) return match[1];
  match = value.match(/set=gm\.(\d+)/);
  if (match) return match[1];
  match = value.match(/set=pcb\.(\d+)/);
  if (match) return match[1];
  match = value.match(/post_insights\/(\d+)/);
  if (match) return match[1];
  match = value.match(/\/reel\/(\d+)/);
  if (match) return match[1];
  match = value.match(/\/videos\/(\d+)/);
  if (match) return match[1];
  match = value.match(/[?&]v=(\d+)/);
  if (match) return match[1];
  return "";
}

const HU_MONTHS = {
  január:1,február:2,március:3,április:4,május:5,június:6,
  július:7,augusztus:8,szeptember:9,október:10,november:11,december:12
};

function parseHuPostDate(str) {
  if (!str) return NaN;
  const m = str.match(/(\d{4})\.\s+(\S+)\s+(\d{1,2})\.,\s+\S+,\s+(\d{1,2}):(\d{2})/);
  if (!m) return NaN;
  const month = HU_MONTHS[m[2].toLowerCase()];
  if (!month) return NaN;
  return new Date(+m[1], month - 1, +m[3], +m[4], +m[5]).getTime();
}

function recordTimestamp(record) {
  const fromPostDate = parseHuPostDate(record?.postDate);
  if (!Number.isNaN(fromPostDate)) return fromPostDate;
  return 0;
}

function formatDateTime(value) {
  const timestamp = typeof value === "number" ? value : Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return "";
  }

  return new Intl.DateTimeFormat("hu-HU", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function firstImage(record) {
  return Array.isArray(record?.images) && record.images.length ? record.images[0] : "";
}

async function loadLatestPosts() {
  const fileName = KNOWLEDGE_FILES[0];
  const url = self.chrome?.runtime?.getURL ? chrome.runtime.getURL(fileName) : fileName;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${fileName}: HTTP ${response.status}`);
  }

  const data = await response.json();

  return asRecordList(data)
    .map((record, index) => ({ ...record, __index: index }))
    .sort((a, b) => recordTimestamp(b) - recordTimestamp(a) || a.__index - b.__index);
}

function fetchSchedule() {
  return new Promise((resolve) => {
    if (self.chrome?.runtime?.sendMessage) {
      try {
        chrome.runtime.sendMessage(
          { type: "fetchSchedule", url: `${SCHEDULE_URL}?t=${Date.now()}` },
          (response) => resolve(response?.ok ? response.data : null)
        );
        return;
      } catch {
        resolve(null);
        return;
      }
    }

    fetch(SCHEDULE_URL)
      .then((response) => (response.ok ? response.json() : null))
      .then(resolve)
      .catch(() => resolve(null));
  });
}

const WEEKDAYS = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};

// Szerda: 19:00–22:00 = 3 óra | Vasárnap: 9:00–17:00 = 8 óra
const EVENT_DURATION_MS = {
  0: 8 * 60 * 60 * 1000,
  3: 3 * 60 * 60 * 1000
};
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;
const DAY_NAMES_HU = [
  "vasárnap",
  "hétfő",
  "kedd",
  "szerda",
  "csütörtök",
  "péntek",
  "szombat"
];

function generateRecurring(entry, days = 14) {
  const weekday = WEEKDAYS[String(entry.weekday || "").toLowerCase()];

  if (weekday === undefined || !entry.time || !entry.meetUrl) {
    return [];
  }

  const [hours, minutes] = entry.time.split(":").map(Number);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return [];
  }

  const durationMs = EVENT_DURATION_MS[weekday] ?? DEFAULT_DURATION_MS;
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    date.setHours(hours, minutes, 0, 0);
    if (date.getDay() !== weekday) return null;
    const startsAt = date.getTime();
    return { startsAt, endsAt: startsAt + durationMs, title: entry.title || "Előadás", meetUrl: entry.meetUrl };
  }).filter(Boolean);
}

function computeNextEvent(schedule) {
  if (!schedule) {
    return null;
  }

  const skip = new Set(schedule.skip || []);
  const events = [];

  (schedule.recurring || []).forEach((entry) => {
    generateRecurring(entry).forEach((event) => {
      const day = new Date(event.startsAt).toISOString().slice(0, 10);

      if (!skip.has(day)) {
        events.push(event);
      }
    });
  });

  (schedule.events || []).forEach((entry) => {
    if (!entry.datetime || !entry.meetUrl) {
      return;
    }

    const startsAt = new Date(entry.datetime).getTime();

    if (!Number.isNaN(startsAt)) {
      const durationMs = (entry.durationHours || 2) * 60 * 60 * 1000;
      events.push({ startsAt, endsAt: startsAt + durationMs, title: entry.title || "Esemény", meetUrl: entry.meetUrl });
    }
  });

  const now = Date.now();
  const next = events
    .filter((event) => event.endsAt > now)
    .sort((a, b) => a.startsAt - b.startsAt)[0] || null;

  if (!next) return null;
  return { ...next, isOngoing: next.startsAt <= now };
}

function formatEventTime(timestamp) {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMinutes = Math.round((date - now) / 60000);

  if (diffMinutes <= 0) {
    return "Most zajlik";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} perc múlva`;
  }

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const eventDay = new Date(date);
  eventDay.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((eventDay - today) / 86400000);
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;

  if (dayDiff === 0) return `Ma ${time}`;
  if (dayDiff === 1) return `Holnap ${time}`;
  if (dayDiff < 7) return `${DAY_NAMES_HU[date.getDay()]} ${time}`;

  return date.toLocaleString("hu-HU", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokenize(value) {
  return (
    normalizeText(value)
      .replace(/https?:\/\/\S+/g, " ")
      .match(/[a-z0-9]{2,}/g)
      ?.flatMap(expandToken)
      .map(normalizeToken)
      .filter((token) => !STOP_WORDS.has(token) && token.length <= 36) || []
  );
}

function expandToken(token) {
  if (token === "vibekoding" || token === "vibecoding" || token === "vibekodolas") {
    return [token, "vibe", "coding"];
  }

  return [token];
}

function normalizeToken(token) {
  for (const suffix of HUNGARIAN_SUFFIXES) {
    if (token.length > suffix.length + 3 && token.endsWith(suffix)) {
      return token.slice(0, -suffix.length);
    }
  }

  return token;
}

function cleanText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[A-Za-z0-9]{25,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isScrambledLine(str) {
  if (!str) return true;
  if (!/\s/.test(str) && str.length > 18) return true;
  const letters = (str.match(/[a-záéíóöőúüűA-ZÁÉÍÓÖŐÚÜŰ]/g) || []).length;
  return letters / str.length < 0.35;
}

function firstHeading(text) {
  const line = cleanText(text)
    .split("\n")
    .map((item) => item.replace(/[#*_`]/g, "").trim())
    .find((item) => item.length > 8 && !isScrambledLine(item));

  return line ? line.slice(0, 96) : "";
}

function asRecordList(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (data && typeof data === "object") {
    for (const key of ["posts", "items", "records", "data", "documents"]) {
      if (Array.isArray(data[key])) {
        return data[key];
      }
    }
  }

  return data ? [data] : [];
}

function recordToText(record) {
  if (!record || typeof record !== "object") {
    return cleanText(record);
  }

  const primary = record.text || record.content || record.body || record.description || "";

  if (primary) {
    return cleanText(primary);
  }

  return cleanText(JSON.stringify(record, null, 2));
}

function chunkText(text, maxChars = 1600, overlap = 180) {
  const cleaned = cleanText(text);

  if (!cleaned) {
    return [];
  }

  if (cleaned.length <= maxChars) {
    return [cleaned];
  }

  const chunks = [];
  let start = 0;

  while (start < cleaned.length) {
    let end = Math.min(start + maxChars, cleaned.length);
    const boundary = cleaned.lastIndexOf("\n\n", end);

    if (boundary > start + 600) {
      end = boundary;
    }

    chunks.push(cleaned.slice(start, end).trim());
    start = end >= cleaned.length ? cleaned.length : Math.max(end - overlap, 0);
  }

  return chunks.filter(Boolean);
}

function createDocuments(data, fileName) {
  const records = asRecordList(data);
  const documents = [];

  records.forEach((record, recordIndex) => {
    const text = recordToText(record);
    const chunks = chunkText(text);

    chunks.forEach((chunk, chunkIndex) => {
      const postId = record?.postId || record?.id || "";
      const title =
        record?.title ||
        record?.name ||
        firstHeading(text) ||
        "Cím nélkül";

      documents.push({
        id: `${fileName}:${postId || recordIndex}:${chunkIndex}`,
        title,
        text: chunk,
        fileName,
        recordIndex,
        chunkIndex,
        author: record?.author || "",
        postId,
        postDate: record?.postDate || record?.date || "",
        postUrl: record?.postUrl || record?.url || "",
        scrapedAt: record?.scrapedAt || "",
        category: record?.category || "",
        subcategory: record?.subcategory || "",
        images: record?.images || []
      });
    });
  });

  return documents;
}

function countTerms(tokens) {
  const counts = new Map();

  tokens.forEach((token) => {
    counts.set(token, (counts.get(token) || 0) + 1);
  });

  return counts;
}

function buildKnowledgeIndex(documents, files) {
  const df = new Map();
  const prepared = documents.map((document) => {
    const tokens = tokenize(`${document.title}\n${document.author}\n${document.text}`);
    const counts = countTerms(tokens);

    counts.forEach((_, token) => {
      df.set(token, (df.get(token) || 0) + 1);
    });

    return {
      ...document,
      counts,
      length: tokens.length,
      authorKey: normalizeText(document.author).trim(),
      authorTokens: tokenize(document.author)
    };
  });

  const total = Math.max(prepared.length, 1);
  const idf = new Map();

  df.forEach((docCount, token) => {
    idf.set(token, Math.log((1 + total) / (1 + docCount)) + 1);
  });

  const averageLength =
    prepared.reduce((sum, document) => sum + document.length, 0) / total || 1;

  const authors = buildAuthorIndex(prepared);

  return { documents: prepared, files, idf, averageLength, authors };
}

function buildAuthorIndex(documents) {
  const authors = new Map();

  documents.forEach((document) => {
    if (!document.authorKey) {
      return;
    }

    const existing = authors.get(document.authorKey);

    if (existing) {
      existing.count += 1;
      return;
    }

    authors.set(document.authorKey, {
      name: document.author,
      key: document.authorKey,
      tokens: document.authorTokens,
      count: 1
    });
  });

  return [...authors.values()].sort((a, b) => b.key.length - a.key.length);
}

async function loadKnowledgeBase() {
  const loaded = [];
  const documents = [];

  for (const fileName of KNOWLEDGE_FILES) {
    const url = self.chrome?.runtime?.getURL ? chrome.runtime.getURL(fileName) : fileName;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`${fileName}: HTTP ${response.status}`);
    }

    const data = await response.json();
    const fileDocuments = createDocuments(data, fileName);

    documents.push(...fileDocuments);
    loaded.push({ fileName, records: asRecordList(data).length, chunks: fileDocuments.length });
  }

  return buildKnowledgeIndex(documents, loaded);
}

function detectAuthor(index, query) {
  if (!index?.authors?.length || !query.trim()) {
    return null;
  }

  const normalizedQuery = normalizeText(query);
  const queryTokens = new Set(tokenize(query));
  let best = null;

  index.authors.forEach((author) => {
    let score = 0;

    if (normalizedQuery.includes(author.key)) {
      score = 100 + author.key.length;
    } else if (
      author.tokens.length >= 2 &&
      author.tokens.every((token) => queryTokens.has(token))
    ) {
      score = 70 + author.tokens.length;
    } else if (
      author.tokens.length === 1 &&
      queryTokens.has(author.tokens[0]) &&
      author.tokens[0].length >= 5
    ) {
      score = 30;
    }

    if (score && (!best || score > best.score)) {
      best = { ...author, score };
    }
  });

  return best;
}

function contentQueryWithoutAuthor(query, author) {
  if (!author) {
    return query;
  }

  const authorTokens = new Set(author.tokens);
  return tokenize(query)
    .filter((token) => !authorTokens.has(token))
    .join(" ");
}

function searchKnowledgeBase(index, query, limit, options = {}) {
  if (!index || (!query.trim() && !options.author)) {
    return [];
  }

  const queryTokens = tokenize(query);
  const queryTerms = [...new Set(queryTokens)];
  const queryPhrases = buildQueryPhrases(queryTokens);
  const authorKey = options.author?.key || "";
  const excludeKeys = options.excludeKeys || options.excludeIds || new Set();

  if (!queryTerms.length && !authorKey) {
    return [];
  }

  const k1 = 1.45;
  const b = 0.72;

  const ranked = index.documents
    .filter((document) => !excludeKeys.has(sourceKey(document)))
    .filter((document) => !authorKey || document.authorKey === authorKey)
    .map((document) => {
      let score = authorKey ? 1 : 0;

      queryTerms.forEach((token) => {
        const termFrequency = document.counts.get(token) || 0;

        if (!termFrequency) {
          return;
        }

        const idf = index.idf.get(token) || 0;
        const lengthPenalty =
          termFrequency +
          k1 * (1 - b + b * (document.length / index.averageLength));
        score += idf * ((termFrequency * (k1 + 1)) / lengthPenalty);
      });

      score += phraseBoost(document, queryPhrases);

      if (authorKey && queryTerms.length <= 1) {
        score += Math.min(cleanText(document.text).length / 900, 4);
      }

      return {
        ...document,
        score
      };
    })
    .filter((document) => document.score > (options.minScore ?? 0.35))
    .sort((a, b) => b.score - a.score);

  const results = [];
  const seen = new Set();

  for (const document of ranked) {
    const key = document.postId || document.postUrl || document.title || document.id;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    results.push(document);

    if (results.length >= limit) {
      break;
    }
  }

  return results;
}

function buildQueryPhrases(tokens) {
  const phrases = new Set();

  for (const size of [2, 3, 4]) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      const phrase = tokens.slice(index, index + size).join(" ");

      if (phrase.length > 5) {
        phrases.add(phrase);
      }
    }
  }

  return [...phrases];
}

function phraseBoost(document, phrases) {
  if (!phrases.length) {
    return 0;
  }

  const title = normalizeText(document.title);
  const text = normalizeText(document.text);
  let score = 0;

  phrases.forEach((phrase) => {
    if (title.includes(phrase)) {
      score += 6;
    } else if (text.includes(phrase)) {
      score += 3;
    }
  });

  return score;
}

function formatSource(source, index) {
  const postUrl = getPostUrl(source);
  const meta = [
    source.title,
    source.author ? `author: ${source.author}` : "",
    source.postDate ? `date: ${source.postDate}` : "",
    postUrl ? `url: ${postUrl}` : "",
    source.postId ? `postId: ${source.postId}` : ""
  ]
    .filter(Boolean)
    .join(" | ");

  return `[KB ${index + 1}] ${meta}\n${source.text}`;
}

function buildRagPrompt(question, sources, knowledgeEnabled) {
  if (!sources.length) {
    if (knowledgeEnabled) {
      return [
        "The knowledge base search returned no relevant context for this question.",
        "Answer in the same language as the user's question.",
        "Tell the user that the answer was not found in the knowledge base.",
        "",
        `User question: ${question}`
      ].join("\n");
    }

    return question;
  }

  let usedChars = 0;
  const context = [];

  sources.forEach((source, index) => {
    const formatted = formatSource(source, index);

    if (usedChars + formatted.length <= MAX_CONTEXT_CHARS) {
      context.push(formatted);
      usedChars += formatted.length;
    }
  });

  return [
    "Use the knowledge base context below to answer the user's question.",
    "Answer in the same language as the user's question.",
    "If the context contains relevant information, synthesize it directly instead of saying you do not know.",
    "If the context truly does not contain the answer, say that it is not in the knowledge base.",
    "Cite relevant sources inline as [KB 1], [KB 2], and include useful URLs when present.",
    "",
    "Knowledge base context:",
    context.join("\n\n---\n\n"),
    "",
    `User question: ${question}`
  ].join("\n");
}

function sourcePreview(source) {
  return cleanText(source.text).slice(0, 180);
}

function formatScore(score) {
  if (score >= 100) {
    return "99+";
  }

  return score >= 10 ? score.toFixed(1) : score.toFixed(2);
}

function getPostUrl(source) {
  if (source.postUrl || source.url) {
    return source.postUrl || source.url;
  }

  const postId = source.postId || source.id;
  return postId ? `${DEFAULT_GROUP_POST_BASE}${postId}/` : "";
}

function openPostUrl(url) {
  if (!url) {
    return;
  }

  if (self.chrome?.tabs?.update) {
    try {
      chrome.tabs.update({ url }, () => {
        if (chrome.runtime.lastError) {
          window.location.assign(url);
        }
      });
      return;
    } catch (error) {
      console.warn("Could not navigate active tab:", error);
    }
  }

  window.location.assign(url);
}

function queryActiveTab() {
  return new Promise((resolve) => {
    if (!self.chrome?.tabs?.query) {
      resolve(null);
      return;
    }

    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs?.[0] || null);
      });
    } catch {
      resolve(null);
    }
  });
}

function sourceKey(source) {
  return source.postId || source.postUrl || `${source.author}:${source.title}` || source.id;
}

function yieldToUi() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function isFollowUpQuestion(prompt) {
  const normalized = normalizeText(prompt);

  return /\b(rola|errol|arrol|annak|ennek|elozo|korabbi|forras|forrasok)\b/.test(
    normalized
  );
}

function buildRetrievalQuery(prompt, history, index, forceHistory = false) {
  const promptAuthor = detectAuthor(index, prompt);

  if (!forceHistory && (promptAuthor || !isFollowUpQuestion(prompt))) {
    return prompt;
  }

  const recentUserQuestions = history
    .filter((message) => message.role === "user")
    .slice(-2)
    .map((message) => message.content)
    .join("\n");
  const recentSourceHints = history
    .flatMap((message) => message.sources || [])
    .slice(-5)
    .map(
      (source) =>
        `${source.author ? `author: ${source.author}\n` : ""}${source.title}\n${sourcePreview(source)}`
    )
    .join("\n");

  return [prompt, recentUserQuestions, recentSourceHints].filter(Boolean).join("\n");
}

function isRetryRequest(prompt) {
  return /\b(nem relevans|nem jo|rossz talalat|keress ujra|ujrakeres|masik forras|mas forras)\b/.test(
    normalizeText(prompt)
  );
}

function previousSourceIds(history) {
  return new Set(
    history.flatMap((message) => message.sources || []).map((source) => sourceKey(source))
  );
}

function hasWeakResults(results) {
  return !results.length || results[0].score < 1.4;
}

function createSearchPlan(index, prompt, history, limit) {
  const retry = isRetryRequest(prompt);
  const promptAuthor = detectAuthor(index, prompt);
  const shouldUseHistory = retry || (!promptAuthor && isFollowUpQuestion(prompt));
  const baseQuery = buildRetrievalQuery(prompt, history, index, shouldUseHistory);
  const author = promptAuthor || detectAuthor(index, baseQuery);
  const keywords = chooseSearchKeywords(index, baseQuery, author, limit);
  const keywordQuery = keywords.join(" ");
  const searchQuery = keywordQuery || contentQueryWithoutAuthor(baseQuery, author);

  return {
    author,
    baseQuery,
    keywords,
    retry,
    shouldUseHistory,
    searchQuery,
    excludeKeys: retry ? previousSourceIds(history) : new Set()
  };
}

function chooseSearchKeywords(index, query, author, limit) {
  const authorTokens = new Set(author?.tokens || []);
  const counts = countTerms(
    tokenize(query).filter((token) => !authorTokens.has(token))
  );
  const scored = [];

  counts.forEach((count, token) => {
    const idf = index?.idf?.get(token) || 0;
    const usefulUnknown = idf === 0 && token.length >= 5;

    if (!idf && !usefulUnknown) {
      return;
    }

    scored.push({
      token,
      score: (idf || 0.5) * (1 + Math.log(count))
    });
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(3, Math.min(limit + 2, 8)))
    .map((item) => item.token);
}

function retrieveKnowledgeSources(index, prompt, history, limit) {
  const steps = [];
  const plan = createSearchPlan(index, prompt, history, limit);
  const { author, retry, searchQuery } = plan;

  steps.push({
    label: "Kérdés elemzése",
    detail: retry
      ? "Újrakeresési szándék érzékelve, korábbi források kizárva."
      : plan.shouldUseHistory
        ? "Valódi follow-up kérdés, előző forrásjelek bevonva."
        : "Új keresési terv, előző kontextus nélkül."
  });

  steps.push({
    label: "Keresési kulcsszavak",
    detail: plan.keywords.length ? plan.keywords.join(", ") : "Nincs külön kulcsszó; author-filteres áttekintés."
  });

  if (author) {
    steps.push({
      label: "Szerző felismerése",
      detail: `${author.name} (${author.count} indexelt chunk)`
    });
    const authorResults = searchKnowledgeBase(index, searchQuery, limit, {
      author,
      excludeKeys: plan.excludeKeys,
      minScore: 0
    });

    if (authorResults.length) {
      steps.push({
        label: "Author-filteres keresés",
        detail: `${authorResults.length} találat, csak ${author.name} posztjai közül.`
      });
      return { sources: authorResults, steps };
    }

    steps.push({
      label: "Author-filteres keresés",
      detail: "Nem volt elég találat, általános újrakeresés következik."
    });
  }

  const primary = searchKnowledgeBase(index, searchQuery || plan.baseQuery, limit, {
    excludeKeys: plan.excludeKeys
  });
  steps.push({
    label: "Elsődleges KB keresés",
    detail: primary.length
      ? `${primary.length} találat, legerősebb score: ${formatScore(primary[0].score)}.`
      : "Nincs találat."
  });

  if (!hasWeakResults(primary)) {
    return { sources: primary, steps };
  }

  const expandedQuery = [searchQuery, plan.baseQuery]
    .filter(Boolean)
    .join("\n")
    .replace(/\s+/g, " ");

  const fallback = searchKnowledgeBase(index, expandedQuery, limit, {
    excludeKeys: plan.excludeKeys,
    minScore: 0
  });

  steps.push({
    label: "Smart újrakeresés",
    detail: fallback.length
      ? `${fallback.length} fallback találat kiválasztva.`
      : "Fallback keresés sem talált releváns kontextust."
  });

  return { sources: fallback, steps };
}

function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [chatSessionId, setChatSessionId] = useState(() => crypto.randomUUID());
  const [chatSessions, setChatSessions] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [status, setStatus] = useState("Ellenőrzés...");
  const [notice, setNotice] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [modelAvailable, setModelAvailable] = useState(false);
  const [streaming, setStreaming] = useState(true);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [outputLanguage, setOutputLanguage] = useState("en");
  const [sampling, setSampling] = useState({
    available: false,
    temperature: 1,
    maxTemperature: 2,
    topK: 3,
    maxTopK: 128
  });
  const [knowledgeSettings, setKnowledgeSettings] = useState({
    enabled: true,
    topK: 5,
    thinkingMode: true
  });
  const [knowledgeMeta, setKnowledgeMeta] = useState({
    status: "loading",
    documents: 0,
    chunks: 0,
    files: [],
    error: ""
  });
  const [latestPosts, setLatestPosts] = useState({
    status: "loading",
    records: [],
    error: ""
  });
  const [nextEvent, setNextEvent] = useState({
    status: "loading",
    event: null,
    error: ""
  });

  const sessionRef = useRef(null);
  const abortRef = useRef(null);
  const sessionKeyRef = useRef("");
  const scrollRef = useRef(null);
  const knowledgeRef = useRef(null);

  const languageOptions = useMemo(
    () => buildLanguageOptions(outputLanguage),
    [outputLanguage]
  );

  const resetSession = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.destroy();
    }

    sessionRef.current = null;
    sessionKeyRef.current = "";
  }, []);

  const checkAvailability = useCallback(async () => {
    if (!("LanguageModel" in self)) {
      setModelAvailable(false);
      setNotice(
        "A LanguageModel API nem érhető el. Chrome 138+ desktop böngésző és beépített AI támogatás szükséges."
      );
      setStatus("Nem elérhető.");
      return;
    }

    try {
      const availability = await LanguageModel.availability(languageOptions);
      setStatus(`Modell állapota: ${availability}`);
      setModelAvailable(availability !== "unavailable");
      setNotice(
        availability === "unavailable"
          ? "A beépített modell ezen a gépen nem érhető el. Ellenőrizd a Chrome verziót, a tárhelyet és a hardverkövetelményeket."
          : ""
      );
    } catch (error) {
      setModelAvailable(false);
      setStatus("Nem elérhető.");
      setNotice(`Nem sikerült ellenőrizni a modellt: ${formatError(error)}`);
    }
  }, [languageOptions]);

  useEffect(() => {
    checkAvailability();
  }, [checkAvailability]);

  useEffect(() => {
    async function loadSamplingDefaults() {
      if (!("LanguageModel" in self) || typeof LanguageModel.params !== "function") {
        return;
      }

      try {
        const params = await LanguageModel.params();
        setSampling({
          available: true,
          temperature: params.defaultTemperature,
          maxTemperature: params.maxTemperature,
          topK: Math.min(params.defaultTopK, params.maxTopK),
          maxTopK: params.maxTopK
        });
      } catch (error) {
        console.warn("Sampling parameters are not available:", error);
      }
    }

    loadSamplingDefaults();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateKnowledgeBase() {
      try {
        const index = await loadKnowledgeBase();

        if (cancelled) {
          return;
        }

        knowledgeRef.current = index;
        setKnowledgeMeta({
          status: "ready",
          documents: index.files.reduce((sum, file) => sum + file.records, 0),
          chunks: index.documents.length,
          files: index.files,
          error: ""
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        knowledgeRef.current = null;
        setKnowledgeMeta({
          status: "error",
          documents: 0,
          chunks: 0,
          files: [],
          error: formatError(error)
        });
      }
    }

    hydrateKnowledgeBase();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateLatestPosts() {
      try {
        const records = await loadLatestPosts();

        if (!cancelled) {
          setLatestPosts({ status: "ready", records, error: "" });
        }
      } catch (error) {
        if (!cancelled) {
          setLatestPosts({ status: "error", records: [], error: formatError(error) });
        }
      }
    }

    hydrateLatestPosts();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSchedule() {
      const schedule = await fetchSchedule();

      if (!cancelled) {
        setNextEvent({
          status: schedule ? "ready" : "empty",
          event: computeNextEvent(schedule),
          error: ""
        });
      }
    }

    hydrateSchedule().catch((error) => {
      if (!cancelled) {
        setNextEvent({ status: "error", event: null, error: formatError(error) });
      }
    });

    // Badge frissítése a background service worker-ben
    try { chrome.runtime.sendMessage({ type: "refreshBadge" }); } catch {}

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages, isBusy]);

  useEffect(() => resetSession, [resetSession]);

  // Legutóbbi session betöltése induláskor
  useEffect(() => {
    dbGetLatestSession().then((s) => {
      if (s && s.messages?.length) {
        setChatSessionId(s.id);
        setMessages(s.messages);
      }
    }).catch(() => {});
    dbGetAllSessions().then(setChatSessions).catch(() => {});
  }, []);

  // Auto-save: minden üzenetlista-változáskor menti a sessiont
  useEffect(() => {
    if (!messages.length) return;
    const session = {
      id: chatSessionId,
      createdAt: new Date().toISOString(),
      title: sessionTitle(messages),
      messages
    };
    dbSaveSession(session)
      .then(() => dbGetAllSessions().then(setChatSessions))
      .catch(() => {});
  }, [messages, chatSessionId]);

  async function getSession(signal) {
    const sessionKey = JSON.stringify({
      systemPrompt,
      outputLanguage,
      temperature: sampling.available ? sampling.temperature : null,
      topK: sampling.available ? sampling.topK : null
    });

    if (sessionRef.current && sessionKeyRef.current === sessionKey) {
      return sessionRef.current;
    }

    resetSession();
    setStatus("Munkamenet indítása...");

    const options = {
      ...languageOptions,
      signal,
      monitor(monitorTarget) {
        monitorTarget.addEventListener("downloadprogress", (event) => {
          setStatus(`Modell letöltése: ${Math.round(event.loaded * 100)}%`);
        });
      }
    };

    if (systemPrompt.trim()) {
      options.initialPrompts = [{ role: "system", content: systemPrompt.trim() }];
    }

    if (sampling.available) {
      options.temperature = Number(sampling.temperature);
      options.topK = Number(sampling.topK);
    }

    sessionRef.current = await LanguageModel.create(options);
    sessionKeyRef.current = sessionKey;
    return sessionRef.current;
  }

  function updateAssistantMessage(id, content, state = "streaming") {
    setMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, content, state } : message
      )
    );
  }

  async function sendPrompt() {
    const prompt = draft.trim();

    if (!prompt || !modelAvailable || isBusy) {
      return;
    }

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt
    };
    const assistantId = crypto.randomUUID();

    setDraft("");
    setIsBusy(true);
    setNotice("");
    setMessages((current) => [
      ...current,
      userMessage,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        state: "streaming",
        ragStatus: knowledgeSettings.enabled ? "loading" : "off",
        thinkingSteps: knowledgeSettings.thinkingMode
          ? [
              {
                label: "Smart RAG",
                detail: "Kérdés fogadva, kontextuskeresés indul."
              }
            ]
          : []
      }
    ]);

    abortRef.current = new AbortController();

    try {
      await yieldToUi();
      const retrieval =
        knowledgeSettings.enabled && knowledgeMeta.status === "ready"
          ? retrieveKnowledgeSources(
              knowledgeRef.current,
              prompt,
              messages,
              knowledgeSettings.topK
            )
          : {
              sources: [],
              steps: [
                {
                  label: "Knowledge base",
                  detail: knowledgeSettings.enabled
                    ? "Az index még nem áll készen."
                    : "A knowledge base ki van kapcsolva."
                }
              ]
            };
      const { sources, steps } = retrieval;
      const promptForModel = buildRagPrompt(prompt, sources, knowledgeSettings.enabled);

      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                sources,
                ragStatus: sources.length ? "ready" : "empty",
                thinkingSteps: knowledgeSettings.thinkingMode ? steps : []
              }
            : message
        )
      );

      const session = await getSession(abortRef.current.signal);

      if (streaming && typeof session.promptStreaming === "function") {
        const stream = session.promptStreaming(promptForModel, {
          signal: abortRef.current.signal
        });
        let previousChunk = "";
        let accumulated = "";

        for await (const chunk of stream) {
          const text = String(chunk);

          if (text.startsWith(previousChunk)) {
            accumulated += text.slice(previousChunk.length);
            previousChunk = text;
          } else {
            accumulated += text;
            previousChunk += text;
          }

          updateAssistantMessage(assistantId, accumulated);
        }

        updateAssistantMessage(assistantId, accumulated, "done");
      } else {
        const result = await session.prompt(promptForModel, {
          signal: abortRef.current.signal
        });
        updateAssistantMessage(assistantId, result, "done");
      }

      setStatus("Kész.");
    } catch (error) {
      if (error.name === "AbortError") {
        updateAssistantMessage(assistantId, "Megállítva.", "stopped");
        setStatus("Megállítva.");
      } else {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? { ...message, ragStatus: "error", content: formatError(error), state: "error" }
              : message
          )
        );
        setStatus("Hiba történt.");
      }

      resetSession();
    } finally {
      abortRef.current = null;
      setIsBusy(false);
    }
  }

  function stopPrompt() {
    abortRef.current?.abort();
  }

  function clearChat() {
    abortRef.current?.abort();
    resetSession();
    setMessages([]);
    setChatSessionId(crypto.randomUUID());
    setStatus(modelAvailable ? "Chat törölve." : status);
  }

  function loadChatSession(session) {
    abortRef.current?.abort();
    resetSession();
    setChatSessionId(session.id);
    setMessages(session.messages || []);
    setShowHistory(false);
    setActiveTab("chat");
  }

  async function deleteChatSession(id) {
    await dbDeleteSession(id);
    const updated = await dbGetAllSessions();
    setChatSessions(updated);
    if (id === chatSessionId) clearChat();
  }

  function updateSettings(updater) {
    updater();
    resetSession();
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendPrompt();
    }
  }

  const canSend = modelAvailable && draft.trim() && !isBusy;

  return React.createElement(
    "main",
    { className: "chat-shell" },
    React.createElement(Header, {
      status,
      activeTab,
      isBusy,
      onClear: clearChat,
      onSettings: () => setIsSettingsOpen(true),
      onHistory: () => { setShowHistory((v) => !v); setActiveTab("chat"); },
      canClear: messages.length > 0 || Boolean(sessionRef.current),
      hasHistory: chatSessions.length > 0
    }),
    showHistory
      ? React.createElement(SessionHistoryPanel, {
          sessions: chatSessions,
          currentId: chatSessionId,
          onLoad: loadChatSession,
          onDelete: deleteChatSession,
          onClose: () => setShowHistory(false)
        })
      : null,
    notice
      ? React.createElement(
          "section",
          { className: "notice" },
          React.createElement(Icon, { name: "TriangleAlert", size: 17 }),
          React.createElement("span", null, notice)
        )
      : null,
    React.createElement(TabBar, { activeTab, onTabChange: setActiveTab }),
    activeTab === "home"
      ? React.createElement(HomePage, { latestPosts, nextEvent, knowledgeRef })
      : null,
    activeTab === "tools"
      ? React.createElement(PluginToolsPage, { nextEvent })
      : null,
    activeTab === "chat"
      ? React.createElement(
          React.Fragment,
          null,
          React.createElement(MessageList, { messages, scrollRef }),
          React.createElement(Composer, {
            draft,
            isBusy,
            canSend,
            modelAvailable,
            onDraftChange: setDraft,
            onKeyDown: handleKeyDown,
            onSend: sendPrompt,
            onStop: stopPrompt
          })
        )
      : null,
    activeTab === "chat"
      ? React.createElement(SettingsDrawer, {
          open: isSettingsOpen,
          onClose: () => setIsSettingsOpen(false),
          status,
          streaming,
          setStreaming: (value) => updateSettings(() => setStreaming(value)),
          systemPrompt,
          setSystemPrompt: (value) => updateSettings(() => setSystemPrompt(value)),
          outputLanguage,
          setOutputLanguage: (value) => updateSettings(() => setOutputLanguage(value)),
          sampling,
          setSampling: (value) => updateSettings(() => setSampling(value)),
          knowledgeSettings,
          setKnowledgeSettings: (value) =>
            updateSettings(() => setKnowledgeSettings(value)),
          knowledgeMeta,
          onRecheck: checkAvailability,
          onClear: clearChat
        })
      : null
  );
}

function TabBar({ activeTab, onTabChange }) {
  const tabs = [
    { id: "home", label: "Friss posztok", icon: "Newspaper" },
    { id: "tools", label: "Mentett posztok", icon: "BookmarkCheck" },
    { id: "chat", label: "AI chat", icon: "MessageSquareText" }
  ];

  return React.createElement(
    "nav",
    { className: "tab-bar", "aria-label": "Sidebar nézetek" },
    tabs.map((tab) =>
      React.createElement(
        "button",
        {
          key: tab.id,
          type: "button",
          className: `tab-button ${activeTab === tab.id ? "active" : ""}`,
          onClick: () => onTabChange(tab.id)
        },
        React.createElement(Icon, { name: tab.icon, size: 16 }),
        React.createElement("span", null, tab.label)
      )
    )
  );
}

function EventBanner({ nextEvent, compact = false }) {
  if (nextEvent.status === "loading") {
    return React.createElement(
      "section",
      { className: `event-banner ${compact ? "compact" : ""}` },
      React.createElement(Icon, { name: "CalendarClock", size: 18 }),
      React.createElement(
        "div",
        null,
        React.createElement("strong", null, "Események betöltése"),
        React.createElement("span", null, "A csatlakozási sáv hamarosan frissül.")
      )
    );
  }

  if (!nextEvent.event) {
    return React.createElement(
      "section",
      { className: `event-banner muted ${compact ? "compact" : ""}` },
      React.createElement(Icon, { name: "Calendar", size: 18 }),
      React.createElement(
        "div",
        null,
        React.createElement("strong", null, "Nincs közelgő esemény"),
        React.createElement("span", null, "A schedule.json jelenleg nem adott következő alkalmat.")
      )
    );
  }

  const { event } = nextEvent;
  const ongoing = event.isOngoing;

  return React.createElement(
    "section",
    { className: `event-banner ${compact ? "compact" : ""} ${ongoing ? "live" : ""}` },
    React.createElement(Icon, { name: ongoing ? "Radio" : "CalendarClock", size: 18 }),
    React.createElement(
      "div",
      null,
      React.createElement(
        "strong",
        null,
        ongoing
          ? React.createElement(
              React.Fragment,
              null,
              React.createElement("span", { className: "live-dot" }),
              " LIVE – ",
              event.title
            )
          : event.title
      ),
      React.createElement(
        "span",
        null,
        ongoing ? formatEventTime(event.startsAt) : formatEventTime(event.startsAt)
      )
    ),
    React.createElement(
      "button",
      {
        type: "button",
        className: "primary-action",
        onClick: () => openPostUrl(event.meetUrl)
      },
      React.createElement(Icon, { name: "LogIn", size: 15 }),
      React.createElement("span", null, ongoing ? "Belépés" : "Csatlakozás")
    )
  );
}

// ─── Tabloid constants ────────────────────────────────────────────────────────
const FOUNDERS = [
  { name: "Rózsavölgyi János", role: "Alapító", short: "Közösségünk egyik szellemi atyja, az AI mozgalom elindítója." },
  { name: "Kőhalmi Krisztián", role: "Alapító", short: "Az AI világ szenvedélyes kutatója és gyakorlati alkalmazója." },
  { name: "Katschthaler Gabi", role: "Alapító", short: "A csoport kreatív hajtóereje és szervező lelke." }
];

const CATEGORY_COLORS = {
  "Hírek":    "#e3061b",
  "Eszköz":   "#2563eb",
  "Alkotás":  "#7c3aed",
  "Oktatás":  "#059669",
  "Kérdés":   "#d97706",
  "Vita":     "#ea580c",
  "Egyéb":    "#64748b"
};

const CATEGORY_MAP = {
  HIREK:   "Hírek",
  ESZKOZ:  "Eszköz",
  ALKOTAS: "Alkotás",
  OKTATÁS: "Oktatás",
  KERDES:  "Kérdés",
  VITA:    "Vita",
  EGYEB:   "Egyéb"
};

const SUBCATEGORY_MAP = {
  AJÁNLÁS:      "Ajánlás",
  BEMUTATKOZAS: "Bemutatkozás",
  CEGEK:        "Cégek",
  ELOADAS:      "Előadás",
  FILOZOFIA:    "Filozófia",
  KERDES_SUB:   "Kérdés",
  KUTATÁS:      "Kutatás",
  MEDIA:        "Média",
  MISC:         "Vegyes",
  NAGY_MODEL:   "Nagy modell",
  PROJEKT:      "Projekt",
  PROMPT:       "Prompt",
  TANANYAG:     "Tananyag",
  TOOL_BEMUTATO:"Tool bemutató",
  VELEMENY:     "Vélemény",
  WORKFLOW:     "Workflow"
};

const ALL_CATEGORIES = ["Mind", ...Object.keys(CATEGORY_COLORS)];

// ─── Tabloid helpers ──────────────────────────────────────────────────────────
function categorizeRecord(record) {
  return CATEGORY_MAP[record?.category] || "Egyéb";
}

function nameInitials(name) {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

function nameColor(name) {
  const palette = ["#e3061b","#0f766e","#1e40af","#9333ea","#c2410c","#0e7490","#be185d"];
  let h = 0;
  for (const c of name) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
  return palette[Math.abs(h) % palette.length];
}

// ─── BreakingTicker ───────────────────────────────────────────────────────────
function BreakingTicker({ event }) {
  if (!event?.isOngoing) return null;
  const text = `${event.title} — csatlakozz most!`;
  return React.createElement(
    "div",
    { className: "breaking-ticker" },
    React.createElement("span", { className: "breaking-label" }, "🔴 LIVE"),
    React.createElement(
      "div",
      { className: "breaking-marquee-wrap" },
      React.createElement("span", { className: "breaking-marquee" }, `${text}  •  ${text}  •  `)
    ),
    React.createElement(
      "button",
      { type: "button", className: "breaking-join", onClick: () => openPostUrl(event.meetUrl) },
      "Belépés"
    )
  );
}

// ─── HeroCarousel ─────────────────────────────────────────────────────────────
function HeroCarousel({ posts }) {
  const slides = posts.filter((r) => firstImage(r)).slice(0, 6);
  const [idx, setIdx] = useState(0);
  const touchX = useRef(null);

  const prev = () => setIdx((i) => (i - 1 + slides.length) % slides.length);
  const next = () => setIdx((i) => (i + 1) % slides.length);

  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(next, 4500);
    return () => clearInterval(t);
  }, [slides.length]);

  if (!slides.length) return null;
  const slide = slides[idx];
  const title = firstHeading(recordToText(slide)) || "Cím nélkül";
  const cat = categorizeRecord(slide);
  const url = getPostUrl(slide);
  const when = formatDateTime(parseHuPostDate(slide.postDate)) || formatDateTime(slide.scrapedAt) || "";

  return React.createElement(
    "div",
    {
      className: "hero-carousel",
      onTouchStart: (e) => { touchX.current = e.touches[0].clientX; },
      onTouchEnd: (e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 40) dx > 0 ? prev() : next();
        touchX.current = null;
      }
    },
    React.createElement("img", { className: "hero-img", src: firstImage(slide), alt: "", key: idx }),
    React.createElement(
      "div",
      { className: "hero-overlay" },
      React.createElement(
        "span",
        { className: "hero-badge", style: { background: CATEGORY_COLORS[cat] || "#e3061b" } },
        cat
      ),
      React.createElement("h2", { className: "hero-title" }, title),
      React.createElement(
        "div",
        { className: "hero-meta" },
        slide.author ? React.createElement("span", null, slide.author) : null,
        when ? React.createElement("span", null, when) : null
      )
    ),
    slides.length > 1
      ? React.createElement("button", { className: "hero-nav prev", onClick: (e) => { e.stopPropagation(); prev(); }, "aria-label": "Előző" }, "‹")
      : null,
    slides.length > 1
      ? React.createElement("button", { className: "hero-nav next", onClick: (e) => { e.stopPropagation(); next(); }, "aria-label": "Következő" }, "›")
      : null,
    url ? React.createElement(
      "button",
      { className: "hero-open", onClick: () => openPostUrl(url) },
      React.createElement(Icon, { name: "ExternalLink", size: 13 }), " Megnyitás"
    ) : null,
    slides.length > 1
      ? React.createElement(
          "div",
          { className: "hero-dots" },
          slides.map((_, i) =>
            React.createElement("button", {
              key: i, className: `hero-dot ${i === idx ? "active" : ""}`,
              onClick: () => setIdx(i), "aria-label": `${i + 1}. dia`
            })
          )
        )
      : null
  );
}

// ─── FoundersSection ──────────────────────────────────────────────────────────
function FoundersSection() {
  return React.createElement(
    "section",
    { className: "tabloid-section founders-section" },
    React.createElement(
      "div",
      { className: "tabloid-section-header" },
      React.createElement("span", null, "ALAPÍTÓK")
    ),
    React.createElement(
      "div",
      { className: "founders-row" },
      FOUNDERS.map((f) =>
        React.createElement(
          "div",
          { key: f.name, className: "founder-card" },
          React.createElement(
            "div",
            { className: "founder-avatar", style: { background: nameColor(f.name) } },
            nameInitials(f.name)
          ),
          React.createElement("div", { className: "founder-name" }, f.name),
          React.createElement("div", { className: "founder-role" }, f.role),
          React.createElement("p", { className: "founder-bio" }, f.short)
        )
      )
    )
  );
}

// ─── TrendingSection ──────────────────────────────────────────────────────────
function TrendingSection({ posts }) {
  const top = posts.slice(0, 5);
  if (!top.length) return null;
  return React.createElement(
    "section",
    { className: "tabloid-section trending-section" },
    React.createElement(
      "div",
      { className: "tabloid-section-header" },
      React.createElement("span", null, "LEGFELKAPOTTABB")
    ),
    React.createElement(
      "ol",
      { className: "trending-list", role: "list" },
      top.map((r, i) => {
        const title = firstHeading(recordToText(r)) || "Cím nélkül";
        const url = getPostUrl(r);
        const cat = categorizeRecord(r);
        return React.createElement(
          "li",
          { key: r.postId || i, className: "trending-item", role: "listitem" },
          React.createElement("span", { className: "trending-num" }, i + 1),
          React.createElement(
            "button",
            { type: "button", className: "trending-btn", onClick: () => url && openPostUrl(url) },
            React.createElement("span", { className: "trending-cat", style: { color: CATEGORY_COLORS[cat] || "#e3061b" } }, cat),
            React.createElement("span", { className: "trending-title" }, title)
          )
        );
      })
    )
  );
}

// ─── CategoryBar ──────────────────────────────────────────────────────────────
function CategoryBar({ active, onChange }) {
  return React.createElement(
    "div",
    { className: "category-filter-bar", role: "tablist", "aria-label": "Kategória szűrő" },
    ALL_CATEGORIES.map((cat) =>
      React.createElement(
        "button",
        {
          key: cat,
          type: "button",
          role: "tab",
          "aria-selected": active === cat,
          className: `cat-pill ${active === cat ? "active" : ""}`,
          style: active === cat && cat !== "Mind"
            ? { background: CATEGORY_COLORS[cat], borderColor: CATEGORY_COLORS[cat] }
            : {},
          onClick: () => onChange(cat)
        },
        cat
      )
    )
  );
}

// ─── TabloidsPostCard ─────────────────────────────────────────────────────────
function TabloidsPostCard({ record }) {
  const text = recordToText(record);
  const title = firstHeading(text) || "Cím nélkül";
  const image = firstImage(record);
  const url = getPostUrl(record);
  const when = formatDateTime(parseHuPostDate(record.postDate)) || formatDateTime(record.scrapedAt) || "";
  const cat = categorizeRecord(record);
  const color = CATEGORY_COLORS[cat] || "#64748b";
  const subcat = SUBCATEGORY_MAP[record.subcategory] || null;

  return React.createElement(
    "article",
    { className: "tabloid-card", style: { borderLeftColor: color } },
    React.createElement(
      "div",
      { className: "tabloid-card-thumb" },
      image
        ? React.createElement("img", { src: image, alt: "", loading: "lazy" })
        : React.createElement("div", { className: "tabloid-card-thumb-placeholder" },
            React.createElement(Icon, { name: "FileText", size: 20 }))
    ),
    React.createElement(
      "div",
      { className: "tabloid-card-body" },
      React.createElement(
        "div",
        { className: "tabloid-cat-row" },
        React.createElement("span", { className: "tabloid-cat-label", style: { color } }, cat),
        subcat ? React.createElement("span", { className: "tabloid-subcat-label" }, subcat) : null
      ),
      React.createElement("h3", { className: "tabloid-card-title" }, title),
      React.createElement(
        "div",
        { className: "tabloid-card-meta" },
        record.author ? React.createElement("span", null, record.author) : null,
        when ? React.createElement("span", null, when) : null
      )
    ),
    url
      ? React.createElement(
          "button",
          { type: "button", className: "tabloid-card-link", onClick: () => openPostUrl(url), "aria-label": `Megnyitás: ${title}` },
          React.createElement(Icon, { name: "ChevronRight", size: 16 })
        )
      : null
  );
}

// ─── TabloidFooter ────────────────────────────────────────────────────────────
function TabloidFooter() {
  return React.createElement(
    "footer",
    { className: "tabloid-footer" },
    React.createElement(
      "div",
      { className: "tabloid-footer-brand" },
      React.createElement("span", { className: "tabloid-footer-logo" }, APP_NAME)
    ),
    React.createElement("p", { className: "tabloid-footer-tagline" }, "A magyar AI közösség hírportálja"),
    React.createElement(
      "div",
      { className: "tabloid-footer-links" },
      React.createElement("a", { href: "https://www.facebook.com/groups/ai.janival.es.krisszel", target: "_blank", rel: "noopener noreferrer" }, "Facebook csoport"),
      React.createElement("span", { "aria-hidden": "true" }, "·"),
      React.createElement("a", { href: "mailto:janos.rozsavolgyi2@gmail.com" }, "Kapcsolat")
    ),
    React.createElement("p", { className: "tabloid-footer-copy" }, `© ${new Date().getFullYear()} ${APP_NAME}`)
  );
}

// ─── HomePage (Tabloid) ───────────────────────────────────────────────────────
function HomePage({ latestPosts, nextEvent, knowledgeRef }) {
  const [activeCategory, setActiveCategory] = useState("Mind");
  const [searchQuery, setSearchQuery] = useState("");

  const records = latestPosts.records || [];
  const annotated = records.map((r) => ({ ...r, _cat: categorizeRecord(r) }));

  const filtered = (() => {
    if (searchQuery.trim() && knowledgeRef?.current) {
      const results = searchKnowledgeBase(knowledgeRef.current, searchQuery, 150, { minScore: 0.1 });
      const bm25 = results.map((r) => ({ ...r, _cat: categorizeRecord(r) }));
      return activeCategory !== "Mind" ? bm25.filter((r) => r._cat === activeCategory) : bm25;
    }
    return annotated.filter((r) =>
      activeCategory === "Mind" || r._cat === activeCategory
    );
  })();

  return React.createElement(
    "section",
    { className: "tab-page tabloid-page" },
    React.createElement(BreakingTicker, { event: nextEvent.event }),
    latestPosts.status === "ready"
      ? React.createElement(HeroCarousel, { posts: annotated })
      : null,
    React.createElement(FoundersSection),
    latestPosts.status === "ready"
      ? React.createElement(TrendingSection, { posts: annotated })
      : null,
    React.createElement(
      "section",
      { className: "tabloid-section feed-section" },
      React.createElement(
        "div",
        { className: "tabloid-section-header" },
        React.createElement("span", null, "POSZTOK")
      ),
      React.createElement(CategoryBar, {
        active: activeCategory,
        onChange: (cat) => { setActiveCategory(cat); setSearchQuery(""); }
      }),
      React.createElement(
        "div",
        { className: "tabloid-search-wrap" },
        React.createElement(Icon, { name: "Search", size: 14 }),
        React.createElement("input", {
          type: "search",
          placeholder: "Keresés a posztokban…",
          value: searchQuery,
          onChange: (e) => setSearchQuery(e.target.value)
        })
      ),
      latestPosts.status === "loading"
        ? React.createElement("p", { className: "panel-empty" }, "Posztok betöltése…")
        : null,
      latestPosts.status === "error"
        ? React.createElement("p", { className: "panel-empty error" }, latestPosts.error)
        : null,
      latestPosts.status === "ready" && !filtered.length
        ? React.createElement("p", { className: "panel-empty" }, "Nincs találat.")
        : null,
      latestPosts.status === "ready"
        ? React.createElement(
            "div",
            { className: "tabloid-feed" },
            filtered.map((r) =>
              React.createElement(TabloidsPostCard, { key: r.postId || r.__index, record: r })
            )
          )
        : null
    ),
    React.createElement(TabloidFooter)
  );
}

function PluginToolsPage({ nextEvent }) {
  const [posts, setPosts] = useState([]);
  const [cats, setCats] = useState([]);
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState("all");
  const [feedback, setFeedback] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [newCatName, setNewCatName] = useState("");
  const [showNewCatForm, setShowNewCatForm] = useState(false);
  const [confirmDeleteCat, setConfirmDeleteCat] = useState(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const [nextPosts, nextCats] = await Promise.all([getSavedPosts(), getSavedCategories()]);
    setPosts(nextPosts);
    setCats(nextCats);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();

    if (!self.chrome?.storage?.onChanged) {
      return undefined;
    }

    const listener = (changes, area) => {
      if (area === "local" && (changes[FBS_POSTS_KEY] || changes[FBS_CATS_KEY])) {
        refresh();
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [refresh]);

  const filteredPosts = useMemo(() => {
    const normalizedQuery = normalizeText(query);

    return posts.filter((post) => {
      const matchesCategory = activeCat === "all" || (post.category || DEFAULT_CATEGORY) === activeCat;
      const haystack = normalizeText(
        `${post.title || ""} ${post.snippet || ""} ${post.author || ""} ${post.url || ""}`
      );

      return matchesCategory && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [posts, query, activeCat]);

  async function saveActiveTab() {
    if (!self.chrome?.tabs?.query) {
      setFeedback("Az aktív lap mentése csak betöltött Chrome extensionként működik.");
      return;
    }

    const tab = await queryActiveTab();
    const postId = extractPostIdFromUrl(tab?.url || "");

    if (!postId) {
      setFeedback("Az aktív lapból nem tudtam Facebook posztazonosítót kiolvasni.");
      return;
    }

    await saveSavedPost({
      id: postId,
      url: getPostUrl({ postId }),
      title: cleanText(tab.title || `Facebook poszt ${postId}`).slice(0, 180),
      snippet: cleanText(tab.title || ""),
      category: activeCat !== "all" ? activeCat : DEFAULT_CATEGORY
    });

    setFeedback("Aktív Facebook poszt elmentve.");
    refresh();
  }

  function openNewCatForm() {
    setNewCatName("");
    setConfirmDeleteCat(null);
    setShowNewCatForm(true);
  }

  async function submitNewCategory() {
    const name = newCatName.trim();
    const error = validateCategoryName(name, cats.map((cat) => cat.name));
    if (error) { setFeedback(error); return; }
    await saveSavedCategory(name);
    setActiveCat(name);
    setFeedback(`Kategória létrehozva: ${name}`);
    setNewCatName("");
    setShowNewCatForm(false);
    refresh();
  }

  function removeCategory(name) {
    setShowNewCatForm(false);
    setConfirmDeleteCat(name);
  }

  async function confirmDeleteCategory() {
    const name = confirmDeleteCat;
    setConfirmDeleteCat(null);
    await deleteSavedCategory(name);
    setActiveCat("all");
    setFeedback(`Kategória törölve: ${name}`);
    refresh();
  }

  function exportPosts() {
    const blob = new Blob([JSON.stringify(posts, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const anchor = Object.assign(document.createElement("a"), {
      href: url,
      download: `ai-jani-krisz-mentett-posztok-${new Date().toISOString().slice(0, 10)}.json`
    });

    anchor.click();
    URL.revokeObjectURL(url);
  }

  return React.createElement(
    "section",
    { className: "tab-page tools-page" },
    React.createElement(EventBanner, { nextEvent, compact: true }),
    React.createElement(
      "div",
      { className: "section-heading" },
      React.createElement(
        "div",
        null,
        React.createElement("h2", null, "AI-Jani-Krisz plugin funkciók"),
        React.createElement("p", null, `${posts.length} mentett poszt, ${cats.length} kategória`)
      ),
      React.createElement(Icon, { name: "BookmarkCheck", size: 18 })
    ),
    React.createElement(
      "div",
      { className: "tools-toolbar" },
      React.createElement(
        "label",
        { className: "search-field" },
        React.createElement(Icon, { name: "Search", size: 15 }),
        React.createElement("input", {
          value: query,
          placeholder: "Keresés mentett posztokban...",
          onChange: (event) => setQuery(event.target.value)
        })
      ),
      React.createElement(
        "div",
        { className: "toolbar-actions" },
        React.createElement(
          "button",
          { type: "button", onClick: saveActiveTab },
          React.createElement(Icon, { name: "Plus", size: 15 }),
          React.createElement("span", null, "Aktív lap")
        ),
        React.createElement(
          "button",
          { type: "button", onClick: openNewCatForm },
          React.createElement(Icon, { name: "FolderPlus", size: 15 }),
          React.createElement("span", null, "Kategória")
        ),
        React.createElement(
          "button",
          { type: "button", onClick: exportPosts, disabled: !posts.length },
          React.createElement(Icon, { name: "Download", size: 15 }),
          React.createElement("span", null, "Export")
        )
      )
    ),
    feedback ? React.createElement("p", { className: "tool-feedback" }, feedback) : null,
    showNewCatForm
      ? React.createElement(
          "div",
          { className: "inline-cat-form" },
          React.createElement("input", {
            type: "text",
            autoFocus: true,
            placeholder: "Kategória neve...",
            value: newCatName,
            onChange: (e) => setNewCatName(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") submitNewCategory();
              if (e.key === "Escape") setShowNewCatForm(false);
            }
          }),
          React.createElement(
            "button",
            { type: "button", className: "primary", onClick: submitNewCategory },
            "Mentés"
          ),
          React.createElement(
            "button",
            { type: "button", onClick: () => setShowNewCatForm(false) },
            "Mégse"
          )
        )
      : null,
    confirmDeleteCat
      ? React.createElement(
          "div",
          { className: "inline-confirm" },
          React.createElement(
            "span",
            null,
            `Törlöd a „${confirmDeleteCat}" kategóriát? A posztok az Általánosba kerülnek.`
          ),
          React.createElement(
            "button",
            { type: "button", className: "danger", onClick: confirmDeleteCategory },
            "Törlés"
          ),
          React.createElement(
            "button",
            { type: "button", onClick: () => setConfirmDeleteCat(null) },
            "Mégse"
          )
        )
      : null,
    React.createElement(
      "div",
      { className: "category-tabs" },
      React.createElement(
        "button",
        {
          type: "button",
          className: activeCat === "all" ? "active" : "",
          onClick: () => setActiveCat("all")
        },
        "Összes"
      ),
      cats.map((cat) =>
        React.createElement(
          "button",
          {
            key: cat.name,
            type: "button",
            className: activeCat === cat.name ? "active" : "",
            onClick: () => setActiveCat(cat.name)
          },
          React.createElement("span", null, cat.name),
          cat.name !== DEFAULT_CATEGORY
            ? React.createElement(
                "span",
                {
                  role: "button",
                  tabIndex: 0,
                  className: "category-delete",
                  title: "Kategória törlése",
                  onClick: (event) => {
                    event.stopPropagation();
                    removeCategory(cat.name);
                  }
                },
                "×"
              )
            : null
        )
      )
    ),
    isLoading
      ? React.createElement("p", { className: "panel-empty" }, "Mentések betöltése...")
      : null,
    !isLoading && !filteredPosts.length
      ? React.createElement(
          "div",
          { className: "tool-empty" },
          React.createElement(Icon, { name: "Bookmark", size: 26 }),
          React.createElement("strong", null, "Nincs megjeleníthető mentés"),
          React.createElement(
            "span",
            null,
            "Facebookon a csillag gombbal, vagy itt az Aktív lap gombbal tudsz posztot menteni."
          )
        )
      : null,
    filteredPosts.length
      ? React.createElement(
          "div",
          { className: "saved-post-list" },
          filteredPosts.map((post) =>
            React.createElement(SavedPostCard, {
              key: post.id,
              post,
              cats,
              onCategoryChange: async (category) => {
                await updateSavedPostCategory(post.id, category);
                refresh();
              },
              onDelete: async () => {
                await deleteSavedPost(post.id);
                setFeedback("Mentés törölve.");
                refresh();
              }
            })
          )
        )
      : null
  );
}

function SavedPostCard({ post, cats, onCategoryChange, onDelete }) {
  const url = getPostUrl(post);

  async function copyUrl() {
    await navigator.clipboard.writeText(url);
  }

  return React.createElement(
    "article",
    { className: "saved-post-card" },
    React.createElement(
      "div",
      { className: "saved-post-main" },
      React.createElement(
        "div",
        { className: "post-meta" },
        React.createElement("span", null, post.author || `#${post.id}`),
        post.savedAt ? React.createElement("span", null, formatDateTime(post.savedAt)) : null
      ),
      React.createElement("h3", null, post.title || `Facebook poszt ${post.id}`),
      post.snippet ? React.createElement("p", null, post.snippet) : null
    ),
    React.createElement(
      "div",
      { className: "saved-actions" },
      React.createElement(
        "button",
        { type: "button", title: "Megnyitás", disabled: !url, onClick: () => openPostUrl(url) },
        React.createElement(Icon, { name: "ExternalLink", size: 15 })
      ),
      React.createElement(
        "button",
        { type: "button", title: "URL másolása", disabled: !url, onClick: copyUrl },
        React.createElement(Icon, { name: "Copy", size: 15 })
      ),
      React.createElement(
        "button",
        { type: "button", title: "Törlés", onClick: onDelete },
        React.createElement(Icon, { name: "Trash2", size: 15 })
      )
    ),
    React.createElement(
      "select",
      {
        value: post.category || DEFAULT_CATEGORY,
        onChange: (event) => onCategoryChange(event.target.value)
      },
      cats.map((cat) =>
        React.createElement("option", { key: cat.name, value: cat.name }, cat.name)
      )
    )
  );
}

function SessionHistoryPanel({ sessions, currentId, onLoad, onDelete, onClose }) {
  return React.createElement(
    "section",
    { className: "session-history" },
    React.createElement(
      "div",
      { className: "session-history-header" },
      React.createElement(Icon, { name: "History", size: 15 }),
      React.createElement("span", null, "Chat előzmények"),
      React.createElement(
        "button",
        { type: "button", className: "icon-button", onClick: onClose },
        React.createElement(Icon, { name: "X", size: 15 })
      )
    ),
    sessions.length === 0
      ? React.createElement("p", { className: "panel-empty" }, "Nincs mentett chat.")
      : sessions.map((s) =>
          React.createElement(
            "div",
            {
              key: s.id,
              className: `session-item ${s.id === currentId ? "active" : ""}`
            },
            React.createElement(
              "button",
              { type: "button", className: "session-load", onClick: () => onLoad(s) },
              React.createElement("strong", null, s.title),
              React.createElement(
                "span",
                null,
                new Intl.DateTimeFormat("hu-HU", {
                  month: "short", day: "numeric",
                  hour: "2-digit", minute: "2-digit"
                }).format(new Date(s.createdAt))
              )
            ),
            React.createElement(
              "button",
              {
                type: "button",
                className: "icon-button danger",
                title: "Törlés",
                onClick: () => onDelete(s.id)
              },
              React.createElement(Icon, { name: "Trash2", size: 14 })
            )
          )
        )
  );
}

function Header({ status, activeTab, isBusy, onClear, onSettings, onHistory, canClear, hasHistory }) {
  return React.createElement(
    "header",
    { className: "app-header" },
    React.createElement(
      "div",
      { className: "brand" },
      React.createElement(
        "div",
        { className: "brand-mark" },
        React.createElement("img", { src: "icon.png", alt: "" })
      ),
      React.createElement(
        "div",
        null,
        React.createElement("h1", null, APP_NAME),
        React.createElement(
          "p",
          null,
          activeTab === "chat" ? status : "Side panel integráció aktív."
        )
      )
    ),
    React.createElement(
      "div",
      { className: "header-actions" },
      React.createElement(
        "button",
        {
          className: "icon-button",
          type: "button",
          title: "Előzmények",
          disabled: activeTab !== "chat" || !hasHistory,
          onClick: onHistory
        },
        React.createElement(Icon, { name: "History", size: 17 })
      ),
      React.createElement(
        "button",
        {
          className: "icon-button",
          type: "button",
          title: "Chat törlése",
          disabled: activeTab !== "chat" || isBusy || !canClear,
          onClick: onClear
        },
        React.createElement(Icon, { name: "Trash2", size: 17 })
      ),
      React.createElement(
        "button",
        {
          className: "icon-button",
          type: "button",
          title: "Beállítások",
          disabled: activeTab !== "chat",
          onClick: onSettings
        },
        React.createElement(Icon, { name: "SlidersHorizontal", size: 18 })
      )
    )
  );
}

function MessageList({ messages, scrollRef }) {
  if (!messages.length) {
    return React.createElement(
      "section",
      { className: "empty-state" },
      React.createElement(
        "div",
        { className: "empty-orbit" },
        React.createElement(Icon, { name: "MessageSquareText", size: 28 })
      ),
      React.createElement("h2", null, "Kérdezz a Chrome helyi modelljétől"),
      React.createElement(
        "p",
        null,
        "A beszélgetés itt jelenik meg. A válasz streamelve érkezik, ha a böngésződ támogatja."
      )
    );
  }

  return React.createElement(
    "section",
    { className: "messages", ref: scrollRef },
    messages.map((message) =>
      React.createElement(ChatMessage, { key: message.id, message })
    )
  );
}

function ChatMessage({ message }) {
  const isAssistant = message.role === "assistant";

  async function copyMessage() {
    await navigator.clipboard.writeText(message.content);
  }

  return React.createElement(
    "article",
    { className: `message-row ${message.role}` },
    React.createElement(
      "div",
      { className: "avatar" },
      React.createElement(Icon, { name: isAssistant ? "Bot" : "User", size: 17 })
    ),
    React.createElement(
      "div",
      { className: "message-card" },
      React.createElement(
        "div",
        { className: "message-meta" },
        React.createElement("span", null, isAssistant ? "Chrome AI" : "Te"),
        isAssistant && message.state === "streaming"
          ? React.createElement("span", { className: "pulse" }, "stream")
          : null
      ),
      isAssistant && message.content
        ? React.createElement("div", {
            className: `message-content markdown ${message.state || ""}`,
            dangerouslySetInnerHTML: {
              __html: self.marked
                ? self.marked.parse(message.content, { breaks: true, gfm: true })
                : message.content.replace(/\n/g, "<br>")
            }
          })
        : React.createElement(
            "div",
            { className: `message-content ${message.state || ""}` },
            message.content || React.createElement("span", { className: "typing" }, "")
          ),
      isAssistant ? React.createElement(ThinkingPanel, { message }) : null,
      isAssistant ? React.createElement(SourcesPanel, { message }) : null,
      isAssistant && message.content
        ? React.createElement(
            "button",
            {
              className: "copy-button",
              type: "button",
              title: "Másolás",
              onClick: copyMessage
            },
            React.createElement(Icon, { name: "Copy", size: 14 })
          )
        : null
    )
  );
}

function LoadingGlyph() {
  return React.createElement(
    "span",
    { className: "agent-glyph", "aria-hidden": "true" },
    React.createElement("span", null, "."),
    React.createElement("span", null, "·"),
    React.createElement("span", null, ":")
  );
}

function ThinkingPanel({ message }) {
  const steps = message.thinkingSteps || [];
  const isLoading = message.ragStatus === "loading";

  if (!steps.length && !isLoading) {
    return null;
  }

  return React.createElement(
    "details",
    {
      className: `thinking-panel ${isLoading ? "loading" : ""}`,
      open: isLoading
    },
    React.createElement(
      "summary",
      null,
      React.createElement(Icon, { name: "BrainCircuit", size: 14 }),
      React.createElement("span", null, "Smart RAG"),
      isLoading ? React.createElement(LoadingGlyph) : null
    ),
    React.createElement(
      "ol",
      null,
      steps.map((step, index) =>
        React.createElement(
          "li",
          { key: `${step.label}-${index}` },
          React.createElement("strong", null, step.label),
          React.createElement("span", null, step.detail)
        )
      )
    )
  );
}

function SourcesPanel({ message }) {
  const sources = message.sources || [];
  const isLoading = message.ragStatus === "loading";
  const isEmpty = message.ragStatus === "empty";
  const isError = message.ragStatus === "error";

  if (!sources.length && !isLoading && !isEmpty && !isError) {
    return null;
  }

  return React.createElement(
    "details",
    {
      className: `sources-panel ${isLoading ? "loading" : ""}`,
      open: false
    },
    React.createElement(
      "summary",
      null,
      React.createElement(Icon, { name: "Search", size: 14 }),
      React.createElement("span", null, sourceSummaryLabel(message)),
      isLoading ? React.createElement(LoadingGlyph) : null
    ),
      sources.length
        ? React.createElement(
            "div",
            { className: "sources-list" },
            sources.map((source, index) =>
              React.createElement(SourceChip, {
                key: source.id,
                source,
                index
              })
          )
        )
      : React.createElement(
          "p",
          { className: "panel-empty" },
          isLoading ? "Források keresése..." : "Nincs megjeleníthető forrás."
        )
  );
}

function SourceChip({ source, index }) {
  const url = getPostUrl(source);

  return React.createElement(
    "button",
    {
      className: "source-chip",
      type: "button",
      disabled: !url,
      title: url ? `Poszt megnyitása: ${url}` : sourcePreview(source),
      onClick: () => openPostUrl(url)
    },
    React.createElement("strong", null, `[KB ${index + 1}]`),
    React.createElement(
      "span",
      null,
      `${source.title}${source.author ? ` · ${source.author}` : ""}${
        source.postId ? ` · ${source.postId}` : ""
      }`
    ),
    React.createElement("em", null, formatScore(source.score))
  );
}

function sourceSummaryLabel(message) {
  if (message.ragStatus === "loading") {
    return "Knowledge base keresés";
  }

  if (message.ragStatus === "empty") {
    return "Nincs releváns KB találat";
  }

  if (message.ragStatus === "error") {
    return "RAG hiba";
  }

  const count = message.sources?.length || 0;
  return `Knowledge base találatok (${count})`;
}

function Composer({
  draft,
  isBusy,
  canSend,
  modelAvailable,
  onDraftChange,
  onKeyDown,
  onSend,
  onStop
}) {
  return React.createElement(
    "footer",
    { className: "composer-wrap" },
    React.createElement(
      "div",
      { className: "composer" },
      React.createElement("textarea", {
        value: draft,
        rows: 1,
        disabled: isBusy || !modelAvailable,
        placeholder: modelAvailable
          ? "Üzenet a helyi Chrome modellnek..."
          : "A modell nem elérhető ezen a gépen.",
        onChange: (event) => onDraftChange(event.target.value),
        onKeyDown
      }),
      isBusy
        ? React.createElement(
            "button",
            { className: "send-button stop", type: "button", title: "Megállítás", onClick: onStop },
            React.createElement(Icon, { name: "Square", size: 18 })
          )
        : React.createElement(
            "button",
            {
              className: "send-button",
              type: "button",
              title: "Küldés",
              disabled: !canSend,
              onClick: onSend
            },
            React.createElement(Icon, { name: "SendHorizontal", size: 18 })
          )
    ),
    React.createElement("p", { className: "composer-hint" }, "Enter küldés, Shift+Enter új sor")
  );
}

function SettingsDrawer({
  open,
  onClose,
  status,
  streaming,
  setStreaming,
  systemPrompt,
  setSystemPrompt,
  outputLanguage,
  setOutputLanguage,
  sampling,
  setSampling,
  knowledgeSettings,
  setKnowledgeSettings,
  knowledgeMeta,
  onRecheck,
  onClear
}) {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement("div", {
      className: `drawer-backdrop ${open ? "open" : ""}`,
      onClick: onClose
    }),
    React.createElement(
      "aside",
      { className: `settings-drawer ${open ? "open" : ""}`, "aria-hidden": !open },
      React.createElement(
        "div",
        { className: "drawer-header" },
        React.createElement(
          "div",
          null,
          React.createElement("h2", null, "Settings"),
          React.createElement("p", null, status)
        ),
        React.createElement(
          "button",
          { className: "icon-button", type: "button", title: "Bezárás", onClick: onClose },
          React.createElement(Icon, { name: "X", size: 18 })
        )
      ),
      React.createElement(
        "div",
        { className: "drawer-content" },
        React.createElement(
          "label",
          { className: "field" },
          React.createElement("span", null, "System prompt"),
          React.createElement("textarea", {
            rows: 6,
            value: systemPrompt,
            onChange: (event) => setSystemPrompt(event.target.value)
          })
        ),
        React.createElement(
          "label",
          { className: "field" },
          React.createElement("span", null, "Output language"),
          React.createElement(
            "select",
            {
              value: outputLanguage,
              onChange: (event) => setOutputLanguage(event.target.value)
            },
            React.createElement("option", { value: "en" }, "English"),
            React.createElement("option", { value: "es" }, "Spanish"),
            React.createElement("option", { value: "ja" }, "Japanese")
          )
        ),
        React.createElement(ToggleField, {
          label: "Streaming response",
          checked: streaming,
          onChange: setStreaming
        }),
        React.createElement(
          "section",
          { className: "knowledge-panel" },
          React.createElement(
            "div",
            { className: "knowledge-header" },
            React.createElement(
              "div",
              null,
              React.createElement("h3", null, "Knowledge base"),
              React.createElement(
                "p",
                null,
                knowledgeMeta.status === "ready"
                  ? `${knowledgeMeta.documents} records, ${knowledgeMeta.chunks} chunks`
                  : knowledgeMeta.status === "loading"
                    ? "Indexelés..."
                    : knowledgeMeta.error || "Nem sikerült betölteni."
              )
            ),
            React.createElement(Icon, {
              name: knowledgeMeta.status === "ready" ? "Database" : "CircleAlert",
              size: 18
            })
          ),
          knowledgeMeta.files.length
            ? React.createElement(
                "div",
                { className: "kb-files" },
                knowledgeMeta.files.map((file) =>
                  React.createElement(
                    "span",
                    { key: file.fileName },
                    `${file.fileName} (${file.records})`
                  )
                )
              )
            : null,
          React.createElement(ToggleField, {
            label: "Use knowledge base",
            checked: knowledgeSettings.enabled,
            onChange: (checked) =>
              setKnowledgeSettings({ ...knowledgeSettings, enabled: checked })
          }),
          React.createElement(ToggleField, {
            label: "Thinking mode simulation",
            checked: knowledgeSettings.thinkingMode,
            onChange: (checked) =>
              setKnowledgeSettings({ ...knowledgeSettings, thinkingMode: checked })
          }),
          React.createElement(RangeField, {
            label: "Retrieved sources",
            min: 1,
            max: 8,
            step: 1,
            value: knowledgeSettings.topK,
            onChange: (value) =>
              setKnowledgeSettings({ ...knowledgeSettings, topK: value })
          })
        ),
        sampling.available
          ? React.createElement(
              "div",
              { className: "setting-group" },
              React.createElement(RangeField, {
                label: "Temperature",
                min: 0,
                max: sampling.maxTemperature,
                step: 0.1,
                value: sampling.temperature,
                onChange: (value) => setSampling({ ...sampling, temperature: value })
              }),
              React.createElement(RangeField, {
                label: "Top-K",
                min: 1,
                max: sampling.maxTopK,
                step: 1,
                value: sampling.topK,
                onChange: (value) => setSampling({ ...sampling, topK: value })
              })
            )
          : null,
        React.createElement(
          "div",
          { className: "drawer-actions" },
          React.createElement(
            "button",
            { type: "button", onClick: onRecheck },
            React.createElement(Icon, { name: "RefreshCw", size: 16 }),
            React.createElement("span", null, "Recheck")
          ),
          React.createElement(
            "button",
            { type: "button", onClick: onClear },
            React.createElement(Icon, { name: "Trash2", size: 16 }),
            React.createElement("span", null, "Clear chat")
          )
        )
      )
    )
  );
}

function ToggleField({ label, checked, onChange }) {
  return React.createElement(
    "label",
    { className: "toggle-field" },
    React.createElement("span", null, label),
    React.createElement("input", {
      type: "checkbox",
      checked,
      onChange: (event) => onChange(event.target.checked)
    })
  );
}

function RangeField({ label, min, max, step, value, onChange }) {
  return React.createElement(
    "label",
    { className: "range-field" },
    React.createElement(
      "span",
      null,
      label,
      React.createElement("output", null, value)
    ),
    React.createElement("input", {
      type: "range",
      min,
      max,
      step,
      value,
      onChange: (event) =>
        onChange(step === 1 ? Number.parseInt(event.target.value, 10) : Number(event.target.value))
    })
  );
}

ReactDOM.createRoot(document.querySelector("#root")).render(React.createElement(App));
