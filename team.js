/* Team page (team.html#<teamToken>): one link per team for every collection day, on as many phones as they like.
   Start a run, get one collection at a time (two held), mark each, Van full / Head back, unload, repeat. */
(function () {
  const { $, esc, short, toast, client, EV, setEV, evYear, evRange, fmtD, addD, pcLookup } = TR;
  const { modal, ask, confirmAct, notWhy, photoStep, dropPick, dpOf, otherDrops, totLine, telLink, navUrl, callBtn, markErr } = FIELD;
  const sb = client();
  const teamToken = (location.hash || "").replace(/^#/, "").trim();
  window.addEventListener("hashchange", () => location.reload());
  let data = null, busy = false, token = "", geoOK = false, view = "home", lastOk = 0, loadSeq = 0, loading = false, loadAgain = null, gotEvent = false;
  try { if (sessionStorage.getItem("tr-gohome")) { view = "gohome"; sessionStorage.removeItem("tr-gohome"); } } catch (_) { }   // from the driver page Home button: skip the thank-you

  // ---- pop-ups only the team page uses ----
  function notFullWhy() { return new Promise(res => { const m = modal(`<h2>Heading back, not full?</h2><div class="sub">Any collections you haven't done go back on the list. It won't lower the number of trees the app plans for your vehicle.</div>
   <button class="btn" data-n="Out of time">Out of time</button><button class="btn" data-n="End of the day">End of the day</button><button class="btn" data-n="Other">Other reason</button><button class="btn ghost" data-n="">Cancel</button>`);
    m.addEventListener("click", e => { const b = e.target.closest("[data-n]"); if (!b) return; m.remove(); res(b.dataset.n || null); }); }); }
  // Where are you starting from? -> {lat,lon} | null (no position) | undefined (cancelled)
  function whereStart() { return new Promise(res => { const m = modal(`<h2>Where are you starting from?</h2><div class="sub">We'll send you somewhere no other team is working.</div>
   <button class="btn" data-w="gps">Use my location</button>${(data.dropPoints || []).map(p => `<button class="btn ghost" data-w="drop" data-id="${esc(p.id)}">We're at ${esc(p.name)}</button>`).join("")}
   <div class="bar"><input class="pcin" id="pc" placeholder="Or enter a postcode" autocomplete="postal-code"><button class="btn" data-w="pc" style="width:auto">Go</button></div>
   <div class="sub" id="ws"></div><button class="btn ghost" data-w="x">Cancel</button>`);
    m.addEventListener("click", async e => { const b = e.target.closest("[data-w]"); if (!b) return; const w = b.dataset.w, st = m.querySelector("#ws");
      if (w === "x") { m.remove(); return res(undefined); }
      if (w === "drop") { m.remove(); const p = (data.dropPoints || []).find(x => x.id === b.dataset.id); return res(p ? { lat: +p.lat, lon: +p.lon } : null); }
      if (w === "gps") { if (b.disabled) return; b.disabled = true; st.textContent = "Finding you…"; const p = await getPos(12000); b.disabled = false;
        if (!p) { st.textContent = "Couldn't get your location. Allow location for this page, or tap one of the other options."; return; } m.remove(); return res(p); }
      if (w === "pc") { const v = m.querySelector("#pc").value.trim(); if (!v) { st.textContent = "Enter a postcode"; return; } st.textContent = "Looking up…";
        let p = null; try { p = await pcLookup(v); } catch (_) { } if (!p) { st.textContent = "Postcode not found. Check it, or use your location."; return; } m.remove(); return res(p); } }); }); }

  function getPos(timeout) { return new Promise(res => { if (!navigator.geolocation) return res(null);
    let done = false; const fin = v => { if (!done) { done = true; res(v); } }; setTimeout(() => fin(null), (timeout || 10000) + 4000);   // never hang if the permission prompt is ignored
    navigator.geolocation.getCurrentPosition(p => { geoOK = true; fin({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }); }, () => fin(null), { enableHighAccuracy: false, timeout: timeout || 10000, maximumAge: 60000 }); }); }
  function netLine(ok) { const e = $("#net"); if (!e) return; if (ok) { lastOk = Date.now(); e.hidden = true; return; }
    e.hidden = false; e.textContent = "No signal" + (lastOk ? " · last updated " + new Date(lastOk).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "") + ". It will catch up when you have signal."; }
  async function rpc(fn, args, quiet) { let r; try { r = await sb.rpc(fn, args); } catch (e) { r = { error: e }; }
    if (r.error) { netLine(false); if (!quiet) toast("No signal? Try again in a moment."); return null; } netLine(true); return r.data || {}; }

  // ---- agreed times (Live mode stops runs starting outside them) ----
  const DAYN = { fri: 0, sat: 1, sun: 2 };   // old sign-ups used fri/sat/sun
  const slotDate = x => x.date || (/^\d{4}-/.test(x.day || "") ? x.day : addD(EV.start, DAYN[x.day] ?? 0));
  const slotTxt = x => x ? `${fmtD(slotDate(x), { weekday: "long", day: "numeric", month: "short" })}, ${x.from}–${x.to}` : "";
  function earlyFrom(x) { const [h, m] = x.from.split(":").map(Number), t = h * 60 + m - 15; return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0"); }
  // the start button, or the out-of-hours card
  function startGate(label) { const h = data.hours;
    if (!h || h.ok) return `${h && h.why === "approved" ? '<div class="crewnote">The office has approved an early start for one run.</div>' : ""}<button class="btn bigbtn" data-start>${label}</button>`;
    const rq = h.request || {}, mine = (h.slots || []).map(slotTxt).filter(Boolean);
    const req = rq.status === "pending" ? `<div class="crewnote">Early start requested. Waiting for the office… this page updates by itself.</div><button class="btn ghost" data-hrcheck>Check again</button>`
      : `${rq.status === "declined" ? '<div class="crewnote">The office said not yet. Please start at your agreed time.</div>' : ""}<button class="btn ghost" data-esreq>Ask the office to start early</button>`;
    return `<div class="endp"><h2>${h.next ? "Not your time yet" : "Outside your agreed times"}</h2><div class="sub">${h.next ? `Your next time is <b>${esc(slotTxt(h.next))}</b>. You can start a run from ${earlyFrom(h.next)}.` : "Your team has no more agreed times this year."}</div>${mine.length ? `<div class="sub">Your agreed times: ${esc(mine.join(" · "))}</div>` : ""}${req}</div>`; }

  async function load(withPos) {
    if (!teamToken) { data = { error: "not_found" }; return render(); }
    if (loading) { loadAgain = !!withPos || loadAgain === true; return; } loading = true; const my = ++loadSeq;
    try {
      let p = null; if (withPos && geoOK) p = await getPos(8000);
      const d = await rpc("team_get", { p_token: teamToken, p_lat: p?.lat ?? null, p_lon: p?.lon ?? null, p_acc: p?.acc ?? null }, true);
      if (my !== loadSeq) return;
      if (!d) { if (!data) { $("#sub").textContent = ""; $("#main").innerHTML = `<div class="empty">Couldn't load your team page. Check your signal and tap Try again. If it keeps happening, call the office.</div><button class="btn" data-retry>Try again</button>`; } return; }
      if (d.error === "not_found") { const s = await rpc("signup_status", { p_token: teamToken }, true); if (my !== loadSeq) return;   // a sign-up link not approved yet
        if (s && (s.state === "pending" || s.state === "declined" || s.state === "replaced")) { d.error = s.state; d.name = s.name; } }
      if (!d.error) { const h = await rpc("team_hours", { p_token: teamToken }, true); if (my !== loadSeq) return; if (h && !h.error) { d.hours = h; setEV(h); } }
      else if (!gotEvent) { const e = await rpc("event_info", {}, true); if (e && e.eventStart) { setEV(e); gotEvent = true; } }
      data = d; token = d.run?.token || ""; render();
    } finally { loading = false; if (loadAgain !== null) { const w = loadAgain; loadAgain = null; setTimeout(() => load(w), 0); } }
  }

  // which screen: home | live | office | returning | unloading | choose | done
  function phase() { const r = data.run, lo = data.team && data.team.loggedOffAt; if (!r) return lo && Date.now() - new Date(lo) < 12 * 3600e3 ? "done" : "home";
    if (r.state === "out" && r.mode === "live") return "live";
    if (r.state === "out") return "office";
    if (r.doneAt) return Date.now() - new Date(r.doneAt) < 12 * 3600e3 ? "done" : "home";
    if (r.officeClosedAt || !r.returningAt) return "home";
    if (!r.arrivedAt && !r.unloadedAt) return "returning";
    if (!r.unloadedAt) return "unloading";
    return "choose"; }
  function progBlock() { const p = data.report || {}, done = +p.eventTrees || 0, left = +p.eventToGo || 0, tot = done + left; if (!tot) return ""; const pc = Math.floor(done / tot * 100);
    return `<div class="evprog"><div class="pt">Primrose tree collection</div><div class="pb" role="progressbar" aria-valuenow="${pc}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pc}%"></i></div><div class="pn"><span><b>${pc}%</b> collected</span><span><b>${left}</b> tree${left === 1 ? "" : "s"} to go</span></div></div>`; }
  function statBlock() { const p = data.report || {}; return `<div class="stat"><div><b>${p.todayTrees || 0}</b><span>Trees today</span></div><div><b>${p.todayRuns || 0}</b><span>Runs today</span></div><div><b>${p.allTrees || 0}</b><span>All weekend</span></div></div>`; }

  function render() {
    const m = $("#main"); if (!data) { m.innerHTML = ""; return; }
    const plain = (title, sub, html) => { $("#title").textContent = title; $("#sub").textContent = sub; m.innerHTML = html; };
    if (data.error === "pending") return plain(data.name || "Your team", "Waiting for approval", `<div class="endp"><h2>Thanks for signing up!</h2><div class="sub">The office hasn't approved your sign-up yet. Keep this link: once you're approved, this page becomes your team's page for the collection days (${evRange()}).</div><div class="sub">Tip: add it to your home screen or bookmark it so it's easy to find.</div><button class="btn" data-retry>Check again</button></div>`);
    if (data.error === "declined") return plain(data.name || "Your team", "", `<div class="empty">Thank you for offering to help. The office doesn't need this team this time. If you think that's a mistake, please contact Primrose Hospice.</div>`);
    if (data.error === "replaced") return plain(data.name || "Your team", "", `<div class="empty">Your sign-up has been approved, but the office has given your team a new link. Please use the link they sent you, or ask the office for it.</div>`);
    if (data.error) return plain(`Primrose Hospice TreeCycle ${evYear()}`, "", `<div class="empty">This link isn't valid. Ask the office for your team's link.</div>`);
    const t = data.team, r = data.run, ph = (view === "gohome" && phase() === "done") ? "home" : phase(), call = callBtn(data.office);
    $("#title").textContent = t.name; document.title = t.name + " · TreeCycle " + evYear();
    if (t.paused && ph !== "live") { $("#sub").textContent = ""; m.innerHTML = `<div class="empty">The office has paused your link. Please call them.</div><div class="bar">${call}</div>`; return; }
    if (view === "summary" && ph !== "live") { const p = data.report || {};
      $("#sub").textContent = "What we've done";
      m.innerHTML = `${statBlock()}<div class="sub">So far: <b>${p.allTrees || 0} trees</b> on ${p.allRuns || 0} runs. Everyone together: <b>${p.eventTrees || 0} trees</b> collected for Primrose Hospice.</div><button class="btn ghost" data-v="home">Back</button>`; return; }
    if (ph === "live") { const j = data.jobs || [], cur = j[0], nxt = j[1], pz = t.paused ? '<div class="crewnote">The office has paused new jobs for your team. Finish what you have and call them.</div>' : "";
      $("#sub").innerHTML = `Run ${r.n} · ${totLine(r.collectedTrees || 0, data.report)}${t.large && EV.large ? ' · <span class="chip big">Large trees OK</span>' : ""}`;
      const tg = +r.target || 0, ld = tg ? `<div class="loadln">On board: <b>${r.collectedTrees || 0}</b> · Your Team's Vehicle Average is <b>${tg}</b> - Keep Going Until It's Full!</div>` : "";
      const back = `<button class="full" data-full>Van full · head back to unload</button><button class="nf" data-notfull>Head back, not full</button>`;
      if (!cur) { m.innerHTML = pz + (r.loadDone ? `<div class="endp"><h2>Nothing else close by</h2><div class="sub">${r.collectedTrees || 0} tree${r.collectedTrees === 1 ? "" : "s"} on board. If there's still room, look a bit further afield; otherwise head back to unload.</div><button class="full" data-full>Van full · head back to unload</button><button class="btn ghost" data-more>Still room · look further afield</button><button class="nf" data-notfull>Head back, not full</button></div><div class="bar">${call}</div>`
        : `<div class="empty">No more collections near you right now.</div><button class="btn ghost" data-again>Check again</button>${back}<div class="bar">${call}</div>`); return; }
      m.innerHTML = pz + `<div class="job"><div class="clbl">Collection${cur.rebooked ? ' <span class="chip">2nd visit</span>' : ""}${cur.large && EV.large ? ' <span class="chip big">Large tree</span>' : ""}</div>
      <div class="q1">${cur.trees} tree${cur.trees > 1 ? "s" : ""} · ${esc(cur.name)}${telLink(cur)}</div>
      <div class="ad1">${esc(short(cur.address))}, ${esc(cur.postcode)}</div>
      <div class="in1">Info: ${esc(cur.where)}</div>
      <a class="btn navb" href="${navUrl(cur)}" target="_blank" rel="noopener">Navigate</a>
      <div class="acts"><button class="got" data-mk="Collected">Collected</button><button class="miss" data-mk="Not">Not collected</button></div>${ld}</div>
      ${back}
      ${nxt ? `<div class="nxt"><div class="clbl">Next collection</div><div class="q2">${nxt.trees} tree${nxt.trees > 1 ? "s" : ""} · ${esc(nxt.name)}${telLink(nxt)}</div><div>${esc(short(nxt.address))}, ${esc(nxt.postcode)}</div><div style="color:var(--muted)">Info: ${esc(nxt.where)}</div><a class="btn ghost" style="margin-top:8px" href="${navUrl(nxt)}" target="_blank" rel="noopener">Navigate to next</a></div>` : ""}
      <div class="bar">${call}</div>`; return; }
    if (ph === "office") { $("#sub").textContent = `Run ${r.n} from the office`;
      m.innerHTML = `<div class="endp"><h2>You have a run from the office</h2><div class="sub">Open it to see your stops.</div><a class="btn" href="driver.html#${esc(r.token)}">Open run ${r.n}</a></div>`; return; }
    if (ph === "returning") { $("#sub").textContent = `Run ${r.n} · ${r.collectedTrees || 0} trees on board`; const dp = dpOf(r, data.dropPoints);
      m.innerHTML = `<div class="endp"><h2>Heading back to unload</h2><div class="clbl">Drop-off point</div><div class="q1">${esc(dp.name)}</div><div class="ad1">${esc(dp.full)}</div>${dp.hours || dp.notes ? `<div class="in1">${esc([dp.hours, dp.notes].filter(Boolean).join(" · "))}</div>` : ""}
      <a class="btn navb" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dp.full)}" target="_blank" rel="noopener">Navigate to Drop Off</a><button class="btn blue" data-st="driver_arrived">Arrived at ${esc(dp.name)}</button>${otherDrops(dp, data.dropPoints)}</div><div class="bar">${call}</div>`; return; }
    if (ph === "unloading") { $("#sub").textContent = `Run ${r.n}`;
      m.innerHTML = `<div class="endp"><h2>Unloading at ${esc(dpOf(r, data.dropPoints).name)}</h2><div class="sub">Unload your ${r.collectedTrees || 0} tree${r.collectedTrees === 1 ? "" : "s"} where you're shown. Tap the button once the van is empty.</div><button class="btn blue" data-st="driver_unloaded">Unloaded</button></div><div class="bar">${call}</div>`; return; }
    if (ph === "choose") { $("#sub").textContent = `Run ${r.n} done`;
      m.innerHTML = `<div class="endp"><h2>Unloaded. Thank you!</h2><div class="sub">Run ${r.n}: ${r.collectedTrees || 0} tree${r.collectedTrees === 1 ? "" : "s"} collected. Ready for more?</div>
      ${data.selfService ? startGate("Start another run") : `<div class="sub">Call the office if you'd like another run.</div>`}
      <button class="btn blue" data-st="driver_done">We're done for the day</button></div>${statBlock()}<div class="bar">${call}</div>`; return; }
    if (ph === "done") { const p = data.report || {}; $("#sub").textContent = "";
      m.innerHTML = `<div class="thanks"><h2>Thank you, ${esc(t.name)}!</h2><div class="tl">Today your team collected</div><div class="bigno">${p.todayTrees || 0}</div><div class="tl">Christmas trees for Primrose Hospice</div>
      <div class="sm">${p.todayRuns || 0} run${p.todayRuns === 1 ? "" : "s"} · ${p.todayStops || 0} house${p.todayStops === 1 ? "" : "s"}</div>
      ${p.allTrees > p.todayTrees ? `<div class="sm">So far: <b>${p.allTrees} trees</b> on ${p.allRuns} runs</div>` : ""}
      ${p.eventTrees ? `<div class="sm">Everyone together: <b>${p.eventTrees} trees</b> collected so far</div>` : ""}
      <div class="sm">Every tree you collected helps pay for care at Primrose Hospice. We couldn't do it without you. Have a well-earned rest!</div></div>
      <button class="btn ghost" data-v="gohome">Home page</button>`; return; }
    // home
    $("#sub").textContent = t.large && EV.large ? "Your team can take large trees" : "Primrose Hospice TreeCycle " + evYear();
    m.innerHTML = `<div class="home">${data.hours && data.hours.mode === "demo" ? `<div class="crewnote"><b>Practice mode.</b> ${data.hours.why === "demo" ? "Runs can start at any time." : "Team hours are being tested."}</div>` : ""}${progBlock()}${data.selfService ? startGate("Let's go get some trees!") : `<div class="empty">The office will send your runs. Keep this page for your summary.</div>`}
    <button class="btn ghost" data-v="summary">What we've done</button><button class="btn blue" data-logoff>We're done for the day</button>${statBlock()}<div class="sub">You'll get one collection at a time until your vehicle is full (it usually takes about ${t.target || 10} trees). Mark each one and the next appears. When the vehicle's full, tap <b>Van full</b>; if you have to come back early, tap <b>Head back, not full</b>.</div><div class="bar">${call}</div></div>`;
  }

  async function vanFull(why) { busy = true; const res = await rpc("team_vanfull", why ? { p_token: teamToken, p_notfull: why } : { p_token: teamToken }); busy = false;
    if (res && res.error) toast(res.error === "no_run" ? "Already heading back" : "Couldn't save. Try again."); else if (res) toast("Drive safely");
    await load(); window.scrollTo(0, 0); }

  document.addEventListener("click", async e => {
    if (e.target.closest("[data-retry]")) { load(); return; }
    const v = e.target.closest("[data-v]"); if (v) { view = v.dataset.v; render(); window.scrollTo(0, 0); return; }
    if (busy) { if (e.target.closest("button")) toast("Still saving… one moment"); return; }
    if (e.target.closest("[data-hrcheck]")) { await load(); return; }
    if (e.target.closest("[data-esreq]")) { busy = true; const res = await rpc("team_request_start", { p_token: teamToken }); busy = false;
      if (res && !res.error) toast(res.already_ok ? "You can start now" : "Request sent to the office"); await load(); return; }
    const st = e.target.closest("[data-start]");
    if (st) { const p = await whereStart(); if (p === undefined) return; busy = true; st.disabled = true; st.textContent = "Finding your first collection…";
      const res = await rpc("team_start", { p_token: teamToken, p_lat: p?.lat ?? null, p_lon: p?.lon ?? null, p_acc: p?.acc ?? null }); busy = false;
      if (res && res.error) toast(res.error === "none_left" ? "There are no collections waiting. Thank you!" : res.error === "paused" ? "The office has paused your link." : res.error === "switched_off" ? "The office will send your runs." : res.error === "out_of_hours" ? "It's outside your agreed times. Ask the office to start early." : "Couldn't start a run. Call the office.");
      view = "home"; await load(); window.scrollTo(0, 0); return; }
    const mk = e.target.closest("button[data-mk]");
    if (mk) { const cur = (data.jobs || [])[0]; if (!cur) return;
      let val = mk.dataset.mk, why = null, total = 0;
      if (val === "Not") { const nw = await notWhy(cur); if (!nw) return; val = nw.v; why = nw.why; if (!await confirmAct(cur, val, why)) return; }
      else { const r = await confirmAct(cur, "Collected"); if (!r) return; if (r.extra !== 0) total = r.total; }
      busy = true; mk.disabled = true;
      const res = total ? await rpc("driver_trees", { p_token: token, p_ref: cur.ref, p_trees: total, p_from: "out" }) : await rpc("driver_set", { p_token: token, p_ref: cur.ref, p_status: val, p_reason: why, p_from: "out" }); busy = false;
      if (!res) { render(); return; }
      if (res.error) { toast(markErr(res.error, true)); await load(); return; }
      const got = total || cur.trees;
      toast(res.late ? "Saved after Van full: it stays with your load" : val === "Collected" ? `Collected ${got} tree${got > 1 ? "s" : ""}` : val === "Skipped" ? "Not collected: back on the list" : String(why || "").startsWith("Can't find") ? "Sent to the office to check" : "Marked not collected");
      loadSeq++; if (data.jobs && data.jobs[0] && data.jobs[0].ref === cur.ref) { data.jobs.shift(); render(); }
      if (val === "Missed" || why === "Tree too big") await photoStep(sb, token, cur, val === "Missed" ? (String(why || "").startsWith("Can't find") ? "cf" : "missed") : "toobig");
      if (why === "Van full") { const vf = await rpc("team_vanfull", { p_token: teamToken }); if (!vf || vf.error && vf.error !== "no_run") { toast("Van full didn't save. Tap Van full again."); await load(); return; } toast("Drive safely"); await load(); window.scrollTo(0, 0); return; }
      await load(true); window.scrollTo(0, 0); return; }
    if (e.target.closest("[data-more]")) { busy = true; let p = null; if (geoOK) p = await getPos(6000);
      const res = await rpc("team_more", { p_token: teamToken, p_lat: p?.lat ?? null, p_lon: p?.lon ?? null, p_n: 2 }); busy = false;
      if (res && res.ok) toast(res.added ? "Found more. Keep going until the van is full." : "Nothing else near you. Head back to unload."); await load(); window.scrollTo(0, 0); return; }
    if (e.target.closest("[data-notfull]")) { const why = await notFullWhy(); if (!why) return; return vanFull(why); }
    if (e.target.closest("[data-again]")) { const b = e.target.closest("[data-again]"); busy = true; b.disabled = true; b.textContent = "Checking…";
      try { await rpc("team_fill", { p_token: teamToken }); } finally { busy = false; } await load(); if (!(data.jobs || []).length) toast("Nothing new yet. Try again in a few minutes."); return; }
    if (e.target.closest("[data-logoff]")) { if (!await ask("Done for the day?", "The office will see your team as logged off. You can still start another run later from the Home page.", "Done for the day")) return;
      busy = true; const res = await rpc("team_logoff", { p_token: teamToken }); busy = false;
      if (res && res.error) toast(res.error === "on_run" ? "Finish your run first" : "Couldn't save. Try again."); view = "home"; await load(); window.scrollTo(0, 0); return; }
    const sdp = e.target.closest("button[data-chdrop],button[data-setdrop]");
    if (sdp) { const id = sdp.dataset.setdrop || await dropPick(data.dropPoints || [], data.run && data.run.dropPoint); if (!id) return;
      busy = true; const res = await rpc("driver_set_drop", { p_token: token, p_id: id }); busy = false;
      if (res && res.error) toast("Couldn't change it. Try again."); else if (res) toast(`Unloading at ${res.dropPoint.name}`); await load(); return; }
    const fu = e.target.closest("[data-full]");
    if (fu) { if (!await ask("Van full?", "Any collections you haven't done go back on the list for other teams. The app learns how many trees your vehicle takes, so only tap this when it's really full.", "Van full")) return; fu.disabled = true; return vanFull(null); }
    const s2 = e.target.closest("[data-st]");
    if (s2) { busy = true; s2.disabled = true; const res = await rpc(s2.dataset.st, { p_token: token }); busy = false; if (res && res.error) toast("Couldn't save. Try again."); await load(); window.scrollTo(0, 0); return; }
  });

  load();
  let lastPoll = 0;
  setInterval(() => { const live = data && data.run && data.run.state === "out", gap = live ? 20000 : 60000;
    if (Date.now() - lastPoll < gap || busy || document.hidden || document.querySelector(".modal")) return; lastPoll = Date.now(); load(true); }, 5000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !busy && !document.querySelector(".modal")) load(true); });
})();
