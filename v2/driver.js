/* Driver page (driver.html#<runToken>): an office-built run. The driver marks each stop, can add a few extra
   collections, then returns, unloads, and takes another run or finishes for the day. */
(function () {
  const { $, esc, short, toast, client, setEV, evYear } = TR;
  const { ask, confirmAct, notWhy, photoStep, dropPick, dpOf, otherDrops, totLine, telLink, callBtn, markErr } = FIELD;
  const sb = client();
  const DEPOT = "Primrose Hospice, St Godwalds Road, Bromsgrove B60 3BW";
  let token = (location.hash || "").replace(/^#/, "").trim();
  let data = null, busy = false, pend = null, showList = false;
  const q = s => encodeURIComponent(short(s.address) + ", " + s.postcode);
  const large = s => s.large && data.largeOn;

  // Google Maps directions in parts of 9 stops, ending at the drop-off
  function routeLinks(list, here) { const out = [];
    for (let i = 0; i < list.length; i += 9) { const part = list.slice(i, i + 9);
      const start = i === 0 ? (here ? "" : DEPOT) : short(list[i - 1].address) + ", " + list[i - 1].postcode;
      const pts = [start, ...part.map(s => short(s.address) + ", " + s.postcode)]; if (i + 9 >= list.length) pts.push(dpOf(data.run, data.dropPoints).full);
      out.push("https://www.google.com/maps/dir/" + pts.map(encodeURIComponent).join("/")); }
    return out; }

  function render() {
    const m = $("#main"); if (!data) { m.innerHTML = ""; return; }
    if (data.error) { $("#sub").textContent = ""; m.innerHTML = `<div class="empty">${data.error === "expired" ? "This run has finished. Thanks for helping Primrose Hospice!" : "This link isn't valid. Check you opened the latest message from the office."}</div>`; return; }
    const r = data.run, list = data.stops, mine = list.filter(s => s.status !== "moved"), missed = mine.filter(s => s.status === "Missed").length,
      got = mine.filter(s => s.status === "Collected").length, skipped = mine.filter(s => s.status === "Skipped").length, left = mine.length - missed - got - skipped, live = r.state === "out";
    $("#title").textContent = `Run ${r.n} · ${r.team}`; document.title = `TreeCycle ${evYear()} · Driver`;
    if (data.nextToken && r.state !== "out" && data.nextToken !== token) { location.hash = data.nextToken; return; }
    $("#sub").innerHTML = `${mine.length} stops · ${r.trees} trees${r.state !== "out" ? ' · <span class="chip">Finished</span>' : ""}${r.auto ? ' · <span class="chip ex">Your new run</span>' : ""}`;
    const call = callBtn(data.office);
    $("#howto").hidden = !live;
    if (!live && !showList) { m.innerHTML = endStage(r, got, missed, skipped, call); return; }
    const marked = mine.some(s => s.status === "Collected" || s.status === "Missed"), todo = mine.filter(s => s.status === "out");
    const links = routeLinks(marked ? todo : mine.filter(s => s.status !== "Skipped"), marked);
    m.innerHTML = `<div class="bar">${!live ? `<button class="btn blue" data-summary>Back</button>` : ""}${(live ? links : []).map((u, i) => `<a class="btn" href="${u}" target="_blank" rel="noopener">${links.length > 1 ? `Route part ${i + 1}` : marked ? "Route from here in Maps" : "Open route in Maps"}</a>`).join("")}${call}</div>
   <div class="prog">${got} collected · ${missed} missed${skipped ? ` · ${skipped} skipped` : ""} · ${left} to go</div>
   <div class="prog">${totLine(mine.reduce((t, s) => t + (s.status === "Collected" ? (+s.trees || 1) : 0), 0), data.report)}</div>
   ${list.map((s, i) => `<div class="stop ${s.status === "Missed" ? "m" : s.status === "Collected" ? "c" : s.status === "Skipped" ? "s" : ""} ${s.status === "moved" ? "d" : ""}">
     <div class="top"><div class="n">${i + 1}</div><div class="body" style="display:flex;flex-direction:column;gap:4px"><div class="clbl">Collection${s.rebooked ? ' <span class="chip">2nd visit</span>' : ""}${s.extra ? ' <span class="chip ex">Extra</span>' : ""}${large(s) ? ' <span class="chip big">Large tree</span>' : ""}</div>
     <div class="q1">${s.trees} tree${s.trees > 1 ? "s" : ""} · ${esc(s.name)}${telLink(s)}</div>
     <div class="ad1">${esc(short(s.address))}, ${esc(s.postcode)}</div><div class="in1">Info: ${esc(s.where)}${s.booked && s.booked != s.trees ? ` · booked ${s.booked}` : ""}</div></div></div>
     ${s.status === "moved" ? '<div class="info">Taken off your run by the office.</div>' :
      `<div class="acts">${live && s.status === "out" ? `<a class="btn navb nav" href="https://www.google.com/maps/dir/?api=1&destination=${q(s)}" target="_blank" rel="noopener">Navigate</a>` : ""}
       <button class="got ${s.status === "Collected" ? "on" : ""} ${pend && pend.ref === s.ref && pend.b === "Collected" ? "sel" : ""}" data-ref="${s.ref}" data-v="Collected" ${live ? "" : "disabled"}>Collected</button>
       <button class="miss ${s.status === "Missed" || s.status === "Skipped" ? "on" : ""}" data-ref="${s.ref}" data-v="Not" ${live ? "" : "disabled"}>Not collected</button></div>${s.status === "Skipped" ? `<div class="info">Skipped${s.skipReason ? ": " + esc(s.skipReason) : ""}. Back on the to-do list for ${s.skipReason === "Tree too big" ? "a large-tree team" : "another team"}.</div>` : ""}${(s.status === "Missed" || (s.status === "Skipped" && s.skipReason === "Tree too big")) ? (s.photo ? '<div class="phok">Photo added</div>' : live ? `<div class="acts"><button class="addph" data-addphoto="${s.ref}">Add photo</button></div>` : "") : ""}`}
   </div>`).join("")}
   ${!live ? "" : left ? `<button class="done" disabled>Mark every stop to finish · ${left} to go</button>`
     : `<div class="endp"><h2>All stops marked</h2><div class="sub">${got} collected, ${missed} missed${skipped ? `, ${skipped} skipped` : ""}. What next?</div>
       ${data.selfService && data.extraLeft > 0 ? `<button class="btn" data-extra>Add extra collections · up to ${data.extraLeft} trees</button>` : ""}<button class="btn blue" data-return>Returning to unload</button></div>`}`;
  }

  // After the run: heading back, unloading, unloaded, or the thank-you
  function endStage(r, got, missed, skipped, call) {
    if (r.doneAt) { const p = data.report || {};
      return `<div class="thanks"><h2>Thank you, ${esc(r.team)}!</h2><div class="lbl">Today your team collected</div><div class="big">${p.todayTrees ?? got}</div><div class="lbl">Christmas trees for Primrose Hospice</div>
      <div class="sm">${p.todayRuns || 1} run${(p.todayRuns || 1) === 1 ? "" : "s"} · ${p.todayStops ?? got} houses</div>
      ${p.allTrees > p.todayTrees ? `<div class="sm">This weekend so far: <b>${p.allTrees} trees</b> on ${p.allRuns} runs</div>` : ""}
      ${p.eventTrees ? `<div class="sm">Everyone together: <b>${p.eventTrees} trees</b> collected so far</div>` : ""}
      <div class="sm">Every tree you collected helps pay for care at Primrose Hospice. We couldn't do it without you. Have a well-earned rest!</div></div>
      <div class="bar">${data.teamLink ? `<a class="btn blue" href="team.html#${esc(data.teamLink)}" data-gohome>Home page</a>` : ""}<button class="btn ghost" data-showlist>See this run's stops</button>${call}</div>`; }
    const dp = dpOf(r, data.dropPoints);
    if (!r.unloadedAt && !r.arrivedAt) return `<div class="endp"><h2>Heading back to unload</h2><div class="sub">${got} collected, ${missed} missed${skipped ? `, ${skipped} skipped` : ""}.</div><div class="clbl">Drop-off point</div><div class="q1">${esc(dp.name)}</div><div class="ad1">${esc(dp.full)}</div>${dp.hours || dp.notes ? `<div class="in1">${esc([dp.hours, dp.notes].filter(Boolean).join(" · "))}</div>` : ""}
      <a class="btn navb" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dp.full)}" target="_blank" rel="noopener">Navigate to Drop Off</a><button class="btn blue" data-arrived>Arrived at ${esc(dp.name)}</button>${otherDrops(dp, data.dropPoints)}</div><div class="bar">${call}</div>`;
    if (!r.unloadedAt) return `<div class="endp"><h2>Unloading at ${esc(dp.name)}</h2><div class="sub">Unload your ${got} tree${got === 1 ? "" : "s"} where you're shown. Tap the button once the van is empty.</div>
      <button class="btn blue" data-unloaded>Unloaded</button></div><div class="bar">${call}</div>`;
    return `<div class="endp"><h2>Unloaded. Thank you!</h2><div class="sub">Run ${r.n} is done. Ready for more?</div>
      ${data.selfService ? `<button class="btn" data-nextrun>Give me another run</button>` : `<div class="sub">Call the office if you'd like another run.</div>`}
      <button class="btn blue" data-done>I'm done for the day</button></div><div class="bar">${call}</div>`;
  }

  // How many extra trees will fit (up to half a load)
  function howMany(max) { return new Promise(res => { const m = FIELD.modal(`<h2>How many more trees can you fit?</h2><div class="sub">Up to ${max} (half your van's load). We'll add the nearest waiting collections and update your route.</div>
   <div class="num"><button data-d="-1" aria-label="Fewer">−</button><input id="xn" type="number" inputmode="numeric" min="1" max="${max}" value="${max}"><button data-d="1" aria-label="More">+</button></div>
   <div class="bar"><button class="btn ghost" data-x="0">Cancel</button><button class="btn" data-x="1">Add collections</button></div>`);
    const inp = m.querySelector("#xn");
    m.addEventListener("click", e => { const d = e.target.closest("[data-d]"); if (d) { inp.value = Math.max(1, Math.min(max, (parseInt(inp.value, 10) || 0) + +d.dataset.d)); return; }
      const x = e.target.closest("[data-x]"); if (!x && e.target !== m) return; m.remove(); res(x?.dataset.x === "1" ? Math.max(1, Math.min(max, parseInt(inp.value, 10) || 0)) : null); }); }); }

  // One server step behind a button (Returning, Arrived, Unloaded, next run, done)
  async function step(btn, label, fn, args) { if (busy) return null; busy = true; btn.disabled = true; const old = btn.textContent; btn.textContent = label;
    const { data: res, error } = await sb.rpc(fn, { p_token: token, ...(args || {}) }); busy = false;
    if (error) { toast("Couldn't save. Check signal and tap again.", 2200); btn.disabled = false; btn.textContent = old; return null; } return res || {}; }

  async function load() { if (!token) { data = { error: "not_found" }; return render(); }
    const { data: d, error } = await sb.rpc("driver_get_run2", { p_token: token });
    if (error) { if (!data) $("#main").innerHTML = `<div class="empty">Couldn't load your run. Check your signal and tap Try again. If it keeps happening, call the office.</div><button class="btn" data-retry>Try again</button>`; else toast("No signal? Retrying…", 2200); return; }
    if (d && !d.error) setEV(d);
    data = d; render(); }

  const saveErr = (error, res) => toast(error ? "Couldn't save. Check signal and tap again." : markErr(res.error, false), 2200);
  async function saveTrees(s, n, b) { busy = true; b.disabled = true;
    const { data: res, error } = await sb.rpc("driver_trees", { p_token: token, p_ref: s.ref, p_trees: n }); busy = false;
    if (error || res?.error) { saveErr(error, res); await load(); return; }
    s.booked = res.booked; s.trees = n; s.status = "Collected"; render(); toast(`Collected ${n} tree${n === 1 ? "" : "s"}`, 2200); load(); }
  async function save(ref, v, why, b) {
    const s = data.stops.find(x => x.ref === ref); busy = true; b.disabled = true;
    const { data: res, error } = await sb.rpc("driver_set", { p_token: token, p_ref: +ref, p_status: v, p_reason: why, p_from: s.status === "Skipped" ? "Skipped" : s.status || "out" });
    busy = false; if (error || res?.error) { saveErr(error, res); await load(); return; }
    s.status = v; s.skipReason = why; s.photo = false; if (why === "Tree too big") s.large = true; render();
    toast(v === "out" ? "Undone" : v === "Collected" ? "Marked collected" : v === "Skipped" ? "Not collected: back on the to-do list" : why === "Can't find address" ? "Sent to the office to check" : "Marked not collected", 2200);
    if (v === "Missed" || why === "Tree too big") { await photoStep(sb, token, s, v === "Missed" ? (String(why || "").startsWith("Can't find") ? "cf" : "missed") : "toobig"); render(); }
    if (why === "Van full") { busy = true; const { data: r2, error: e2 } = await sb.rpc("driver_vanfull", { p_token: token }); busy = false;
      if (e2 || r2?.error) toast("Couldn't start the return. Tap Returning to unload when you're done.", 2200); else toast("Drive safely", 2200); window.scrollTo(0, 0); }
    load(); }

  document.addEventListener("click", async e => {
    if (e.target.closest("[data-retry]")) { load(); return; }
    if (e.target.closest("[data-gohome]")) { try { sessionStorage.setItem("tr-gohome", "1"); } catch (_) { } return; }
    if (e.target.closest("[data-showlist]")) { showList = true; render(); scrollTo(0, 0); return; }
    if (e.target.closest("[data-summary]")) { showList = false; render(); scrollTo(0, 0); return; }
    const sdp = e.target.closest("button[data-chdrop],button[data-setdrop]");
    if (sdp) { if (busy) return; const id = sdp.dataset.setdrop || await dropPick(data.dropPoints || [], data.run.dropPoint); if (!id) return;
      busy = true; const { data: res, error } = await sb.rpc("driver_set_drop", { p_token: token, p_id: id }); busy = false;
      if (error || res?.error) toast("Couldn't change it. Try again.", 2200); else toast(`Unloading at ${res.dropPoint.name}`, 2200); await load(); return; }
    const x = e.target.closest("button[data-extra],button[data-return],button[data-arrived],button[data-unloaded],button[data-nextrun],button[data-done]");
    if (x) { const k = x.dataset;
      if ("extra" in k) { if (!(data.extraLeft > 0)) { toast("You've had the most extra collections for this run. Head back to unload.", 2200); return; }
        const n = await howMany(data.extraLeft); if (!n) return; const res = await step(x, "Finding collections…", "driver_extra", { p_trees: n }); if (!res) return;
        if (res.ok) { toast(`Added ${res.stops} stop${res.stops === 1 ? "" : "s"} (${res.trees} tree${res.trees === 1 ? "" : "s"}). Route updated.`, 2200); await load(); return; }
        toast(res.error === "none_nearby" ? "No waiting collections near you. Head back to unload." : res.error === "limit" ? "You've had the most extra collections for this run. Head back to unload." : res.error === "switched_off" ? "The office has turned this off. Call the office." : "This run has been closed.", 2200); await load(); return; }
      if ("return" in k) { if (!await ask("Heading back to unload?", "Your run is finished and the office will see it straight away. You can't add more stops to this run afterwards.", "Returning to unload")) return;
        const res = await step(x, "Saving…", "driver_return"); if (!res) return;
        if (res.error === "not_finished") toast(`${res.left} stop${res.left === 1 ? "" : "s"} still to mark`, 2200); else toast("Drive safely", 2200); await load(); window.scrollTo(0, 0); return; }
      if ("arrived" in k) { if (await step(x, "Saving…", "driver_arrived")) { await load(); window.scrollTo(0, 0); } return; }
      if ("unloaded" in k) { if (await step(x, "Saving…", "driver_unloaded")) { await load(); window.scrollTo(0, 0); } return; }
      if ("nextrun" in k) { const res = await step(x, "Building your next run…", "driver_next_run"); if (!res) return;
        if (res.ok && res.token) { toast(res.n ? `Run ${res.n}: ${res.stops} stops, ${res.trees} trees` : "Opening your run", 2200); location.hash = res.token; return; }
        toast(res.error === "none_left" ? "There are no more collections waiting. Thank you! Tap I'm done for the day." : res.error === "team_busy" ? "Your team already has a run out. Check your messages." : res.error === "switched_off" ? "Call the office for your next run." : "Couldn't build a run. Call the office.", 2200); await load(); return; }
      if ("done" in k) { if (await step(x, "Saving…", "driver_done")) { await load(); window.scrollTo(0, 0); } return; }
      return; }
    const ap = e.target.closest("button[data-addphoto]");
    if (ap) { const s = data.stops.find(x => String(x.ref) === ap.dataset.addphoto); await photoStep(sb, token, s, s.status === "Missed" ? "missed" : "toobig"); render(); load(); return; }
    if (e.target.closest("button[data-cx]")) { pend = null; render(); return; }
    const cf = e.target.closest("button[data-cfm]");
    if (cf) { if (!pend || busy) return; const p = pend; pend = null; return save(p.ref, p.v, null, cf); }
    const b = e.target.closest("button[data-ref]"); if (!b || busy) return;
    const s = data.stops.find(x => String(x.ref) === b.dataset.ref); pend = null;
    const isOn = b.dataset.v === "Collected" ? s.status === "Collected" : (s.status === "Missed" || s.status === "Skipped");
    if (isOn) { if (!await confirmAct(s, "out")) return; return save(s.ref, "out", null, b); }
    if (b.dataset.v === "Collected") { const r = await confirmAct(s, "Collected"); if (!r) return; return r.extra !== 0 ? saveTrees(s, r.total, b) : save(s.ref, "Collected", null, b); }
    const nw = await notWhy(s); if (!nw) return; if (!await confirmAct(s, nw.v, nw.why)) return; save(s.ref, nw.v, nw.why, b);
  });
  window.addEventListener("hashchange", () => { token = (location.hash || "").replace(/^#/, "").trim(); data = null; render(); load(); window.scrollTo(0, 0); });
  load();
  setInterval(() => { if (!busy && !document.hidden && !document.querySelector(".modal")) load(); }, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !busy && !document.querySelector(".modal")) load(); });
})();
