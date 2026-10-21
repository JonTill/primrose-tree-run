/* Shared by the team page and the driver page: the pop-ups used at each collection, photos and drop-off points. */
(function (W) {
  const { esc, short, toast } = W.TR;
  const HQ = { id: "hq", name: "Primrose HQ", address: "Primrose Hospice, St Godwalds Road, Bromsgrove", postcode: "B60 3BW" };

  function modal(html) { const m = document.createElement("div"); m.className = "modal"; m.innerHTML = `<div class="box" role="dialog" aria-modal="true">${html}</div>`; document.body.appendChild(m); return m; }

  // Yes / no
  function ask(title, text, ok) { return new Promise(res => {
    const m = modal(`<h2>${esc(title)}</h2><div>${esc(text)}</div><div class="bar"><button class="btn ghost" data-x="0">Cancel</button><button class="btn" data-x="1" style="background:var(--blue);border-color:var(--blue)">${esc(ok)}</button></div>`);
    m.addEventListener("click", e => { const x = e.target.closest("[data-x]"); if (!x && e.target !== m) return; m.remove(); res(x?.dataset.x === "1"); }); }); }

  // Confirm Collected (with tree count), Not collected (with reason) or Undo
  function confirmAct(s, v, why) { return new Promise(res => {
    const b0 = s.booked || s.trees || 1, cf = String(why || "").startsWith("Can't find address"), cfn = cf ? String(why).replace(/^Can't find address:?\s*/, "") : "";
    const t = v === "Collected" ? "Confirm collected" : v === "out" ? "Undo this stop?" : cf ? "Can't find the address" : "Confirm not collected";
    const line = v === "Collected" ? `Booked: <b>${b0}</b> tree${b0 === 1 ? "" : "s"}. How many did you collect here?</div>
   <div class="num"><button data-d="-1" aria-label="One fewer">−</button><input id="tq" type="number" inputmode="numeric" min="1" max="30" value="${b0}" aria-label="Trees collected here"><button data-d="1" aria-label="One more">+</button></div>
   <div class="sub" id="tqt" style="text-align:center;font-size:1rem">`
      : v === "Missed" ? (cf ? `Reason: <b>Can't find the address</b>.${cfn ? ` Note: <b>${esc(cfn)}</b>.` : ""} The office will check the address and contact the customer. You can add a photo next if you want.` : "Reason: <b>No tree out</b>. You'll be asked for a photo next.")
      : v === "Skipped" ? (why === "Van full" ? "Reason: <b>Van full</b>. This one and any stops left on your run go back on the list for other teams. Then head back to unload." : `Reason: <b>${esc(why || "")}</b>. It goes back on the list for another team.`)
      : "It goes back to not done.";
    const m = modal(`<h2>${t}</h2><div><b>${esc(s.name)}</b><br>${esc(short(s.address))}, ${esc(s.postcode)}</div><div class="sub" style="font-size:1rem">${line}</div>
   <button class="btn" data-ok>Confirm</button><button class="btn ghost" data-x>Cancel</button>`);
    const inp = m.querySelector("#tq"), tot = () => { if (!inp) return; const n = parseInt(inp.value, 10) || 0, df = n - b0;
      m.querySelector("#tqt").innerHTML = df === 0 ? "Same as booked" : df > 0 ? `<b>${df}</b> more than booked` : `<b>${-df}</b> fewer than booked`; };
    tot(); inp && inp.addEventListener("input", tot);
    m.addEventListener("click", e => { const d = e.target.closest("[data-d]"); if (d && inp) { inp.value = Math.min(30, Math.max(1, (parseInt(inp.value, 10) || b0) + (+d.dataset.d))); tot(); return; }
      if (e.target.closest("[data-ok]")) { let n = b0; if (inp) { n = parseInt(inp.value, 10); if (!(n >= 1 && n <= 30)) { inp.focus(); return; } } m.remove(); return res(v === "Collected" ? { extra: n - b0, total: n } : true); }
      if (e.target.closest("[data-x]")) { m.remove(); res(false); } }); }); }

  // Why couldn't you collect it? -> {v:"Missed"|"Skipped", why}
  function notWhy(s) { return new Promise(res => {
    const m = modal(`<h2>Why couldn't you collect it?</h2><div><b>${esc(s.name)}</b><br>${esc(short(s.address))}, ${esc(s.postcode)}</div>
   <button class="btn badl" data-w="nt">No tree out</button><button class="btn badl" data-w="cf">Can't find the address</button><button class="btn badl" data-w="Tree too big">Tree too big</button>
   <div class="bar"><input id="why-other" type="text" maxlength="100" placeholder="Other reason"><button class="btn badl" data-w="Other" style="width:auto">Other</button></div>
   <button class="btn" data-w="Van full">Van full</button>
   <button class="btn ghost" data-w="">Cancel</button>`);
    m.addEventListener("click", e => { const x = e.target.closest("[data-w]"); if (!x) return; let w = x.dataset.w; m.remove();
      if (!w) return res(null); if (w === "nt") return res({ v: "Missed", why: null });
      if (w === "cf") return cfNote().then(n => res(n === null ? null : { v: "Missed", why: "Can't find address" + (n ? ": " + n : "") }));
      if (w === "Other") { const t = m.querySelector("#why-other").value.trim(); w = t ? "Other: " + t : "Other"; } res({ v: "Skipped", why: w }); }); }); }

  function cfNote() { return new Promise(res => {
    const m = modal(`<h2>Can't find the address</h2><div class="sub">Add a note for the office if it helps. This is optional.</div>
   <textarea id="cf-note" rows="3" autofocus maxlength="100" placeholder="e.g. No number 6, the road ends at 4" style="width:100%;font:inherit;padding:10px;border:1px solid var(--line);border-radius:10px"></textarea>
   <div class="sub">You can add a photo next if you want.</div>
   <button class="btn" data-c="1">Continue</button><button class="btn ghost" data-c="0">Cancel</button>`);
    m.addEventListener("click", e => { const x = e.target.closest("[data-c]"); if (!x) return; const t = m.querySelector("#cf-note").value.replace(/\s+/g, " ").trim().slice(0, 100); m.remove(); res(x.dataset.c === "1" ? t : null); }); }); }

  // Shrink a camera photo to a JPEG data URL (max side `max` px, under ~650 KB)
  function shrink(file, max, q) { return new Promise((res, rej) => { const u = URL.createObjectURL(file), i = new Image();
    i.onload = () => { const k = Math.min(1, max / Math.max(i.naturalWidth, i.naturalHeight)), c = document.createElement("canvas"); c.width = Math.round(i.naturalWidth * k); c.height = Math.round(i.naturalHeight * k);
      c.getContext("2d").drawImage(i, 0, 0, c.width, c.height); URL.revokeObjectURL(u); let out = c.toDataURL("image/jpeg", q);
      for (let qq = q - .1; out.length > 650000 && qq > .2; qq -= .1) out = c.toDataURL("image/jpeg", qq); res(out); };
    i.onerror = () => { URL.revokeObjectURL(u); rej(new Error("bad image")); }; i.src = u; }); }

  // Up to 4 photos of a missed / too-big tree. kind: missed | toobig | cf (can't find, optional). Resolves true if any were sent.
  function photoStep(sb, token, s, kind) { return new Promise(res => { let n = 0; const MAXP = 4;
    const m = modal(`<h2 data-h>${kind === "toobig" ? "Take a photo of the tree" : kind === "cf" ? "Add a photo (optional)" : "Take a photo of the house"}</h2><div class="sub" data-sb>${kind === "toobig" ? "So the office can see how big it is." : kind === "cf" ? "Of the street or where you looked, so the office can see." : "Front of the house or the drive, showing there's no tree out."}</div>
   <label class="btn camlab"><span data-cl>Take photo</span><input type="file" accept="image/*" capture="environment"></label><div class="sub" data-st hidden>Uploading photo…</div>
   <button class="btn ghost" data-np>${kind === "cf" ? "Skip" : "No photo"}</button>`);
    const inp = m.querySelector("input"), st = m.querySelector("[data-st]"), all = on => m.querySelectorAll("button,input").forEach(x => x.disabled = !on);
    const fin = async img => { if (!img) { if (n > 0) { m.remove(); return res(true); } return send(null, null); }
      all(false); st.hidden = false; st.textContent = "Uploading photo…";
      let thumb = null; try { thumb = await shrink(img, 240, .6); img = await shrink(img, 1280, .6); } catch (e) { toast("Couldn't read that photo. Try again."); all(true); st.hidden = true; return; }
      send(img, thumb); };
    const send = async (img, thumb) => { all(false); if (img) st.hidden = false;
      const { data: r, error } = await sb.rpc("driver_photo2", { p_token: token, p_ref: s.ref, p_kind: kind === "cf" ? "missed" : kind, p_img: img, p_thumb: thumb, p_n: img ? n + 1 : 1 });
      if (img && (error || r?.error)) { st.hidden = false; st.textContent = error ? "Photo didn't send: no signal. Tap Try again, or Skip." : "Couldn't save the photo. Tap Try again, or Skip.";
        let rt = m.querySelector("[data-rt]"); if (!rt) { rt = document.createElement("button"); rt.className = "btn"; rt.dataset.rt = ""; rt.textContent = "Try again"; m.querySelector("[data-np]").before(rt); }
        rt.hidden = false; rt.onclick = () => send(img, thumb); all(true); m.querySelector("[data-np]").textContent = n > 0 ? "Done" : "Skip photo"; return; }
      if (!img) { m.remove(); return res(false); }
      n++; s.photo = true; const rt = m.querySelector("[data-rt]"); if (rt) rt.hidden = true;
      if (n >= MAXP) { m.remove(); toast(`${n} photos added`); return res(true); }
      m.querySelector("[data-h]").textContent = `Photo ${n} added`; m.querySelector("[data-sb]").textContent = `You can add up to ${MAXP} photos. Add another, or tap Done.`;
      m.querySelector("[data-cl]").textContent = `Add another photo (${n + 1} of ${MAXP})`; st.hidden = true; inp.value = "";
      m.querySelector("[data-np]").textContent = "Done"; all(true); };
    inp.addEventListener("change", e => { const f = e.target.files && e.target.files[0]; if (f) fin(f); });
    m.querySelector("[data-np]").addEventListener("click", () => fin(null)); }); }

  // Choose a drop-off point (nearest first when the phone gives a position)
  function dropPick(pts, cur, title) { return new Promise(res => { const m = document.createElement("div"); m.className = "modal";
    const km = (a, b, c, d) => { const R = 6371, x = (c - a) * Math.PI / 180, y = (d - b) * Math.PI / 180, h = Math.sin(x / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
    const draw = pos => { const list = pts.map(p => ({ p, d: pos ? km(pos.lat, pos.lon, +p.lat, +p.lon) : null })); if (pos) list.sort((a, b) => a.d - b.d);
      m.innerHTML = `<div class="box" role="dialog" aria-modal="true"><h2>${esc(title || "Where are you unloading?")}</h2>${list.map(({ p, d }) => `<button class="btn ${cur && cur.id === p.id ? "" : "ghost"}" data-dp="${esc(p.id)}" style="text-align:left"><b>${esc(p.name)}</b>${d != null ? ` · ${d.toFixed(1)} km` : ""}<br><span style="font-weight:400;font-size:.9rem">${esc(p.address || "")}${p.postcode ? ", " + esc(p.postcode) : ""}${p.hours ? " · " + esc(p.hours) : ""}</span></button>`).join("")}<button class="btn ghost" data-dp="">Cancel</button></div>`; };
    draw(null); if (navigator.geolocation) navigator.geolocation.getCurrentPosition(g => { if (m.isConnected) draw({ lat: g.coords.latitude, lon: g.coords.longitude }); }, () => { }, { timeout: 6000, maximumAge: 300000 });
    m.addEventListener("click", e => { const x = e.target.closest("[data-dp]"); if (!x) return; m.remove(); res(x.dataset.dp || null); }); document.body.appendChild(m); }); }

  // The run's drop-off point (or the main one, or HQ), with a one-line address
  function dpOf(r, dropPoints) { const p = (r && r.dropPoint) || (dropPoints || [])[0] || HQ; return { ...p, full: `${p.address || ""}${p.postcode ? ", " + p.postcode : ""}` }; }
  // The other drop-off points, nearest to this one first
  function otherDrops(dp, dropPoints) { const k = (a, b) => a.lat == null || b.lat == null ? 0 : (a.lat - b.lat) ** 2 + ((a.lon - b.lon) * 0.61) ** 2;
    const o = (dropPoints || []).filter(p => p.id !== dp.id).sort((a, b) => k(dp, a) - k(dp, b)); if (!o.length) return "";
    return `<div class="clbl" style="color:var(--muted);margin-top:8px">Or unload at</div>` + o.map(p => `<button class="btn ghost" data-setdrop="${esc(p.id)}" style="text-align:left;line-height:1.3"><b>${esc(p.name)}</b><br><span style="font-weight:400;font-size:.9rem">${esc(p.address || "")}${p.postcode ? ", " + esc(p.postcode) : ""}${p.hours ? " · " + esc(p.hours) : ""}</span></button>`).join(""); }
  // "This run 6 trees · Today 14 · So far 30"
  function totLine(n, report) { const p = report || {}, a = [`This run <b>${n}</b> tree${n === 1 ? "" : "s"}`];
    if ((p.todayRuns || 0) > 1) a.push(`Today <b>${p.todayTrees || 0}</b>`);
    if ((p.allRuns || 0) > (p.todayRuns || 0) && (p.allRuns || 0) > 1) a.push(`So far <b>${p.allTrees || 0}</b>`); return a.join(" · "); }
  const telLink = x => x.phone ? ` · <a class="tel" href="tel:${esc(String(x.phone).replace(/\s/g, ""))}">${esc(x.phone)}</a>` : "";
  const navUrl = s => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(short(s.address) + ", " + s.postcode)}`;
  const callBtn = office => office ? `<a class="btn ghost" href="tel:${esc(office.replace(/\s/g, ""))}">Call office ${esc(office)}</a>` : "";
  // Message for a stop the phone tried to mark but the server refused
  const markErr = (e, team) => e === "already" ? (team ? "Already marked on the other phone" : "Changed on another phone. Showing the latest.")
    : e === "moved" ? (team ? "The office has moved this one. Getting your next job." : "Another team or the office has taken this stop.")
    : e === "not_found" ? (team ? "This run has finished. Updating your screen." : "This run has been completed.") : "Couldn't save.";

  W.FIELD = { modal, ask, confirmAct, notWhy, cfNote, shrink, photoStep, dropPick, dpOf, otherDrops, totLine, telLink, navUrl, callBtn, markErr };
})(window);
