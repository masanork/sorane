"use strict";
var Kototoi = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.ts
  var index_exports = {};
  __export(index_exports, {
    KototoiApp: () => KototoiApp,
    loadConfig: () => loadConfig,
    mountElement: () => mountElement
  });

  // src/webauthn.ts
  function b64urlToBytes(s) {
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - s.length % 4);
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesToB64url(bytes) {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let bin = "";
    for (const b of view) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decodeCreationOptions(publicKey) {
    return {
      ...publicKey,
      challenge: b64urlToBytes(publicKey.challenge),
      user: {
        ...publicKey.user,
        id: b64urlToBytes(publicKey.user.id)
      },
      excludeCredentials: (publicKey.excludeCredentials ?? []).map((c) => ({
        ...c,
        id: b64urlToBytes(c.id)
      }))
    };
  }
  function decodeRequestOptions(publicKey) {
    return {
      ...publicKey,
      challenge: b64urlToBytes(publicKey.challenge),
      allowCredentials: (publicKey.allowCredentials ?? []).map((c) => ({
        ...c,
        id: b64urlToBytes(c.id)
      }))
    };
  }
  function encodeCredential(cred) {
    if (!(cred instanceof PublicKeyCredential)) throw new Error("not a PublicKeyCredential");
    const r = cred.response;
    const isRegistration = "attestationObject" in r;
    const response = isRegistration ? {
      clientDataJSON: bytesToB64url(r.clientDataJSON),
      attestationObject: bytesToB64url(r.attestationObject)
    } : {
      clientDataJSON: bytesToB64url(r.clientDataJSON),
      authenticatorData: bytesToB64url(r.authenticatorData),
      signature: bytesToB64url(r.signature),
      userHandle: r.userHandle ? bytesToB64url(r.userHandle) : null
    };
    return {
      id: cred.id,
      rawId: bytesToB64url(cred.rawId),
      type: cred.type,
      response,
      clientExtensionResults: cred.getClientExtensionResults(),
      authenticatorAttachment: cred.authenticatorAttachment
    };
  }

  // src/api.ts
  var KototoiApi = class {
    constructor(config) {
      this.config = config;
    }
    base(path) {
      const root = this.config.endpoint.replace(/\/$/, "");
      return `${root}/api/v1/sites/${this.config.siteId}${path}`;
    }
    async request(path, init) {
      const res = await fetch(this.base(path), {
        credentials: "include",
        ...init,
        headers: {
          "content-type": "application/json",
          ...init?.headers ?? {}
        }
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = json.error_description ?? json.error ?? res.statusText;
        throw new Error(msg);
      }
      return json;
    }
    async getSite() {
      const root = this.config.endpoint.replace(/\/$/, "");
      const res = await fetch(`${root}/api/v1/sites/${this.config.siteId}`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);
      return { status: json.status, name: json.name };
    }
    async getSession() {
      try {
        return await this.request("/auth/session");
      } catch {
        return null;
      }
    }
    async registerPasskey() {
      const begin = await this.request(
        "/auth/register/options",
        { method: "POST", body: "{}" }
      );
      const cred = await navigator.credentials.create({
        publicKey: decodeCreationOptions(begin.publicKey)
      });
      if (!cred) throw new Error("Passkey creation cancelled");
      await this.request("/auth/register/verify", {
        method: "POST",
        body: JSON.stringify({ handle: begin.handle, clientResponse: encodeCredential(cred) })
      });
    }
    async loginPasskey() {
      const begin = await this.request(
        "/auth/login/options",
        { method: "POST", body: "{}" }
      );
      const cred = await navigator.credentials.get({
        publicKey: decodeRequestOptions(begin.publicKey)
      });
      if (!cred) throw new Error("Passkey login cancelled");
      await this.request("/auth/login/verify", {
        method: "POST",
        body: JSON.stringify({ handle: begin.handle, clientResponse: encodeCredential(cred) })
      });
    }
    async logout() {
      await this.request("/auth/logout", { method: "POST", body: "{}" });
    }
    async listThreads() {
      const res = await this.request("/threads");
      return res.threads;
    }
    async getThread(id) {
      return this.request(`/threads/${id}`);
    }
    async createThread(fields) {
      return this.request("/threads", {
        method: "POST",
        body: JSON.stringify({ fields })
      });
    }
    async addMessage(threadId, body) {
      return this.request(`/threads/${threadId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body })
      });
    }
    async getVapidPublicKey() {
      const res = await this.request("/push/vapid");
      return res.publicKey;
    }
    async subscribePush(subscription) {
      await this.request("/push/subscribe", {
        method: "POST",
        body: JSON.stringify(subscription)
      });
    }
  };

  // src/form.ts
  var DEFAULT_BODY_ID = "body";
  var DEFAULT_SUBJECT_ID = "subject";
  function validateSubmission(fields, input) {
    const errors = [];
    const profileFields = {};
    let body = "";
    let subject = null;
    const bodyField = fields.find((f) => f.id === DEFAULT_BODY_ID);
    const subjectField = fields.find((f) => f.id === DEFAULT_SUBJECT_ID);
    for (const field of fields) {
      const raw = input[field.id];
      const value = typeof raw === "string" ? raw.trim() : "";
      if (field.id === DEFAULT_BODY_ID) {
        body = value;
      } else if (field.id === DEFAULT_SUBJECT_ID) {
        subject = value.length > 0 ? value : null;
      } else if (value.length > 0) {
        profileFields[field.id] = value;
      }
      if (field.required && value.length === 0) {
        errors.push({ field: field.id, message: `${field.label}\u306F\u5FC5\u9808\u3067\u3059` });
      }
      if (field.max_length && value.length > field.max_length) {
        errors.push({ field: field.id, message: `${field.label}\u306F${field.max_length}\u6587\u5B57\u4EE5\u5185\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044` });
      }
    }
    if (!bodyField && input[DEFAULT_BODY_ID]) {
      body = String(input[DEFAULT_BODY_ID]).trim();
    }
    if (!subjectField && input[DEFAULT_SUBJECT_ID]) {
      const s = String(input[DEFAULT_SUBJECT_ID]).trim();
      subject = s.length > 0 ? s : null;
    }
    if (errors.length > 0) return { ok: false, errors };
    if (body.length === 0) {
      return { ok: false, errors: [{ field: DEFAULT_BODY_ID, message: "\u304A\u554F\u3044\u5408\u308F\u305B\u5185\u5BB9\u306F\u5FC5\u9808\u3067\u3059" }] };
    }
    return { ok: true, profileFields, body, subject };
  }

  // src/push.ts
  function urlBase64ToUint8Array(base64) {
    const pad = "=".repeat((4 - base64.length % 4) % 4);
    const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function isPushSupported() {
    return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }
  async function subscribeToPush(api, swPath = "/kototoi-sw.js") {
    if (!isPushSupported()) return { ok: false, reason: "unsupported" };
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: "denied" };
    try {
      const vapidKey = await api.getVapidPublicKey();
      const reg = await navigator.serviceWorker.register(swPath, { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
      });
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        return { ok: false, reason: "error", message: "invalid subscription" };
      }
      await api.subscribe(json);
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        reason: "error",
        message: e instanceof Error ? e.message : "push subscribe failed"
      };
    }
  }
  function shouldOfferPushOptIn() {
    if (!isPushSupported()) return false;
    if (Notification.permission === "granted") return false;
    if (sessionStorage.getItem("kototoi_push_dismissed") === "1") return false;
    return Notification.permission === "default";
  }
  function dismissPushOptIn() {
    sessionStorage.setItem("kototoi_push_dismissed", "1");
  }

  // src/unread.ts
  var STORAGE_PREFIX = "kototoi_seen_";
  function storageKey(siteId) {
    return `${STORAGE_PREFIX}${siteId}`;
  }
  function readMap(siteId) {
    try {
      const raw = localStorage.getItem(storageKey(siteId));
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return {};
      return parsed;
    } catch {
      return {};
    }
  }
  function writeMap(siteId, map) {
    localStorage.setItem(storageKey(siteId), JSON.stringify(map));
  }
  function getLastSeenMessageId(siteId, threadId) {
    return readMap(siteId)[threadId] ?? null;
  }
  function markThreadSeen(siteId, threadId, messageId) {
    const map = readMap(siteId);
    map[threadId] = messageId;
    writeMap(siteId, map);
  }
  function isAdminReplyUnread(siteId, threadId, lastMessage) {
    if (!lastMessage || lastMessage.authorRole !== "admin") return false;
    return getLastSeenMessageId(siteId, threadId) !== lastMessage.id;
  }

  // ../api/src/threads/ref.ts
  var THREAD_REF_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  var PAYLOAD_LEN = 5;
  var THREAD_REF_LEN = PAYLOAD_LEN + 1;
  function normalizeThreadRef(input) {
    return input.trim().toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/[ILOU]/g, (ch) => {
      if (ch === "I" || ch === "L") return "1";
      if (ch === "O") return "0";
      if (ch === "U") return "V";
      return ch;
    });
  }
  function threadRefChecksum(payload) {
    let acc = 0;
    for (let i = 0; i < payload.length; i++) {
      const idx = THREAD_REF_ALPHABET.indexOf(payload[i]);
      if (idx < 0) throw new Error("invalid ref payload");
      acc = (acc + idx * (i + 3)) % THREAD_REF_ALPHABET.length;
    }
    return THREAD_REF_ALPHABET[acc];
  }
  function formatThreadRef(ref) {
    const n = normalizeThreadRef(ref);
    if (n.length !== THREAD_REF_LEN) return n;
    return `${n.slice(0, 3)}-${n.slice(3)}`;
  }
  function parseThreadRef(input) {
    const normalized = normalizeThreadRef(input);
    if (normalized.length !== THREAD_REF_LEN) return null;
    for (const ch of normalized) {
      if (!THREAD_REF_ALPHABET.includes(ch)) return null;
    }
    const payload = normalized.slice(0, PAYLOAD_LEN);
    const check = normalized[PAYLOAD_LEN];
    if (threadRefChecksum(payload) !== check) return null;
    return normalized;
  }

  // src/replies.ts
  function threadsWithUnreadAdminReplies(threads, siteId) {
    return threads.filter((t) => isAdminReplyUnread(siteId, t.id, t.lastMessage)).sort((a, b) => {
      const at = Date.parse(a.lastMessage?.createdAt ?? a.updatedAt);
      const bt = Date.parse(b.lastMessage?.createdAt ?? b.updatedAt);
      return bt - at;
    });
  }
  function threadLookupFromNavigationTarget(url) {
    try {
      const u = new URL(url);
      const hash = u.hash.replace(/^#/, "");
      const refHash = hash.match(/^ref-([0-9A-HJ-NP-Z]{6})$/i);
      if (refHash) return refHash[1];
      const hashMatch = hash.match(/^thread-([0-9a-f-]{36})$/i);
      if (hashMatch) return hashMatch[1];
      const refQuery = u.searchParams.get("ref");
      if (refQuery) {
        const parsed = parseThreadRef(refQuery);
        if (parsed) return parsed;
      }
      const query = u.searchParams.get("thread")?.trim();
      if (query && /^[0-9a-f-]{36}$/i.test(query)) return query;
    } catch {
    }
    const tagMatch = url.match(/^thread-([0-9a-f-]{36})$/i);
    if (tagMatch) return tagMatch[1];
    return null;
  }

  // ../api/src/threads/title.ts
  function threadTitle(thread) {
    const subject = thread.subject?.trim();
    if (subject) return subject;
    if (thread.ref) return `\u554F\u3044\u5408\u308F\u305B ${formatThreadRef(thread.ref)}`;
    if (thread.updatedAt) {
      const d = new Date(thread.updatedAt);
      if (!Number.isNaN(d.getTime())) {
        return `\u554F\u3044\u5408\u308F\u305B\uFF08${d.toLocaleDateString("ja-JP")}\uFF09`;
      }
    }
    return `\u554F\u3044\u5408\u308F\u305B ${thread.id.slice(0, 8)}`;
  }

  // src/app.ts
  var REPLY_POLL_MS = 3e4;
  function el(tag, className, children = []) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    for (const child of children) {
      node.append(child instanceof Node ? child : document.createTextNode(child));
    }
    return node;
  }
  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }
  var KototoiApp = class {
    constructor(container, config) {
      this.container = container;
      this.config = config;
      this.api = new KototoiApi(config);
      this.root = el("div", "kototoi-form");
      this.statusEl = el("div", "kototoi-form__status");
      this.contentEl = el("div");
      this.root.append(this.contentEl, this.statusEl);
      this.container.replaceChildren(this.root);
      this.bindPushNavigation();
    }
    api;
    view = "auth";
    tab = "new";
    threads = [];
    activeThread = null;
    messages = [];
    busy = false;
    siteSuspended = false;
    acceptsNewInquiries = true;
    replyPollTimer = null;
    root;
    statusEl;
    contentEl;
    bindPushNavigation() {
      if (!("serviceWorker" in navigator)) return;
      navigator.serviceWorker.addEventListener("message", (ev) => {
        const data = ev.data;
        if (data?.type !== "kototoi-open-thread") return;
        const id = data.threadId ?? (data.url ? threadLookupFromNavigationTarget(data.url) : null);
        if (!id || this.view === "auth") return;
        void this.openThreadFromPush(id, data.body);
      });
    }
    async mount() {
      this.setStatus("");
      try {
        const site = await this.api.getSite();
        this.siteSuspended = site.status === "suspended";
        const session = await this.api.getSession();
        if (session?.role === "inquirer") {
          this.view = "main";
          this.acceptsNewInquiries = !this.siteSuspended;
        } else if (session?.role === "admin") {
          this.view = "auth";
          this.setStatus("\u7BA1\u7406\u8005\u30A2\u30AB\u30A6\u30F3\u30C8\u3067\u3059\u3002\u3053\u306E\u30D5\u30A9\u30FC\u30E0\u306F\u554F\u3044\u5408\u308F\u305B\u8005\u5411\u3051\u3067\u3059\u3002", "error");
        } else {
          this.view = "auth";
          this.acceptsNewInquiries = !this.siteSuspended;
        }
        await this.render();
        await this.openThreadFromHash();
        if (this.view !== "auth") {
          await this.navigateToPendingReplies();
          this.startReplyPolling();
        }
      } catch (e) {
        this.setStatus(e instanceof Error ? e.message : "\u521D\u671F\u5316\u306B\u5931\u6557\u3057\u307E\u3057\u305F", "error");
      }
    }
    hasThreadHash() {
      const hash = window.location.hash.replace(/^#/, "");
      return /^thread-[0-9a-f-]{36}$/i.test(hash) || /^ref-[0-9A-HJ-NP-Z]{6}$/i.test(hash);
    }
    setThreadHash(thread) {
      const base = `${window.location.pathname}${window.location.search}`;
      const tag = thread.ref ? `ref-${thread.ref}` : `thread-${thread.id}`;
      history.replaceState(null, "", `${base}#${tag}`);
    }
    clearThreadHash() {
      const base = `${window.location.pathname}${window.location.search}`;
      history.replaceState(null, "", base);
    }
    async openThreadFromHash() {
      const lookup = threadLookupFromNavigationTarget(window.location.href);
      if (!lookup || this.view === "auth") return;
      await this.openThread(lookup);
    }
    async openThreadFromPush(threadId, preview) {
      const status = preview ? `\u8FD4\u4FE1: ${preview}` : "\u8FD4\u4FE1\u304C\u5C4A\u304D\u307E\u3057\u305F\u3002";
      this.setStatus(status, "ok");
      await this.openThread(threadId);
    }
    startReplyPolling() {
      this.stopReplyPolling();
      this.replyPollTimer = setInterval(() => void this.checkForNewReplies(), REPLY_POLL_MS);
    }
    stopReplyPolling() {
      if (this.replyPollTimer !== null) {
        clearInterval(this.replyPollTimer);
        this.replyPollTimer = null;
      }
    }
    async navigateToPendingReplies() {
      if (this.view === "auth" || this.hasThreadHash()) return;
      try {
        this.threads = await this.api.listThreads();
        const unread = threadsWithUnreadAdminReplies(this.threads, this.config.siteId);
        if (unread.length === 0) return;
        const newest = unread[0];
        this.tab = "threads";
        this.setStatus(
          unread.length === 1 ? "\u8FD4\u4FE1\u304C\u5C4A\u3044\u3066\u3044\u307E\u3059\u3002" : `\u8FD4\u4FE1\u304C ${unread.length} \u4EF6\u5C4A\u3044\u3066\u3044\u307E\u3059\u3002`,
          "ok"
        );
        await this.openThread(newest.id);
      } catch {
      }
    }
    async checkForNewReplies() {
      if (this.busy || this.view === "auth") return;
      try {
        const threads = await this.api.listThreads();
        this.threads = threads;
        const unread = threadsWithUnreadAdminReplies(threads, this.config.siteId);
        if (unread.length === 0) return;
        const newest = unread[0];
        if (this.view === "thread" && this.activeThread?.id === newest.id) {
          const res = await this.api.getThread(newest.id);
          if (res.messages.length > this.messages.length) {
            this.messages = res.messages;
            const last = res.messages.at(-1);
            if (last) markThreadSeen(this.config.siteId, newest.id, last.id);
            await this.render();
            this.setStatus("\u65B0\u3057\u3044\u8FD4\u4FE1\u304C\u5C4A\u304D\u307E\u3057\u305F\u3002", "ok");
          }
          return;
        }
        if (this.view === "thread" && this.activeThread) {
          const stillUnread = isAdminReplyUnread(
            this.config.siteId,
            this.activeThread.id,
            this.activeThread.lastMessage
          );
          if (!stillUnread) return;
        }
        this.setStatus("\u8FD4\u4FE1\u304C\u5C4A\u304D\u307E\u3057\u305F\u3002", "ok");
        await this.openThread(newest.id);
      } catch {
      }
    }
    async render() {
      this.contentEl.replaceChildren();
      if (this.view === "auth") {
        this.contentEl.append(this.renderAuth());
        return;
      }
      if (this.view === "thread" && this.activeThread) {
        this.contentEl.append(await this.renderThreadDetail());
        return;
      }
      this.contentEl.append(await this.renderMain());
    }
    renderUnreadAlert(unread) {
      const panel = el("div", "kototoi-form__panel kototoi-form__reply-alert");
      const count = unread.length;
      const latest = unread[0];
      panel.append(
        el("p", "kototoi-form__intro", [
          count === 1 ? `\u300C${threadTitle(latest)}\u300D\u306B\u8FD4\u4FE1\u304C\u5C4A\u3044\u3066\u3044\u307E\u3059\u3002` : `\u8FD4\u4FE1\u304C ${count} \u4EF6\u5C4A\u3044\u3066\u3044\u307E\u3059\u3002\u6700\u65B0\u306E\u8FD4\u4FE1\u3092\u8868\u793A\u3057\u307E\u3059\u3002`
        ])
      );
      const openBtn = el("button", "kototoi-form__btn", ["\u8FD4\u4FE1\u3092\u898B\u308B"]);
      openBtn.type = "button";
      openBtn.addEventListener("click", () => void this.openThread(latest.id));
      panel.append(openBtn);
      return panel;
    }
    renderPushOptIn() {
      const panel = el("div", "kototoi-form__panel kototoi-form__stack kototoi-form__push-optin");
      panel.append(
        el("p", "kototoi-form__intro", [
          "\u8FD4\u4FE1\u3084\u66F4\u65B0\u3092\u30D6\u30E9\u30A6\u30B6\u901A\u77E5\u3067\u53D7\u3051\u53D6\u308C\u307E\u3059\u3002\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u306F\u4E0D\u8981\u3067\u3001\u3053\u306E\u7AEF\u672B\u306E\u30D6\u30E9\u30A6\u30B6\u306B\u5C4A\u304D\u307E\u3059\u3002"
        ])
      );
      const row = el("div", "kototoi-form__row");
      const enableBtn = el("button", "kototoi-form__btn kototoi-form__btn--secondary", [
        "\u901A\u77E5\u3092\u53D7\u3051\u53D6\u308B"
      ]);
      enableBtn.type = "button";
      enableBtn.addEventListener("click", () => void this.handleEnablePush());
      const dismissBtn = el("button", "kototoi-form__btn kototoi-form__btn--text", ["\u3042\u3068\u3067"]);
      dismissBtn.type = "button";
      dismissBtn.addEventListener("click", () => {
        dismissPushOptIn();
        void this.render();
      });
      row.append(enableBtn, dismissBtn);
      panel.append(row);
      return panel;
    }
    async handleEnablePush() {
      this.setBusy(true);
      this.setStatus("\u901A\u77E5\u306E\u8A2D\u5B9A\u4E2D\u2026");
      const result = await subscribeToPush({
        getVapidPublicKey: () => this.api.getVapidPublicKey(),
        subscribe: (sub) => this.api.subscribePush(sub)
      });
      if (result.ok) {
        dismissPushOptIn();
        this.setStatus("\u901A\u77E5\u3092\u6709\u52B9\u306B\u3057\u307E\u3057\u305F\u3002", "ok");
        await this.render();
      } else if (result.reason === "denied") {
        this.setStatus("\u901A\u77E5\u304C\u30D6\u30ED\u30C3\u30AF\u3055\u308C\u3066\u3044\u307E\u3059\u3002\u30D6\u30E9\u30A6\u30B6\u306E\u8A2D\u5B9A\u304B\u3089\u8A31\u53EF\u3067\u304D\u307E\u3059\u3002", "error");
      } else if (result.reason === "unavailable") {
        this.setStatus("\u901A\u77E5\u306F\u73FE\u5728\u5229\u7528\u3067\u304D\u307E\u305B\u3093\u3002", "error");
      } else {
        this.setStatus(result.message ?? "\u901A\u77E5\u306E\u8A2D\u5B9A\u306B\u5931\u6557\u3057\u307E\u3057\u305F", "error");
      }
      this.setBusy(false);
    }
    renderAuth() {
      const panel = el("div", "kototoi-form__panel kototoi-form__stack");
      const title = this.config.form.title ?? "\u304A\u554F\u3044\u5408\u308F\u305B";
      panel.append(el("h2", "kototoi-form__title", [title]));
      if (this.siteSuspended && !this.acceptsNewInquiries) {
        panel.append(
          el("p", "kototoi-form__status kototoi-form__status--warning", [
            "\u73FE\u5728\u304A\u554F\u3044\u5408\u308F\u305B\u3092\u53D7\u3051\u4ED8\u3051\u3066\u304A\u308A\u307E\u305B\u3093\u3002"
          ])
        );
        const loginBtn2 = el("button", "kototoi-form__btn kototoi-form__btn--secondary", [
          "\u65E2\u5B58\u306E\u554F\u3044\u5408\u308F\u305B\u3092\u78BA\u8A8D\uFF08Passkey \u3067\u30ED\u30B0\u30A4\u30F3\uFF09"
        ]);
        loginBtn2.type = "button";
        loginBtn2.addEventListener("click", () => void this.handleLogin());
        panel.append(loginBtn2);
        return panel;
      }
      if (this.config.form.intro) {
        panel.append(el("p", "kototoi-form__intro", [this.config.form.intro]));
      }
      const row = el("div", "kototoi-form__row");
      const registerBtn = el("button", "kototoi-form__btn", ["Passkey \u3092\u767B\u9332\u3057\u3066\u59CB\u3081\u308B"]);
      registerBtn.type = "button";
      registerBtn.disabled = this.busy;
      registerBtn.addEventListener("click", () => void this.handleRegister());
      const loginBtn = el("button", "kototoi-form__btn kototoi-form__btn--secondary", ["Passkey \u3067\u30ED\u30B0\u30A4\u30F3"]);
      loginBtn.type = "button";
      loginBtn.disabled = this.busy;
      loginBtn.addEventListener("click", () => void this.handleLogin());
      row.append(loginBtn, registerBtn);
      panel.append(row);
      return panel;
    }
    async renderMain() {
      const wrap = el("div", "kototoi-form__stack");
      const title = this.config.form.title ?? "\u304A\u554F\u3044\u5408\u308F\u305B";
      wrap.append(el("h2", "kototoi-form__title", [title]));
      const tabs = el("div", "kototoi-form__tabs");
      const newTab = el("button", `kototoi-form__tab${this.tab === "new" ? " kototoi-form__tab--active" : ""}`, [
        "\u65B0\u898F\u554F\u3044\u5408\u308F\u305B"
      ]);
      newTab.type = "button";
      newTab.addEventListener("click", () => {
        this.tab = "new";
        void this.render();
      });
      const listTab = el("button", `kototoi-form__tab${this.tab === "threads" ? " kototoi-form__tab--active" : ""}`, [
        "\u554F\u3044\u5408\u308F\u305B\u4E00\u89A7"
      ]);
      listTab.type = "button";
      listTab.addEventListener("click", () => {
        this.tab = "threads";
        void this.render();
      });
      tabs.append(newTab, listTab);
      wrap.append(tabs);
      try {
        if (this.threads.length === 0) this.threads = await this.api.listThreads();
      } catch {
      }
      const unread = threadsWithUnreadAdminReplies(this.threads, this.config.siteId);
      if (unread.length > 0) {
        wrap.append(this.renderUnreadAlert(unread));
      }
      if (shouldOfferPushOptIn()) {
        wrap.append(this.renderPushOptIn());
      }
      const row = el("div", "kototoi-form__row");
      const logoutBtn = el("button", "kototoi-form__btn kototoi-form__btn--text", ["\u30ED\u30B0\u30A2\u30A6\u30C8"]);
      logoutBtn.type = "button";
      logoutBtn.disabled = this.busy;
      logoutBtn.addEventListener("click", () => void this.handleLogout());
      row.append(logoutBtn);
      wrap.append(row);
      if (this.tab === "new") {
        if (this.acceptsNewInquiries) {
          wrap.append(this.renderNewInquiryForm());
        } else {
          wrap.append(
            el("p", "kototoi-form__status kototoi-form__status--warning", [
              "\u65B0\u898F\u306E\u304A\u554F\u3044\u5408\u308F\u305B\u306F\u73FE\u5728\u53D7\u3051\u4ED8\u3051\u3066\u304A\u308A\u307E\u305B\u3093\u3002\u65E2\u5B58\u306E\u30B9\u30EC\u30C3\u30C9\u306F\u300C\u554F\u3044\u5408\u308F\u305B\u4E00\u89A7\u300D\u304B\u3089\u3054\u78BA\u8A8D\u304F\u3060\u3055\u3044\u3002"
            ])
          );
        }
      } else {
        wrap.append(await this.renderThreadList());
      }
      return wrap;
    }
    renderNewInquiryForm() {
      const panel = el("div", "kototoi-form__panel kototoi-form__stack");
      const form = el("form", "kototoi-form__stack");
      const fields = this.config.form.fields ?? [];
      const inputs = {};
      for (const field of fields) {
        form.append(this.renderField(field, inputs));
      }
      const submit = el("button", "kototoi-form__btn", [this.config.form.submit_label ?? "\u9001\u4FE1\u3059\u308B"]);
      submit.type = "submit";
      submit.disabled = this.busy;
      form.append(submit);
      form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        void this.handleCreateThread(inputs);
      });
      panel.append(form);
      return panel;
    }
    renderField(field, inputs) {
      const wrap = el("div");
      const label = el("label", "kototoi-form__label");
      label.htmlFor = `kototoi-${field.id}`;
      label.append(field.label);
      if (field.required) {
        label.append(el("span", "kototoi-form__required", ["*"]));
      }
      let input;
      if (field.type === "textarea") {
        input = el("textarea", "kototoi-form__textarea");
      } else {
        input = el("input", "kototoi-form__input");
        input.type = "text";
      }
      input.id = `kototoi-${field.id}`;
      input.name = field.id;
      input.required = Boolean(field.required);
      if (field.placeholder) input.placeholder = field.placeholder;
      if (field.max_length) input.maxLength = field.max_length;
      inputs[field.id] = input;
      wrap.append(label, input);
      return wrap;
    }
    async renderThreadList() {
      const panel = el("div", "kototoi-form__panel");
      try {
        this.threads = await this.api.listThreads();
      } catch (e) {
        panel.append(el("p", "", [e instanceof Error ? e.message : "\u4E00\u89A7\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F"]));
        return panel;
      }
      if (this.threads.length === 0) {
        panel.append(el("p", "kototoi-form__intro", ["\u307E\u3060\u554F\u3044\u5408\u308F\u305B\u306F\u3042\u308A\u307E\u305B\u3093\u3002"]));
        return panel;
      }
      const list = el("ul", "kototoi-form__thread-list");
      for (const thread of this.threads) {
        const unread = isAdminReplyUnread(this.config.siteId, thread.id, thread.lastMessage);
        const item = el(
          "li",
          `kototoi-form__thread-item${unread ? " kototoi-form__thread-item--unread" : ""}`
        );
        const titleRow = el("div", "kototoi-form__thread-title-row");
        titleRow.append(el("span", "", [threadTitle(thread)]));
        if (thread.ref) {
          titleRow.append(el("span", "kototoi-form__message-meta", [formatThreadRef(thread.ref)]));
        }
        if (unread) {
          titleRow.append(el("span", "kototoi-form__badge", ["\u8FD4\u4FE1\u3042\u308A"]));
        }
        const status = thread.status;
        item.append(
          titleRow,
          el("div", "kototoi-form__message-meta", [`${status} \xB7 ${formatDate(thread.updatedAt)}`])
        );
        item.addEventListener("click", () => void this.openThread(thread.id));
        list.append(item);
      }
      panel.append(list);
      return panel;
    }
    async renderThreadDetail() {
      const thread = this.activeThread;
      const wrap = el("div", "kototoi-form__stack");
      const back = el("button", "kototoi-form__btn kototoi-form__btn--text", ["\u2190 \u4E00\u89A7\u306B\u623B\u308B"]);
      back.type = "button";
      back.disabled = this.busy;
      back.addEventListener("click", () => {
        this.view = "main";
        this.tab = "threads";
        this.activeThread = null;
        this.messages = [];
        this.clearThreadHash();
        void this.render();
      });
      wrap.append(back);
      wrap.append(el("h3", "kototoi-form__title", [threadTitle(thread)]));
      if (thread.ref) {
        wrap.append(
          el("p", "kototoi-form__intro", [
            `\u304A\u554F\u3044\u5408\u308F\u305B\u756A\u53F7: ${formatThreadRef(thread.ref)}\uFF08\u5225\u306E\u9023\u7D61\u624B\u6BB5\u3067\u304A\u4F1D\u3048\u3044\u305F\u3060\u304F\u969B\u306B\u3054\u5229\u7528\u304F\u3060\u3055\u3044\uFF09`
          ])
        );
      }
      const messagesEl = el("div", "kototoi-form__messages");
      for (const msg of this.messages) {
        const cls = msg.authorRole === "admin" ? "kototoi-form__message kototoi-form__message--admin" : "kototoi-form__message";
        const box = el("div", cls);
        const roleLabel = msg.authorRole === "admin" ? "\u7BA1\u7406\u8005" : "\u3042\u306A\u305F";
        box.append(
          el("div", "kototoi-form__message-meta", [`${roleLabel} \xB7 ${formatDate(msg.createdAt)}`]),
          el("div", "", [msg.body])
        );
        messagesEl.append(box);
      }
      wrap.append(messagesEl);
      const panel = el("div", "kototoi-form__panel kototoi-form__stack");
      const form = el("form", "kototoi-form__stack");
      const label = el("label", "kototoi-form__label", ["\u8FFD\u8A18"]);
      const textarea = el("textarea", "kototoi-form__textarea");
      textarea.required = true;
      textarea.placeholder = "\u8FFD\u52A0\u306E\u30E1\u30C3\u30BB\u30FC\u30B8\u3092\u5165\u529B";
      label.htmlFor = "kototoi-reply";
      textarea.id = "kototoi-reply";
      const submit = el("button", "kototoi-form__btn", ["\u9001\u4FE1"]);
      submit.type = "submit";
      submit.disabled = this.busy;
      form.append(label, textarea, submit);
      form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        void this.handleAddMessage(textarea);
      });
      panel.append(form);
      wrap.append(panel);
      return wrap;
    }
    async openThread(id) {
      this.setBusy(true);
      try {
        const res = await this.api.getThread(id);
        this.activeThread = res.thread;
        this.messages = res.messages;
        this.view = "thread";
        this.tab = "threads";
        const last = res.messages.at(-1);
        if (last) markThreadSeen(this.config.siteId, id, last.id);
        this.setThreadHash(res.thread);
        await this.render();
      } catch (e) {
        this.setStatus(e instanceof Error ? e.message : "\u30B9\u30EC\u30C3\u30C9\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F", "error");
      } finally {
        this.setBusy(false);
      }
    }
    async handleRegister() {
      this.setBusy(true);
      this.setStatus("Passkey \u3092\u767B\u9332\u3057\u3066\u3044\u307E\u3059\u2026");
      try {
        await this.api.registerPasskey();
        this.view = "main";
        this.tab = "new";
        this.setStatus("Passkey \u3092\u767B\u9332\u3057\u307E\u3057\u305F\u3002", "ok");
        await this.render();
        this.startReplyPolling();
      } catch (e) {
        this.setStatus(e instanceof Error ? e.message : "\u767B\u9332\u306B\u5931\u6557\u3057\u307E\u3057\u305F", "error");
      } finally {
        this.setBusy(false);
      }
    }
    async handleLogin() {
      this.setBusy(true);
      this.setStatus("Passkey \u3067\u30ED\u30B0\u30A4\u30F3\u3057\u3066\u3044\u307E\u3059\u2026");
      try {
        await this.api.loginPasskey();
        this.view = "main";
        this.tab = "threads";
        this.acceptsNewInquiries = !this.siteSuspended;
        await this.render();
        await this.openThreadFromHash();
        if (!this.hasThreadHash()) {
          await this.navigateToPendingReplies();
        }
        if (this.view === "main") {
          this.setStatus("\u30ED\u30B0\u30A4\u30F3\u3057\u307E\u3057\u305F\u3002", "ok");
        }
        this.startReplyPolling();
      } catch (e) {
        this.setStatus(e instanceof Error ? e.message : "\u30ED\u30B0\u30A4\u30F3\u306B\u5931\u6557\u3057\u307E\u3057\u305F", "error");
      } finally {
        this.setBusy(false);
      }
    }
    async handleLogout() {
      this.setBusy(true);
      try {
        this.stopReplyPolling();
        await this.api.logout();
        this.view = "auth";
        this.tab = "new";
        this.threads = [];
        this.activeThread = null;
        this.messages = [];
        this.clearThreadHash();
        this.setStatus("");
        await this.render();
      } catch (e) {
        this.setStatus(e instanceof Error ? e.message : "\u30ED\u30B0\u30A2\u30A6\u30C8\u306B\u5931\u6557\u3057\u307E\u3057\u305F", "error");
      } finally {
        this.setBusy(false);
      }
    }
    async handleCreateThread(inputs) {
      const fields = this.config.form.fields ?? [];
      const values = {};
      for (const [id, input] of Object.entries(inputs)) {
        values[id] = input.value;
      }
      const validated = validateSubmission(fields, values);
      if (!validated.ok) {
        for (const err of validated.errors) {
          const input = inputs[err.field];
          if (input) input.focus();
        }
        this.setStatus(validated.errors.map((e) => e.message).join(" "), "error");
        return;
      }
      this.setBusy(true);
      this.setStatus("\u9001\u4FE1\u4E2D\u2026");
      try {
        const res = await this.api.createThread(values);
        this.activeThread = res.thread;
        this.messages = res.messages;
        this.view = "thread";
        this.setStatus("\u9001\u4FE1\u3057\u307E\u3057\u305F\u3002", "ok");
        await this.render();
      } catch (e) {
        this.setStatus(e instanceof Error ? e.message : "\u9001\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F", "error");
      } finally {
        this.setBusy(false);
      }
    }
    async handleAddMessage(textarea) {
      const body = textarea.value.trim();
      if (!body || !this.activeThread) return;
      this.setBusy(true);
      this.setStatus("\u9001\u4FE1\u4E2D\u2026");
      try {
        const res = await this.api.addMessage(this.activeThread.id, body);
        this.messages.push(res.message);
        markThreadSeen(this.config.siteId, this.activeThread.id, res.message.id);
        textarea.value = "";
        await this.render();
        this.setStatus("\u9001\u4FE1\u3057\u307E\u3057\u305F\u3002", "ok");
      } catch (e) {
        this.setStatus(e instanceof Error ? e.message : "\u9001\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F", "error");
      } finally {
        this.setBusy(false);
      }
    }
    setBusy(busy) {
      this.busy = busy;
      for (const btn of this.root.querySelectorAll("button")) {
        btn.disabled = busy;
      }
    }
    setStatus(message, kind) {
      this.statusEl.textContent = message;
      this.statusEl.className = "kototoi-form__status";
      if (kind === "error") this.statusEl.classList.add("kototoi-form__status--error");
      if (kind === "ok") this.statusEl.classList.add("kototoi-form__status--ok");
      if (!message) this.statusEl.className = "kototoi-form__status";
    }
  };

  // src/index.ts
  function scriptBaseUrl() {
    const current = document.currentScript;
    if (current instanceof HTMLScriptElement && current.src) {
      const url = new URL(current.src);
      return `${url.origin}${url.pathname.replace(/\/[^/]*$/, "")}`;
    }
    for (const script of document.querySelectorAll("script[src]")) {
      const src = script.src;
      if (src.includes("kototoi-form")) {
        const url = new URL(src);
        return `${url.origin}${url.pathname.replace(/\/[^/]*$/, "")}`;
      }
    }
    return null;
  }
  function normalizeConfig(raw) {
    if (raw === null || typeof raw !== "object") {
      throw new Error("kototoi config must be an object");
    }
    const obj = raw;
    const endpoint = typeof obj.endpoint === "string" ? obj.endpoint.trim() : "";
    const siteId = typeof obj.siteId === "string" ? obj.siteId.trim() : typeof obj.site_id === "string" ? obj.site_id.trim() : "";
    if (!endpoint) throw new Error("kototoi config: endpoint is required");
    if (!siteId) throw new Error("kototoi config: siteId is required");
    const formRaw = obj.form;
    const form = formRaw !== null && typeof formRaw === "object" ? formRaw : { fields: [] };
    if (!Array.isArray(form.fields)) {
      form.fields = [];
    }
    return { endpoint, siteId, form };
  }
  async function loadConfig(el2) {
    const inline = el2.getAttribute("data-kototoi-config");
    if (inline) {
      return normalizeConfig(JSON.parse(inline));
    }
    const configUrl = el2.getAttribute("data-kototoi-config-url") ?? (() => {
      const base = scriptBaseUrl();
      return base ? `${base}/kototoi-form.json` : null;
    })();
    if (!configUrl) {
      throw new Error("kototoi config not found (set data-kototoi-config or kototoi-form.json)");
    }
    const res = await fetch(configUrl);
    if (!res.ok) throw new Error(`failed to load kototoi config (${res.status})`);
    return normalizeConfig(await res.json());
  }
  async function mountElement(el2) {
    const config = await loadConfig(el2);
    const app = new KototoiApp(el2, config);
    await app.mount();
  }
  function autoInit() {
    const targets = document.querySelectorAll("[data-kototoi-auto]");
    for (const el2 of targets) {
      void mountElement(el2).catch((err) => {
        console.error("[kototoi]", err);
        el2.textContent = err instanceof Error ? err.message : "kototoi failed to initialize";
      });
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit);
  } else {
    autoInit();
  }
  return __toCommonJS(index_exports);
})();
//# sourceMappingURL=kototoi-form.js.map
