/* Customer page (photo.html#<photoKey>), linked from the office's emails.
   Missed tree: see the driver's photos, then "my tree is out now" or "no longer needed".
   Out of area: correct the address, keep the payment as a donation, or ask for a refund. */
(async function () {
  const { client, loadEvent, evYear, lastDay, fmtD } = TR;
  const m = document.getElementById("main"), key = decodeURIComponent((location.hash || "").slice(1));
  const msg = t => { m.textContent = t; };
  let sb;
  try { sb = client(); } catch (e) { return msg("We couldn't load the photo just now. Please try again in a few minutes."); }
  const ev = loadEvent(sb).then(() => { const yr = "Primrose Hospice TreeCycle " + evYear(); document.title = yr; document.getElementById("h1").textContent = yr; document.getElementById("ft").textContent = yr; });
  if (!/^[A-Za-z0-9_-]{32,}$/.test(key)) return msg("This link isn't complete. Please open it straight from the email, or reply to the email and we'll help.");
  const fmt = (d, o) => new Date(d).toLocaleString("en-GB", o).replace(/[<>&]/g, "");
  const P = t => { const e = document.createElement("p"); e.textContent = t; return e; };
  const lastDayText = () => fmtD(lastDay(), { weekday: "long", day: "numeric", month: "long" });
  const until = data => data.cutoff ? fmt(data.cutoff, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }) : "";
  function btns(list) { const r = document.createElement("div"); r.className = "btns";
    for (const [t, cls, fn] of list) { const b = document.createElement("button"); b.className = "btn" + (cls ? " " + cls : ""); b.textContent = t; b.onclick = () => fn(b); r.append(b); } return r; }

  // ---- missed tree ----
  function stateBox(st, data) {
    const box = document.getElementById("st"); box.innerHTML = "";
    if (st === "ready") { box.className = "note ok"; box.append(P(`Thank you. Your tree is back on our list and a team will call again before the end of ${lastDayText()}.`), P("Please leave it somewhere our volunteers can see it from the road, for example at the front of the house or by the drive.")); return; }
    if (st === "not_needed") { box.className = "note"; box.append(P("Thank you for letting us know. We won't call again for this tree.")); return; }
    if (st === "rebooked") { box.className = "note ok"; box.append(P("Your collection is already back on our list. Please leave the tree where it can be seen from the road.")); return; }
    if (st === "closed") { box.className = "note"; box.append(P("This collection has been closed. If you have a question, please reply to the email we sent you.")); return; }
    if (!data.can_reply) { box.className = "note"; box.append(P("It's now too late to rebook online. If you have a question, please reply to the email we sent you.")); return; }
    box.className = "note";
    box.append(P("Please let us know what you'd like us to do" + (until(data) ? " (by " + until(data) + ")" : "") + ":"));
    const ask = (choice, text) => {
      box.innerHTML = ""; box.append(P(text));
      let wh = null; if (choice === "ready") { const f = document.createElement("div"); f.className = "form"; f.innerHTML = '<label>Where exactly is the tree? (optional)<input id="wh" maxlength="120" placeholder="e.g. by the side gate, left of the garage"></label>'; box.append(f); wh = f.querySelector("#wh"); }
      const r = document.createElement("div"); r.className = "btns";
      const yes = document.createElement("button"); yes.className = "btn go"; yes.textContent = "Yes, confirm";
      const no = document.createElement("button"); no.className = "btn"; no.textContent = "Go back";
      r.append(yes, no); box.append(r);
      no.onclick = () => stateBox("missed", data);
      yes.onclick = async () => { yes.disabled = no.disabled = true; yes.textContent = "Saving…";
        try { const { data: res, error } = await sb.rpc("customer_reply", { p_key: key, p_choice: choice, p_where: wh ? wh.value.trim() || null : null });
          if (error) throw error;
          if (res.ok) return stateBox(res.state, data);
          if (res.error === "too_late") return stateBox("missed", { ...data, can_reply: false });
          if (res.error === "already") return location.reload();
          throw new Error(res.error); }
        catch (e) { yes.disabled = no.disabled = false; yes.textContent = "Yes, confirm"; const w = P("That didn't save. Please check your connection and try again."); w.className = "warn"; box.append(w); } };
    };
    box.append(btns([["My tree is out now: please collect it", "go", () => ask("ready", `We'll put your tree back on our list for one more visit before the end of ${lastDayText()}. Please make sure it's out where our volunteers can see it from the road.`)],
      ["Collection no longer needed", "", () => ask("not_needed", "We'll take your address off our list and won't call again for this tree.")]]));
  }

  // ---- out of area ----
  let PC = null; const geo = async pc => { try { if (!PC) PC = await (await fetch("postcodes.json")).json(); const k = pc.toUpperCase().replace(/[^A-Z0-9]/g, ""); return PC.pc[k] || null; } catch (e) { return null; } };
  function oaBox(st, data) {
    const box = document.getElementById("st"); box.innerHTML = ""; box.className = "note";
    const paid = data.paid != null && !isNaN(+data.paid) ? " of £" + (+data.paid).toFixed(2).replace(/[.]00$/, "") : "";
    const done = (cls, ...t) => { box.className = "note" + (cls ? " " + cls : ""); box.innerHTML = ""; t.forEach(x => box.append(P(x))); };
    if (st === "oa_in") return done("ok", "Your collection is on our list. Please leave the tree somewhere our volunteers can see it from the road, for example at the front of the house or by the drive.");
    if (st === "oa_review") return done("", "Thank you, we've got your new address. It still looks outside our collection area, or we couldn't recognise the postcode, so the office will check it and get in touch.");
    if (st === "donated") return done("ok", "Thank you for your donation to Primrose Hospice. We won't be collecting a tree from you.");
    if (st === "refund") return done("", "Thank you. Your refund request has been passed to the office. Refunds can take a few days.");
    if (st === "closed") return done("", "This collection has been closed. If you have a question, please reply to the email we sent you.");
    const addr = [data.address, data.postcode].filter(Boolean).join(", ");
    box.append(P("The address we have for your collection" + (addr ? ", " + addr + "," : "") + " is outside the area our volunteers cover, so we can't collect your tree."));
    if (!data.can_reply) return box.append(P("It's now too late to change this online. Please reply to the email we sent you."));
    box.append(P("What would you like to do?" + (until(data) ? " (by " + until(data) + ")" : "")));
    const send = async (choice, extra = {}) => { try { const { data: res, error } = await sb.rpc("customer_oa_reply", { p_key: key, p_choice: choice, p_where: null, ...extra }); if (error) return null;
      if (res.ok) return res.state; if (res.error === "too_late") { data.can_reply = false; return "outarea"; } if (res.error === "already") { location.reload(); return null; } return res.error; } catch (e) { return null; } };
    const confirm = (choice, text) => { box.innerHTML = ""; box.append(P(text)); const err = P(""); err.className = "warn";
      box.append(btns([["Yes, confirm", "go", async b => { b.disabled = true; b.textContent = "Saving…"; const r = await send(choice); if (r) oaBox(r, data); else { b.disabled = false; b.textContent = "Yes, confirm"; err.textContent = "That didn't save. Please check your connection and try again."; } }],
        ["Go back", "", () => oaBox("outarea", data)]]), err); };
    box.append(btns([
      ["The address is wrong: correct it", "go", () => { box.innerHTML = ""; box.append(P("Please give the full address where the tree will be:"));
        const f = document.createElement("div"); f.className = "form";
        f.innerHTML = '<label>House number and street, and town<input id="na" maxlength="150" autocomplete="street-address"></label><label>Postcode<input id="np" maxlength="10" autocapitalize="characters" autocomplete="postal-code"></label><label>Where exactly will the tree be? (optional)<input id="nw" maxlength="120" placeholder="e.g. front garden, by the side gate"></label>';
        box.append(f); const err = P(""); err.className = "warn";
        box.append(btns([["Save the new address", "go", async b => { const a = f.querySelector("#na").value.trim(), pc = f.querySelector("#np").value.trim();
            if (a.length < 5) { err.textContent = "Please enter the house number, street and town."; return; }
            if (!/^[A-Za-z]{1,2}[0-9][A-Za-z0-9]?[ ]*[0-9][A-Za-z]{2}$/.test(pc)) { err.textContent = "Please check the postcode."; return; }
            b.disabled = true; b.textContent = "Saving…"; const g = await geo(pc);
            const r = await send("address", { p_address: a, p_postcode: pc, p_lat: g ? g[0] : null, p_lon: g ? g[1] : null, p_where: f.querySelector("#nw").value.trim() || null });
            if (r === "oa_in" || r === "oa_review" || r === "outarea") return oaBox(r, data);
            b.disabled = false; b.textContent = "Save the new address"; err.textContent = r === "bad_postcode" ? "Please check the postcode." : r === "bad_address" ? "Please enter the house number, street and town." : "That didn't save. Please check your connection and try again."; }],
          ["Go back", "", () => oaBox("outarea", data)]]), err); }],
      ["Keep my payment as a donation", "", () => confirm("donate", "Thank you! We'll keep your payment" + paid + " as a donation to Primrose Hospice, and we won't collect a tree.")],
      ["Ask for a refund", "", () => confirm("refund", "We'll ask the office to refund your payment" + paid + ". Refunds can take a few days.")]]));
  }

  try {
    const [res] = await Promise.all([sb.rpc("customer_photo", { p_key: key }), ev]);
    const { data, error } = res;
    if (error) return msg("We couldn't load the photo just now. Please try again in a few minutes.");
    if (data.error === "collected") return msg("Good news: your tree has now been collected. Thank you for supporting Primrose Hospice.");
    if (data.error) return msg("This link is no longer active. If you have a question, please reply to the email.");
    if (data.mode === "outarea") { m.innerHTML = '<div id="st"></div>'; return oaBox(data.state, data); }
    const re = /^data:image[/](jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
    if (!re.test(data.img || "")) { const day = data.missed_at ? " on " + fmt(data.missed_at, { weekday: "long", day: "numeric", month: "long" }) : "";
      m.innerHTML = '<p style="margin-top:0">Our volunteers called to collect your tree' + day + ' but couldn&#39;t find it.</p><div id="st"></div>'; stateBox(data.state, data); return; }
    const when = fmt(data.taken_at, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
    const imgs = (Array.isArray(data.imgs) ? data.imgs : []).filter(x => re.test(x || "")).slice(0, 4); if (!imgs.length) imgs.push(data.img);
    m.innerHTML = '<p style="margin-top:0">Our volunteers took ' + (imgs.length > 1 ? "these photos" : "this photo") + ' when they called to collect your tree and couldn&#39;t find it.</p><div class="photo"></div><p class="muted">Taken ' + when + '.</p><div id="st"></div>';
    const ph = m.querySelector(".photo"); imgs.forEach((src, i) => { const im = document.createElement("img"); im.alt = "Photo " + (i + 1) + " taken by our collection team"; im.src = src; ph.append(im); });
    stateBox(data.state, data);
  } catch (e) { msg("We couldn't load the photo just now. Please try again in a few minutes."); }
})();
