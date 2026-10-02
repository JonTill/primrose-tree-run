/* Primrose Tree Run — Supabase adapter.
   Gives the office page the same `window.claude.use(...)` interface it had inside Claude,
   backed by Supabase: db (docs table + realtime), user (Supabase login), mcp (Outlook via the
   `outlook` Edge Function), downloads (browser download). Requires supabase-js v2 (window.supabase)
   and window.TREERUN_CONFIG = {url, anonKey}. */
(function(){
  const cfg = window.TREERUN_CONFIG || {};
  const sb = window.supabase.createClient(cfg.url, cfg.anonKey, {auth:{persistSession:true, autoRefreshToken:true}});
  window.treerunSupabase = sb;

  const err = (code, message) => Object.assign(new Error(message || code), {code, message: message || code});
  const mapErr = e => {
    if (!e) return err("unavailable");
    const m = String(e.message || e);
    if (/row-level security|permission|JWT|not_found|violates/i.test(m)) return err("invalid_argument", m);
    if (/fetch|network|Failed to/i.test(m)) return err("unavailable", m);
    return err("invalid_argument", m);
  };
  const snap = row => ({ id: row.path.split("/").pop(), exists: true, data: () => row.data, metadata: {fromCache:false, hasPendingWrites:false} });

  // ---- one realtime channel feeding every listener ----
  const listeners = new Set(); let channel = null;
  function ensureChannel(){
    if (channel) return;
    channel = sb.channel("docs-live").on("postgres_changes", {event:"*", schema:"public", table:"docs"}, payload => {
      const row = payload.new && payload.new.path ? payload.new : null, old = payload.old && payload.old.path ? payload.old : null;
      for (const l of listeners) l(payload.eventType, row, old);
    }).subscribe(status => { if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { /* fall back to polling below */ } });
  }

  function collection(coll){
    const q = { _limit: 1000,
      limit(n){ const c = Object.create(q); c._limit = n; return c; },
      orderBy(){ return this; }, where(){ return this; },
      async get(){ const {data, error} = await sb.from("docs").select("path,data").eq("coll", coll).limit(this._limit); if (error) throw mapErr(error);
        const docs = data.map(snap); return {docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata:{fromCache:false,hasPendingWrites:false}}; },
      onSnapshot(next, onErr){
        const rows = new Map(); let alive = true, timer = null;
        const emit = () => { const docs = [...rows.values()].sort((a,b)=>a.path<b.path?-1:1).map(snap); next({docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata:{fromCache:false,hasPendingWrites:false}}); };
        const load = async () => { const {data, error} = await sb.from("docs").select("path,data").eq("coll", coll).limit(this._limit);
          if (!alive) return; if (error) { onErr && onErr(mapErr(error)); return; } rows.clear(); for (const r of data) rows.set(r.path, r); emit(); };
        const l = (ev, row, old) => { const p = (row || old).path; if (p.replace(/\/[^/]+$/, "") !== coll) return;
          if (ev === "DELETE") rows.delete(p); else rows.set(p, row); emit(); };
        listeners.add(l); ensureChannel(); load();
        timer = setInterval(load, 30000);          // safety net if realtime drops
        return () => { alive = false; listeners.delete(l); clearInterval(timer); };
      },
      doc(id){ return docRef(coll + "/" + (id || crypto.randomUUID().replace(/-/g,"").slice(0,20))); },
      async add(data){ const r = docRef(coll + "/" + crypto.randomUUID().replace(/-/g,"").slice(0,20)); await r.set(data); return r; }
    };
    return q;
  }
  function docRef(path){
    return { id: path.split("/").pop(), path,
      async get(){ const {data, error} = await sb.from("docs").select("path,data").eq("path", path).maybeSingle(); if (error) throw mapErr(error);
        return data ? snap(data) : {id: path.split("/").pop(), exists:false, data:()=>undefined, metadata:{}}; },
      async set(data){ const {error} = await sb.from("docs").upsert({path, data, updated_at: new Date().toISOString()}); if (error) throw mapErr(error); },
      async update(patch){ const {error} = await sb.rpc("doc_update", {p_path: path, p_patch: patch}); if (error) throw mapErr(error); },
      async delete(){ const {error} = await sb.from("docs").delete().eq("path", path); if (error) throw mapErr(error); },
      onSnapshot(next, onErr){
        let alive = true;
        const load = async () => { const d = await this.get().catch(e => { onErr && onErr(e); return null; }); if (alive && d) next(d); };
        const l = (ev, row, old) => { const p = (row || old).path; if (p !== path) return;
          next(ev === "DELETE" ? {id: path.split("/").pop(), exists:false, data:()=>undefined, metadata:{}} : snap(row)); };
        listeners.add(l); ensureChannel(); load(); const t = setInterval(load, 30000);
        return () => { alive = false; listeners.delete(l); clearInterval(t); };
      },
      collection(sub){ return collection(path + "/" + sub); } };
  }
  const db = { collection, doc: docRef };

  let me = null;
  const user = {
    async id(){ const {data} = await sb.auth.getUser(); return data.user ? (data.user.email || data.user.id) : null; },
    async me(){ const {data} = await sb.auth.getUser(); return {id: await this.id(), name: data.user?.email || "", guest:false}; },
    async can(){ const {data} = await sb.from("office_users").select("email").limit(1); return !!(data && data.length); },
    isOwner(){ return false; }, canEdit(){ return true; }, async profiles(){ return {}; }
  };

  const mcp = {
    async callTool(server, tool, input){
      const {data, error} = await sb.functions.invoke("outlook", {body: {tool, input}});
      if (error) { let msg = error.message; try { const b = await error.context.json(); msg = b.error || msg; } catch(e){}
        throw Object.assign(err(/not.?configured/i.test(msg) ? "server_not_connected" : "tool_error", msg)); }
      if (data && data.error) throw err("tool_error", data.error);
      return {content: [{type:"text", text: JSON.stringify(data)}], payload: data};
    },
    async listTools(){ return {servers:[{server:"Microsoft 365", authStatus:"connected", tools:[]}]}; }
  };

  const downloads = {
    async save({filename, data}){
      const blob = data instanceof Blob ? data : new Blob([typeof data === "string" ? Uint8Array.from(data, c => c.charCodeAt(0) & 255) : data], {type: filename.endsWith(".pdf") ? "application/pdf" : "application/octet-stream"});
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    }
  };

  let ready;
  const whenSignedIn = new Promise(res => ready = res);
  window.treerunSignedIn = () => ready();
  const caps = {db, user, mcp, downloads};
  window.claude = { use: async name => { await whenSignedIn; return caps[name] || null; } };
})();
