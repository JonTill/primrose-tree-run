/* Volunteer sign-up (signup.html). One form per team; the office approves it on the Teams tab.
   The team gets its team link straight away (it says "waiting for approval" until then). */
(function () {
  const { client, EV, setEV, evRange, evYear, fmtD } = TR;
  const $ = id => document.getElementById(id), err = $("err");
  let DAYS = [];
  function setDays() {
    DAYS = EV.days.map(d => [d, fmtD(d, { weekday: "long", day: "numeric", month: "long" })]);
    $("days").innerHTML = DAYS.map(([k, l]) => `<div class="day"><label class="dn"><input type="checkbox" id="d-${k}"> <span>${l}</span></label><span><input type="time" id="f-${k}" value="09:00" aria-label="${l} from"> to <input type="time" id="t-${k}" value="15:30" aria-label="${l} to"></span></div>`).join("");
    $("evr").textContent = evRange() + " " + evYear();
    $("evf").textContent = "Primrose Hospice TreeCycle " + evYear(); document.title = "Volunteer team sign-up · Primrose Hospice TreeCycle " + evYear();
  }
  setDays();
  $("vehicle").addEventListener("change", e => { if (/Transit|trailer|Luton/i.test(e.target.value)) $("large").checked = true; });
  let sb = null; try { sb = client(); } catch (e) { }
  const shut = html => { $("main").innerHTML = `<div class="card"><h2>Thank you for your interest</h2><p style="margin-bottom:0">${html}</p></div>`; };
  const FULL = "We now have all the volunteer teams we need for this year's collection, so sign-ups are closed. Thank you for offering to help Primrose Hospice.";
  const CLOSED = "Sign-ups have closed. Thank you for offering to help Primrose Hospice.";
  if (sb) sb.rpc("event_info").then(({ data: e }) => { if (!e) return; const before = EV.days.join(); setEV(e); if (e.largeOn) $("largebox").style.display = ""; if (EV.days.join() !== before) setDays(); }).catch(() => { });
  if (sb) sb.rpc("signup_state").then(({ data: s }) => { if (s && s.open === false) shut(CLOSED); else if (s && s.full) shut(FULL); }).catch(() => { });
  const emOK = v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
  const MSG = { closed: "Sign-ups have closed. Please contact the Primrose Hospice fundraising team.", full: "Sorry, we now have all the teams we need this year, so we can't take your sign-up. Thank you for offering to help.",
    name: "Please enter a team name and your name.", phone: "Please enter a mobile number we can call on the day.", email: "Please check your email address.", vehicle: "Please choose your vehicle.",
    capacity: "Please say about how many trees fit in one load (8 to 25).", times: "Please tick at least one day, with a finish time after the start time.", consent: "Please tick the box to say we can keep your details.",
    busy: "Lots of people are signing up right now. Please try again in a few minutes.", already: "We've just had a sign-up from this email address. If you need to change anything, reply to the email we send you." };
  $("f").addEventListener("submit", async e => { e.preventDefault(); err.textContent = "";
    const v = id => $(id).value.trim();
    const slots = DAYS.filter(([k]) => $("d-" + k).checked).map(([k]) => ({ day: k, from: $("f-" + k).value, to: $("t-" + k).value }));
    const p = { name: v("name"), contact: v("contact"), phone: v("phone"), email: v("email"), vehicle: $("vehicle").value, capacity: v("capacity"), large: $("large").checked, slots,
      members: [2, 3].map(n => ({ name: v("m" + n + "n"), phone: v("m" + n + "p"), email: v("m" + n + "e") })).filter(m => m.name), notes: v("notes"), consent: $("consent").checked };
    const bad = p.name.length < 2 || p.contact.length < 2 ? "name" : p.phone.replace(/\D/g, "").length < 10 ? "phone" : !emOK(p.email) ? "email" : !p.vehicle ? "vehicle"
      : !(+p.capacity >= 8 && +p.capacity <= 25) ? "capacity" : !slots.length || slots.some(s => !s.from || !s.to || s.to <= s.from) ? "times" : !p.consent ? "consent" : "";
    if (bad) { err.textContent = MSG[bad]; return; }
    if (!sb) { err.textContent = "The form couldn't connect. Please check your signal and try again."; return; }
    const b = $("go"); b.disabled = true; b.textContent = "Sending…";
    try { const { data: r, error } = await sb.rpc("team_signup", { p }); if (error) throw error;
      if (r && r.ok) { const link = r.link ? location.href.split("#")[0].replace(/[^/]*$/, "") + "team.html#" + r.link : "";
        $("main").innerHTML = `<div class="card ok"><h2>Thank you!</h2><p>We've got your sign-up for <b></b>. The office will check it and let you know by email at <b></b>.</p>${link ? `<p><b>This is your team's link.</b> Keep it safe: once the office approves you, it becomes your team's page for the collection days. Until then it shows "waiting for approval".</p><p><a id="tl" style="word-break:break-all"></a></p><div class="btns" style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" id="cp" type="button" style="width:auto;flex:1 1 160px">Copy the link</button><a class="btn" id="op" style="width:auto;flex:1 1 160px;text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center">Open it</a></div><p class="muted">Tip: open it on your phone and add it to your home screen or bookmark it.</p>` : ""}<p style="margin-bottom:0">Every tree you collect helps pay for care at Primrose Hospice. We couldn't do it without you.</p></div>`;
        const bs = $("main").querySelectorAll("b"); bs[0].textContent = p.name; bs[1].textContent = p.email;
        if (link) { const a = $("tl"); a.href = link; a.textContent = link; $("op").href = link;
          $("cp").onclick = async () => { try { await navigator.clipboard.writeText(link); $("cp").textContent = "Copied"; } catch (e) { const r2 = document.createRange(); r2.selectNodeContents(a); const s = getSelection(); s.removeAllRanges(); s.addRange(r2); $("cp").textContent = "Selected: copy it"; } }; }
        scrollTo(0, 0); return; }
      err.textContent = MSG[r && r.error] || "That didn't send. Please try again.";
    } catch (x) { err.textContent = "That didn't send. Please check your signal and try again."; }
    b.disabled = false; b.textContent = "Send our sign-up"; });
})();
