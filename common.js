/* Shared by team.html, driver.html, signup.html and photo.html.
   Needs supabase-js (window.supabase) and config.js (window.TREERUN_CONFIG) loaded first. */
(function (W) {
  const cfg = W.TREERUN_CONFIG || {};

  // Supabase client for the public pages: no sign-in, and every call gives up after 20 s (60 s for photos)
  function client() {
    const tfetch = (u, o = {}) => { const c = new AbortController(), t = setTimeout(() => c.abort(), /driver_photo/.test(String(u)) ? 60000 : 20000);
      return fetch(u, { ...o, signal: c.signal }).finally(() => clearTimeout(t)); };
    return W.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false }, global: { fetch: tfetch } });
  }

  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const short = a => String(a || "").replace(/, Worcestershire$/, "");
  function toast(t, ms) { const e = $("#toast"); if (!e) return; e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => e.hidden = true, ms || 2600); }

  // ---- collection days (settings/main.eventDays, from event_info / team_hours / driver_get_run2) ----
  const EV = { start: "2027-01-08", mode: "demo", large: false, days: ["2027-01-08", "2027-01-09", "2027-01-10"] };
  const addD = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const fmtD = (iso, o) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { timeZone: "UTC", ...o });
  const isoD = d => /^\d{4}-\d{2}-\d{2}$/.test(d || "");
  function setEV(h) { if (!h) return;
    if (h.eventStart) EV.start = h.eventStart; if (h.mode) EV.mode = h.mode;
    const L = (Array.isArray(h.days) ? h.days : []).filter(isoD); if (L.length) EV.days = [...new Set(L)].sort();
    if ("largeOn" in h) EV.large = !!h.largeOn; }
  const evYear = () => (EV.days[EV.days.length - 1] || EV.start).slice(0, 4);
  const lastDay = () => EV.days[EV.days.length - 1] || EV.start;
  // "Friday 8 to Sunday 10 January" / "Thursday 7 to Tuesday 12 January and Thursday 14 January"
  function evRange(L) { L = L || EV.days; const grp = []; let i = 0;
    while (i < L.length) { let j = i; while (j + 1 < L.length && addD(L[j], 1) === L[j + 1]) j++; grp.push([L[i], L[j]]); i = j + 1; }
    const one = (d, m) => fmtD(d, { weekday: "long", day: "numeric", ...(m ? { month: "long" } : {}) });
    const parts = grp.map(([a, b], n) => { const mEnd = n === grp.length - 1 || b.slice(5, 7) !== grp[n + 1][0].slice(5, 7);
      return a === b ? one(a, mEnd) : `${one(a, a.slice(5, 7) !== b.slice(5, 7))} to ${one(b, mEnd)}`; });
    return parts.length > 1 ? parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1] : (parts[0] || ""); }
  async function loadEvent(sb) { try { const { data } = await sb.rpc("event_info"); if (data && !data.error) setEV(data); return data; } catch (e) { return null; } }

  // ---- postcodes (postcodes.json: {pc:{B603BW:[lat,lon]}, sector:{B603:[lat,lon]}}) ----
  let PC = null;
  async function pcLookup(p) { if (!PC) PC = await fetch("postcodes.json").then(r => r.json());
    const k = String(p || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); if (PC.pc[k]) return { lat: PC.pc[k][0], lon: PC.pc[k][1] };
    const s = PC.sector[k.slice(0, -2)]; return s ? { lat: s[0], lon: s[1] } : null; }

  W.TR = { cfg, client, $, esc, short, toast, EV, setEV, evYear, lastDay, evRange, addD, fmtD, isoD, loadEvent, pcLookup };
})(window);
