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

  // src/app.ts
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
  function threadTitle(thread) {
    if (thread.subject) return thread.subject;
    const name = thread.profileFields.name ?? thread.profileFields["\u6C0F\u540D"];
    if (name) return name;
    return `\u554F\u3044\u5408\u308F\u305B ${thread.id.slice(0, 8)}`;
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
    root;
    statusEl;
    contentEl;
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
      } catch (e) {
        this.setStatus(e instanceof Error ? e.message : "\u521D\u671F\u5316\u306B\u5931\u6557\u3057\u307E\u3057\u305F", "error");
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
      panel.append(
        el("p", "kototoi-form__intro", [
          "Passkey\uFF08\u9854\u8A8D\u8A3C\u30FB\u6307\u7D0B\u30FB\u30BB\u30AD\u30E5\u30EA\u30C6\u30A3\u30AD\u30FC\u7B49\uFF09\u3067\u672C\u4EBA\u78BA\u8A8D\u3092\u884C\u3044\u307E\u3059\u3002\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u306E\u767B\u9332\u306F\u4E0D\u8981\u3067\u3059\u3002"
        ])
      );
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
        const item = el("li", "kototoi-form__thread-item");
        const status = thread.status;
        item.append(
          el("div", "", [threadTitle(thread)]),
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
        void this.render();
      });
      wrap.append(back);
      wrap.append(el("h3", "kototoi-form__title", [threadTitle(thread)]));
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
        await this.render();
        this.setStatus("");
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
        this.tab = this.siteSuspended ? "threads" : "threads";
        this.acceptsNewInquiries = !this.siteSuspended;
        this.setStatus("\u30ED\u30B0\u30A4\u30F3\u3057\u307E\u3057\u305F\u3002", "ok");
        await this.render();
      } catch (e) {
        this.setStatus(e instanceof Error ? e.message : "\u30ED\u30B0\u30A4\u30F3\u306B\u5931\u6557\u3057\u307E\u3057\u305F", "error");
      } finally {
        this.setBusy(false);
      }
    }
    async handleLogout() {
      this.setBusy(true);
      try {
        await this.api.logout();
        this.view = "auth";
        this.tab = "new";
        this.threads = [];
        this.activeThread = null;
        this.messages = [];
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
