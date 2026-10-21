/* Office page data: sign-in, live copies of the collections, and saving.
   Everything goes through Supabase with the office user's sign-in; row-level security does the checking. */
(function (W) {
  const cfg = W.TREERUN_CONFIG || {};
  const sb = W.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });

  // ---- sign-in (email magic link). Resolves with the email once an office user is signed in. ----
  function signIn() { return new Promise(resolve => {
    const box = document.getElementById("signin"), msg = document.getElementById("si-msg");
    let done = false;
    async function check() {
      const { data } = await sb.auth.getSession();
      if (!data.session) { box.hidden = false; return; }
      const { data: ok } = await sb.from("office_users").select("email").limit(1);
      if (!ok || !ok.length) { box.hidden = false; msg.innerHTML = ""; const b = document.createElement("b"); b.style.color = "var(--bad)"; b.textContent = `${data.session.user.email} isn't on the office list.`; msg.append(b, " Ask Jon to add you."); return; }
      box.hidden = true; if (!done) { done = true; resolve(data.session.user.email || data.session.user.id); }
    }
    document.getElementById("si-go").onclick = async () => {
      const email = document.getElementById("si-email").value.trim(); if (!email) { msg.textContent = "Enter your email"; return; }
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split("#")[0], shouldCreateUser: true } });
      msg.textContent = error ? ("Couldn't send: " + error.message) : "Check your email and tap the link. You can close this tab.";
    };
    sb.auth.onAuthStateChange(ev => { if (ev === "SIGNED_IN") check(); });
    check();
  }); }

  // ---- live collections: one realtime channel, plus a reload every 30 s in case it drops ----
  const watchers = new Map();   // coll -> {rows: Map(path,row), cbs:[]}
  let channel = null;
  async function loadColl(coll) {
    const rows = []; for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("docs").select("path,data").eq("coll", coll).order("path").range(from, from + 999);
      if (error) throw error; rows.push(...data); if (data.length < 1000) break; }
    return rows; }
  function emit(coll) { const w = watchers.get(coll); const list = [...w.rows.values()].sort((a, b) => a.path < b.path ? -1 : 1); for (const cb of w.cbs) cb(list); }
  function ensureChannel() { if (channel) return;
    channel = sb.channel("docs-live").on("postgres_changes", { event: "*", schema: "public", table: "docs" }, p => {
      const row = p.new && p.new.path ? p.new : null, old = p.old && p.old.path ? p.old : null, path = (row || old).path, coll = path.replace(/\/[^/]+$/, "");
      const w = watchers.get(coll); if (!w) return;
      if (p.eventType === "DELETE") w.rows.delete(path); else w.rows.set(path, row); emit(coll); }).subscribe(); }
  // watch("stops", rows => …, err => …): rows {path, data}, sorted by path
  function watch(coll, cb, onErr) {
    let w = watchers.get(coll); if (!w) { w = { rows: new Map(), cbs: [] }; watchers.set(coll, w); }
    w.cbs.push(cb); ensureChannel();
    const load = async () => { try { const rows = await loadColl(coll); w.rows = new Map(rows.map(r => [r.path, r])); emit(coll); } catch (e) { onErr && onErr(e); } };
    w.load = load; load(); setInterval(load, 30000); }
  // reload some collections now (after a server function changed them), rather than waiting for the live feed
  const refresh = (...colls) => Promise.all(colls.map(c => watchers.get(c)?.load?.()));

  // ---- saving ----
  const fail = error => { throw Object.assign(new Error(error.message || String(error)), { code: error.code }); };
  async function put(path, data) { const { error } = await sb.from("docs").upsert({ path, data, updated_at: new Date().toISOString() }); if (error) fail(error); }
  // patch(path, data): merge fields. With expect, only if those fields still hold (else returns "changed").
  async function patch(path, data, expect) {
    if (expect) { const { data: r, error } = await sb.rpc("office_patch", { p_path: path, p_patch: data, p_expect: expect }); if (error) fail(error); return r && r.error ? r.error : true; }
    const { error } = await sb.rpc("doc_update", { p_path: path, p_patch: data }); if (error) fail(error); return true; }
  async function remove(path) { const { error } = await sb.from("docs").delete().eq("path", path); if (error) fail(error); }
  async function get(path) { const { data, error } = await sb.from("docs").select("data").eq("path", path).maybeSingle(); if (error) fail(error); return data ? data.data : null; }
  async function rpc(fn, args) { const { data, error } = await sb.rpc(fn, args || {}); if (error) fail(error); return data || {}; }
  // Outlook through the "outlook" Edge Function (used when config.emailMode isn't "mailto")
  async function sendMail(input) { const { data, error } = await sb.functions.invoke("outlook", { body: { tool: "outlook_send_mail", input } });
    if (error) { let m = error.message; try { const b = await error.context.json(); m = b.error || m; } catch (e) { } throw Object.assign(new Error(m), { code: /not.?configured/i.test(m) ? "server_not_connected" : "tool_error" }); }
    if (data && data.error) throw Object.assign(new Error(data.error), { code: "tool_error" }); return data; }

  W.OFFICE_DATA = { sb, cfg, signIn, watch, refresh, put, patch, remove, get, rpc, sendMail };
})(window);
