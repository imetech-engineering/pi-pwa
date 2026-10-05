/* IMeTech Pi: status, historie, diensten en onderhoud van de RPi5. */
(function () {
  "use strict";
  const VERSIE = "1.1.0";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const fmt = (v, d = 0) => (v == null || isNaN(v) ? "-" : Number(v).toLocaleString("nl-NL", { maximumFractionDigits: d, minimumFractionDigits: d }));
  const fmtMB = (mb) => (mb == null ? "-" : mb >= 1024 ? fmt(mb / 1024, 1) + " GB" : fmt(mb) + " MB");
  const fmtUp = (s) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600); return d ? `${d}d ${h}u` : `${h}u ${Math.floor((s % 3600) / 60)}m`; };
  const tKort = (ts, r) => { const d = new Date(ts * 1000); return r === "1y" ? d.toLocaleDateString("nl-NL", { month: "short", year: "2-digit" }) : r === "7d" || r === "30d" ? d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" }) : d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }); };
  const tLang = (ts) => new Date(ts * 1000).toLocaleString("nl-NL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const BESCHERMD = { "n8n": "Hier draaien je n8n-workflows op.", "imetech-assistant": "Dit is je IMeTech-assistent.", "n8n-docx-append-1": "Hulpdienst van n8n.", "inboedel": "Jullie inboedel-lijst." };
  const STAAT = { running: "draait", online: "draait", paused: "gepauzeerd", exited: "gestopt", stopped: "gestopt", created: "aangemaakt", restarting: "herstart", errored: "fout", dead: "dood" };
  const METRIEK = {
    cpu: { t: "CPU", u: "%", max: 100, warn: 75, kol: [["cpu", "Gemiddeld"], ["cpu_max", "Piek"]] },
    mem: { t: "Geheugen", u: "%", max: 100, warn: 85, kol: [["mem", "In gebruik"], ["swap", "Swap"]] },
    temp: { t: "Temperatuur", u: "°C", max: 90, warn: 72, kol: [["temp", "Gemiddeld"], ["temp_max", "Piek"]] },
    disk: { t: "Schijf", u: "%", max: 100, warn: 80, kol: [["disk", "Gebruikt"]] },
    load: { t: "Load", u: "", kol: [["load1", "Load (1 min)"]] },
    net: { t: "Netwerk", u: "KB/s", kol: [["rx", "Binnen"], ["tx", "Uit"]], schaal: 1 / 1024 },
  };

  const BEREIK = [["1h", "1u"], ["24h", "24u"], ["7d", "7d"], ["30d", "30d"], ["1y", "1j"]];
  const S = { tab: "overzicht", ov: null, range: "24h", metriek: "cpu", hist: null, spark: null, ond: null, acties: null, detail: null, dRange: "24h", alleUnits: false, fout: null, gewapend: {} };

  /* ---------------- algemeen ---------------- */
  let toastT;
  function toast(tekst, fout = false) {
    const t = $("toast"); $("toast-tekst").textContent = tekst;
    t.classList.toggle("fout", fout); t.classList.remove("hidden");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.add("hidden"), 3500);
  }
  async function thema() {
    const c = await Opslag.instellingen();
    const aan = c.donker == null ? matchMedia("(prefers-color-scheme: dark)").matches : c.donker;
    document.documentElement.dataset.theme = aan ? "dark" : "";
    const meta = $("meta-theme-color"); if (meta) meta.content = aan ? "#121210" : "#2563EB";
    const logo = $("header-logo"); if (logo) logo.src = aan ? "branding/logo-wit.png" : "branding/logo-zwart.png";
  }
  function zetStatus(tekst, fout = false) { const s = $("status"); s.textContent = tekst; s.classList.toggle("error", fout); }
  const col = (h, naam) => (h ? h.rows.map((r) => r[h.cols.indexOf(naam) + 1]) : []);
  function niveau(p) { return p.some((x) => x.ernst === "probleem") ? "probleem" : p.length && p.some((x) => x.ernst === "let-op") ? "let-op" : "goed"; }

  /* ---------------- grafiek ---------------- */
  function grafiek(el, ts, series, o = {}) {
    if (!el) return;
    const W = Math.max(el.clientWidth, 260), H = el.clientHeight || 190, L = 36, R = 8, T = 8, B = 20;
    if (!ts.length) { el.innerHTML = `<div class="leeg2">Nog geen meetdata. De eerste punten komen binnen een paar minuten.</div>`; return; }
    let max = o.max ?? 0, stap;
    if (o.max == null) {
      for (const s of series) for (const v of s.values) if (v != null && v > max) max = v;
      const ruw = (max || 1) * 1.1 / 4, p = Math.pow(10, Math.floor(Math.log10(ruw))), n = ruw / p;
      stap = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; max = stap * 4;
    } else stap = max / 4;
    const t0 = ts[0], t1 = ts[ts.length - 1] === t0 ? t0 + 1 : ts[ts.length - 1];
    const x = (t) => L + ((t - t0) / (t1 - t0)) * (W - L - R), y = (v) => T + (1 - v / max) * (H - T - B);
    const gat = (o.bucket || 60) * 2.5, lijn = css("--border"), tekst = css("--text-tertiary");
    let g = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
    for (let i = 0; i <= 4; i++) {
      const v = (max * i) / 4, yy = y(v);
      g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="${lijn}" stroke-width="1"/>`;
      g += `<text x="${L - 6}" y="${yy + 4}" text-anchor="end" font-size="10" fill="${tekst}">${fmt(v, stap < 1 ? (stap < 0.1 ? 2 : 1) : stap % 1 ? 1 : 0)}</text>`;
    }
    const nT = W < 420 ? 3 : 5;
    for (let i = 0; i <= nT; i++) { const t = t0 + ((t1 - t0) * i) / nT; g += `<text x="${x(t)}" y="${H - 5}" text-anchor="${i === 0 ? "start" : i === nT ? "end" : "middle"}" font-size="10" fill="${tekst}">${tKort(t, o.range)}</text>`; }
    series.forEach((s, si) => {
      let d = "", prev = null;
      s.values.forEach((v, i) => { if (v == null) { prev = null; return; } const t = ts[i]; d += (prev == null || t - prev > gat ? "M" : "L") + x(t).toFixed(1) + " " + y(Math.min(v, max)).toFixed(1); prev = t; });
      if (si === 0) {
        let vlak = "", seg = []; const segs = [];
        s.values.forEach((v, i) => { if (v == null || (seg.length && ts[i] - ts[seg[seg.length - 1]] > gat)) { if (seg.length) segs.push(seg); seg = []; } if (v != null) seg.push(i); });
        if (seg.length) segs.push(seg);
        for (const sg of segs) vlak += `M${x(ts[sg[0]]).toFixed(1)} ${y(0)}` + sg.map((i) => `L${x(ts[i]).toFixed(1)} ${y(Math.min(s.values[i], max)).toFixed(1)}`).join("") + `L${x(ts[sg[sg.length - 1]]).toFixed(1)} ${y(0)}Z`;
        g += `<path d="${vlak}" fill="${s.kleur}" fill-opacity=".12"/>`;
      }
      g += `<path d="${d}" fill="none" stroke="${s.kleur}" stroke-width="${si === 0 ? 1.8 : 1}" stroke-linejoin="round" ${si ? 'stroke-opacity=".6"' : ""}/>`;
      if (si === 0) for (let i = s.values.length - 1; i >= 0; i--) if (s.values[i] != null) { g += `<circle cx="${x(ts[i]).toFixed(1)}" cy="${y(Math.min(s.values[i], max)).toFixed(1)}" r="3" fill="${s.kleur}"/>`; break; }
    });
    if (o.warn != null && o.warn < max) g += `<line x1="${L}" x2="${W - R}" y1="${y(o.warn)}" y2="${y(o.warn)}" stroke="${css("--let-op")}" stroke-width="1" stroke-dasharray="2 4" opacity=".8"/>`;
    g += `<line class="cur" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="${tekst}" stroke-width="1" visibility="hidden"/></svg>`;
    el.innerHTML = g + `<div class="tip" hidden></div>`;
    const svg = el.querySelector("svg"), tip = el.querySelector(".tip"), cur = svg.querySelector(".cur");
    const beweeg = (e) => {
      const r = svg.getBoundingClientRect(), px = ((e.clientX - r.left) * W) / r.width;
      let best = 0, bd = Infinity; ts.forEach((t, i) => { const dd = Math.abs(x(t) - px); if (dd < bd) { bd = dd; best = i; } });
      const xx = x(ts[best]); cur.setAttribute("x1", xx); cur.setAttribute("x2", xx); cur.setAttribute("visibility", "visible");
      tip.hidden = false; tip.style.left = Math.min(Math.max((xx * r.width) / W, 75), r.width - 75) + "px";
      tip.innerHTML = esc(tLang(ts[best])) + "<br>" + series.map((s) => `${esc(s.label)}: <b>${fmt(s.values[best], o.dec ?? 1)}${esc(o.u || "")}</b>`).join("<br>");
    };
    svg.addEventListener("pointermove", beweeg); svg.addEventListener("pointerdown", beweeg);
    svg.addEventListener("pointerleave", () => { tip.hidden = true; cur.setAttribute("visibility", "hidden"); });
  }
  const kleuren = () => [css("--accent"), css("--text-tertiary")];

  /* ---------------- laden ---------------- */
  async function laadOverzicht(stil = false) {
    try {
      S.ov = await Api.overzicht(); S.fout = null;
      const n = niveau(S.ov.problemen);
      zetStatus(`${S.ov.host} · up ${fmtUp(S.ov.uptime)} · ${n === "goed" ? "alles in orde" : n === "let-op" ? "let op" : "probleem"}`);
      const b = $("badge"); const nOnd = S.ond ? (S.ond.updates?.aantal || 0) + (S.ond.herstart_nodig ? 1 : 0) : 0;
      if (b) { b.textContent = nOnd || ""; b.classList.toggle("hidden", !nOnd); }
    } catch (e) { S.fout = e.message; zetStatus(e.message, true); }
    if (!stil) render();
    else if (S.tab === "overzicht" || (S.tab === "diensten" && !S.detail)) render();
  }
  async function laadSpark() { try { S.spark = await Api.historie("1h"); } catch (_) {} }
  async function laadHist() {
    try { S.hist = await Api.historie(S.range); } catch (_) { return; }
    tekenHoofd();
  }

  /* ---------------- overzicht ---------------- */
  function tegels() {
    const l = S.ov.last || {}, n = S.ov.ncpu || 4;
    const kleurM = (v, w, b) => (v == null ? "" : v >= b ? "rood" : v >= w ? "oranje" : "");
    const t = [
      ["cpu", "CPU", fmt(l.cpu), "%", `load ${fmt(l.load1, 2)}`, l.cpu, kleurM(l.cpu, 75, 90)],
      ["mem", "Geheugen", fmt(l.mem), "%", `van ${fmt(S.ov.mem_total_mb / 1024)} GB`, l.mem, kleurM(l.mem, 85, 92)],
      ["temp", "Temperatuur", fmt(l.temp), "°C", spanning(l.throttled) + (S.ov.onderspanning_30d ? ` · ${S.ov.onderspanning_30d} min onderspanning (30d)` : ""), l.temp == null ? null : (l.temp / 90) * 100, kleurM(l.temp, 72, 80)],
      ["disk", "Schijf", fmt(l.disk), "%", "systeemkaart", l.disk, kleurM(l.disk, 80, 90)],
      ["load", "Load", fmt(l.load1, 2), "", `${n} kernen`, l.load1 == null ? null : (l.load1 / n) * 100, kleurM(l.load1, n * 0.8, n * 1.5)],
      ["net", "Netwerk", fmt((l.rx || 0) / 1024), "KB/s", `uit ${fmt((l.tx || 0) / 1024)} KB/s`, null, ""],
    ];
    return `<div class="pi-tegels">${t.map(([k, lbl, v, u, sub, pct, kl]) => `<button type="button" class="pi-tegel" data-metriek="${k}" aria-pressed="${S.metriek === k}">
      <span class="lbl">${lbl}</span><span class="val">${v}<small>${u}</small></span>
      ${pct == null ? `<span class="meter" style="visibility:hidden"></span>` : `<div class="meter"><div class="meter-vul ${kl}" style="width:${Math.min(Math.max(pct, 2), 100)}%"></div></div>`}
      <span class="sub2">${esc(sub)}</span></button>`).join("")}</div>`;
  }
  function spanning(t) { if (t == null) return "spanning onbekend"; if (t & 0x1) return "onderspanning nu!"; if (t & 0x4) return "teruggeschakeld"; if (t & 0x50000) return "eerder onderspanning"; return "voeding ok"; }
  function statusKaart() {
    const p = S.ov.problemen || [], n = niveau(p);
    const titel = n === "goed" ? "Alles in orde" : n === "let-op" ? "Een paar aandachtspunten" : "Er is een probleem";
    return `<div class="card"><div class="pi-status"><span class="pi-status-stip ${n}"></span><div><b>${titel}</b><div class="sub">${S.ov.last?.ts ? "Laatste meting " + esc(tLang(S.ov.last.ts)) : "Eerste meting volgt zo"}</div></div></div>
      ${p.length ? `<ul class="pi-problemen">${p.map((x) => `<li><span class="tag ${x.ernst === "probleem" ? "rood" : "oranje"}">${x.ernst === "probleem" ? "Probleem" : "Let op"}</span><div>${esc(x.titel)}<small>${esc(x.uitleg)}</small></div></li>`).join("")}</ul>` : ""}</div>`;
  }
  function dienstRij(s) {
    const st = s.kind === "unit" ? "goed" : s.state === "running" || s.state === "online" ? "goed" : s.bewust_uit ? "grijs" : "probleem";
    const sub = s.kind === "unit" ? "systeemdienst" : (STAAT[s.state] || s.state) + (s.bewust_uit ? " (bewust)" : "") + (s.detail ? " · " + s.detail : "");
    return `<button type="button" class="pi-rij" data-dienst="${esc(s.key)}"><span class="stip-s ${st}"></span><span class="naam"><b>${esc(s.name)}</b><span>${esc(sub)}</span></span>
      <span class="getal">${s.cpu == null ? "-" : fmt(s.cpu, 1)}<small>%</small></span><span class="getal">${fmtMB(s.mem)}</span><svg class="ic"><use href="#ic-chevron"/></svg></button>`;
  }
  function renderOverzicht() {
    const m = METRIEK[S.metriek];
    const top = [...S.ov.services].filter((s) => s.mem != null).sort((a, b) => b.cpu + b.mem / 200 - (a.cpu + a.mem / 200)).slice(0, 5);
    return statusKaart() + tegels() + `
      <div class="card"><div class="kop"><b>${m.t}</b><div class="pi-seg" data-seg="range">${BEREIK.map(([r, t]) => `<button type="button" data-range="${r}" aria-pressed="${S.range === r}">${t}</button>`).join("")}</div></div>
      <div class="pi-chart" id="hoofd"></div><div class="pi-legenda" id="legenda"></div></div>
      <h2>Grootste verbruikers</h2><div class="pi-lijst">${top.map(dienstRij).join("") || `<p class="stil" style="padding:12px 14px;margin:0">Nog geen data</p>`}</div>`;
  }
  function tekenHoofd() {
    if (S.tab !== "overzicht" || !S.hist) return;
    const m = METRIEK[S.metriek], kl = kleuren(), ts = S.hist.rows.map((r) => r[0]);
    const series = m.kol.map(([c, label], i) => ({ label, kleur: kl[i], values: col(S.hist, c).map((v) => (v == null ? null : v * (m.schaal || 1))) }));
    grafiek($("hoofd"), ts, series, { max: m.max, warn: m.warn, u: m.u ? " " + m.u : "", range: S.range, bucket: S.hist.bucket, dec: S.metriek === "load" ? 2 : 1 });
    const lg = $("legenda"); if (lg) lg.innerHTML = series.map((s) => `<span><i style="background:${s.kleur}"></i>${esc(s.label)}</span>`).join("");
  }

  /* ---------------- diensten ---------------- */
  function renderDiensten() {
    const g = (k) => S.ov.services.filter((s) => s.kind === k);
    let units = g("unit"); const nU = units.length; if (!S.alleUnits) units = units.filter((u) => (u.mem || 0) >= 15 || (u.cpu || 0) >= 0.2).slice(0, 12);
    return `<h2>Docker</h2><div class="pi-lijst">${g("docker").map(dienstRij).join("") || '<p class="stil" style="padding:12px 14px;margin:0">Geen containers</p>'}</div>
      <h2>PM2</h2><div class="pi-lijst">${g("pm2").map(dienstRij).join("") || '<p class="stil" style="padding:12px 14px;margin:0">Geen PM2-processen</p>'}</div>
      <h2>Systeem</h2><div class="pi-lijst">${units.map(dienstRij).join("")}${nU > units.length || S.alleUnits ? `<button type="button" class="pi-meer" data-actie="alle-units">${S.alleUnits ? "Alleen de grotere tonen" : `Alle ${nU} systeemdiensten tonen`}</button>` : ""}</div>
      <p class="hint">CPU in % van de hele Pi (${S.ov.ncpu} kernen), geheugen als werkelijk RAM-gebruik.</p>`;
  }
  function knoppenVoor(s) {
    if (s.kind === "docker") return s.state === "running" ? [["pause", "Pauzeren", "pi-let-op"], ["restart", "Herstarten", "pi-let-op"], ["stop", "Stoppen", "pi-gevaar"]] : s.state === "paused" ? [["unpause", "Hervatten", "btn-primary"], ["stop", "Stoppen", "pi-gevaar"]] : [["start", "Starten", "btn-primary"]];
    if (s.kind === "pm2") return s.state === "online" ? [["restart", "Herstarten", "pi-let-op"], ["stop", "Stoppen", "pi-gevaar"]] : [["start", "Starten", "btn-primary"]];
    return [["restart", "Herstarten", "pi-let-op"]];
  }
  function renderDetail() {
    const s = S.ov.services.find((x) => x.key === S.detail);
    if (!s) return `<button type="button" class="pi-terug" data-actie="terug"><svg class="ic"><use href="#ic-terug"/></svg>Diensten</button><p class="stil">Deze dienst bestaat niet meer.</p>`;
    const soort = s.kind === "docker" ? "Docker · " + (s.image || "") : s.kind === "pm2" ? "PM2" : "Systeemdienst";
    return `<button type="button" class="pi-terug" data-actie="terug"><svg class="ic"><use href="#ic-terug"/></svg>Diensten</button>
      <div class="card"><div class="kop"><b style="font-size:1.0625rem">${esc(s.name)}</b><span class="tag ${s.state === "running" || s.state === "online" ? "groen" : "oranje"}">${esc(STAAT[s.state] || s.state)}</span></div>
      <div class="sub">${esc(soort)}${s.detail ? " · " + esc(s.detail) : ""}</div>
      <div class="pi-kv" style="margin-top:8px"><span>CPU nu</span><span>${s.cpu == null ? "-" : fmt(s.cpu, 1) + "%"}</span></div><div class="pi-kv"><span>Geheugen nu</span><span>${fmtMB(s.mem)}</span></div>
      ${BESCHERMD[s.name] ? `<p class="pi-noot">Let op: ${esc(BESCHERMD[s.name])} Stoppen of herstarten heeft direct effect.</p>` : ""}
      <div class="pi-knoppen">${knoppenVoor(s).map(([a, t, c]) => `<button type="button" class="${c}" data-dienstactie="${a}" data-label="${esc(t)}">${t}</button>`).join("")}<button type="button" class="btn-secondary" data-actie="logs">Logs</button></div></div>
      <div class="card"><div class="kop"><b>CPU</b><div class="pi-seg">${BEREIK.map(([r, t]) => `<button type="button" data-drange="${r}" aria-pressed="${S.dRange === r}">${t}</button>`).join("")}</div></div><div class="pi-chart klein" id="d-cpu"></div></div>
      <div class="card"><b>Geheugen</b><div class="pi-chart klein" id="d-mem"></div></div>
      <pre class="pi-log hidden" id="d-log"></pre>`;
  }
  async function tekenDetail() {
    if (!S.detail) return;
    let h; try { h = await Api.historie(S.dRange, S.detail); } catch (_) { return; }
    const ts = h.rows.map((r) => r[0]), kl = kleuren();
    grafiek($("d-cpu"), ts, [{ label: "Gemiddeld", kleur: kl[0], values: col(h, "cpu") }, { label: "Piek", kleur: kl[1], values: col(h, "cpu_max") }], { u: " %", range: S.dRange, bucket: h.bucket });
    grafiek($("d-mem"), ts, [{ label: "Geheugen", kleur: kl[0], values: col(h, "mem") }], { u: " MB", range: S.dRange, bucket: h.bucket, dec: 0 });
  }
  function openDetail(key) { S.detail = key; S.dRange = "24h"; window.Terug?.open?.("detail"); render(); $("scherm").scrollTop = 0; }
  function sluitDetail() { S.detail = null; window.Terug?.dicht?.("detail"); render(); }

  /* twee keer tikken voor ingrijpende acties */
  function bevestigd(btn, sleutel) {
    if (S.gewapend[sleutel]) { delete S.gewapend[sleutel]; return true; }
    S.gewapend[sleutel] = true; const oud = btn.textContent; btn.textContent = "Zeker? Tik nogmaals"; btn.classList.add("pi-zeker");
    setTimeout(() => { if (S.gewapend[sleutel]) { delete S.gewapend[sleutel]; btn.textContent = oud; btn.classList.remove("pi-zeker"); } }, 4000);
    return false;
  }
  async function dienstActie(btn) {
    const a = btn.dataset.dienstactie;
    if (a !== "start" && a !== "unpause" && !bevestigd(btn, "d:" + a)) return;
    btn.disabled = true; btn.textContent = "Bezig...";
    try { await Api.actie(S.detail, a); toast(`${btn.dataset.label}: gelukt`); }
    catch (e) { toast(e.message, true); }
    setTimeout(() => laadOverzicht(), 1200);
  }

  /* ---------------- onderhoud ---------------- */
  async function laadOnderhoud() {
    try { [S.ond, S.acties] = await Promise.all([Api.onderhoud(), Api.acties()]); } catch (e) { toast(e.message, true); }
    if (S.tab === "onderhoud") render();
    clearTimeout(laadOnderhoud.t);
    if (S.ond?.bezig?.length) laadOnderhoud.t = setTimeout(laadOnderhoud, 5000);
  }
  function knopTaak(taak, label, cls = "btn-primary") {
    const bezig = S.ond?.bezig?.includes(taak);
    return bezig ? `<span class="pi-bezig">${label}: bezig</span>` : `<button type="button" class="${cls}" data-taak="${taak}" data-label="${esc(label)}">${label}</button>`;
  }
  function renderOnderhoud() {
    const o = S.ond;
    if (!o) return `<p class="stil">Laden...</p>`;
    const u = o.updates || {}, dk = o.docker || {};
    const cache = dk["Build Cache"]?.vrij_te_maken, img = dk["Images"]?.vrij_te_maken;
    const certs = (o.certificaten || []).slice().sort((a, b) => (b.in_gebruik - a.in_gebruik) || ((a.dagen ?? 999) - (b.dagen ?? 999)));
    const laatsteAuto = o.auto?.opruimen;
    const b = o.backup || {};
    const tijd = (ts) => (ts ? tLang(ts) : "nog nooit");
    const backupKaart = `<div class="card${b.ingesteld && b.ok === false ? " fout" : ""}"><div class="kop"><b>Back-up</b>${!b.ingesteld ? '<span class="tag grijs">nog niet ingesteld</span>' : b.ok === false ? '<span class="tag rood">mislukt</span>' : '<span class="tag groen">ok</span>'}</div>
        ${!b.ingesteld ? '<p class="sub">De nachtelijke back-up naar de Synology wordt ingericht zodra de NAS bereikbaar is.</p>' : `
        <div class="pi-kv"><span>Laatst gelukt</span><span>${esc(tijd(b.laatst_gelukt))}</span></div>
        <div class="pi-kv"><span>Doel</span><span>${esc(b.doel || "-")}</span></div>
        <div class="pi-kv"><span>Grootte / duur</span><span>${esc(b.grootte || "-")} · ${b.duur_s != null ? fmt(b.duur_s / 60, 1) + " min" : "-"}</span></div>
        <div class="pi-kv"><span>Bewaarde versies</span><span>${esc(b.versies ?? "-")}</span></div>
        ${b.fout ? `<p class="pi-noot">${esc(b.fout)}</p>` : ""}
        <div class="pi-knoppen">${knopTaak("backup", "Nu back-uppen", "btn-secondary")}</div>`}</div>`;
    const du = o.docker_updates || [];
    const dockerKaart = `<div class="card"><div class="kop"><b>Docker-images</b>${du.some((x) => x.update) ? `<span class="tag oranje">${du.filter((x) => x.update).length} update</span>` : '<span class="tag groen">actueel</span>'}</div>
        ${du.map((x) => `<div class="pi-kv"><span>${esc(x.container)} <small class="stil">${esc(x.image)} · ${esc(x.gemaakt || "")}</small></span><span>${x.update ? '<span class="tag oranje">nieuwe versie</span>' : x.status === "actueel" ? '<span class="tag groen">actueel</span>' : '<span class="tag grijs">eigen image</span>'}</span></div>
          ${x.update ? `<div class="pi-knoppen" style="margin:0 0 6px">${x.compose || x.container === "inboedel" ? knopTaak("docker_update:" + x.container, x.container + " bijwerken", "pi-let-op") : '<span class="stil">Bijwerken via Claude</span>'}</div>` : ""}`).join("") || '<p class="stil">Geen containers.</p>'}
        <p class="hint">Bij bijwerken blijft de vorige versie bewaard (tag "vorige"), zodat terugzetten kan. Grote sprongen (zoals n8n) eerst even laten checken.</p></div>`;
    const ws = o.websites || [];
    const webKaart = `<div class="card"><div class="kop"><b>Websites</b>${ws.length ? (ws.every((w) => w.ok) ? '<span class="tag groen">alles bereikbaar</span>' : '<span class="tag rood">storing</span>') : '<span class="tag grijs">eerste check volgt</span>'}</div>
        ${ws.map((w) => `<div class="pi-kv"><span><span class="stip-i ${w.ok ? "goed" : "probleem"}"></span>${esc(w.naam)}</span><span>${w.ok ? fmt(w.ms) + " ms" : "status " + esc(w.status || "geen")}${w.beschikbaar_7d != null ? ` · ${fmt(w.beschikbaar_7d, 1)}%` : ""}</span></div>`).join("")}
        <p class="hint">Elke 5 minuten gecontroleerd. Percentage = bereikbaarheid laatste 7 dagen.</p></div>`;
    const f2b = o.fail2ban || {};
    const beveiligKaart = `<div class="card"><div class="kop"><b>Beveiliging</b></div>
        <div class="pi-kv"><span>Automatische beveiligingsupdates</span><span>${o.auto_beveiliging ? "aan" : "uit"}</span></div>
        ${Object.entries(f2b).map(([j, v]) => `<div class="pi-kv"><span>Geblokkeerd (${esc(j === "nginx-scanners" ? "scanners" : j)})</span><span>${v.nu} nu · ${v.totaal} totaal</span></div>`).join("") || '<div class="pi-kv"><span>Scanners blokkeren (fail2ban)</span><span>uit</span></div>'}</div>`;
    return backupKaart + `
      ${o.herstart_nodig ? `<div class="card fout"><b>Herstart nodig</b><p class="sub">Na de laatste updates wil de Pi een keer opnieuw opstarten. Diensten zijn dan ongeveer een minuut weg.</p><div class="pi-knoppen">${knopTaak("herstart", "Pi herstarten", "pi-gevaar")}</div></div>` : ""}
      <div class="card"><div class="kop"><b>Updates</b><span class="tag ${u.aantal ? "oranje" : "groen"}">${u.aantal ? u.aantal + " beschikbaar" : "bijgewerkt"}</span></div>
        <div class="pi-kv"><span>Waarvan beveiliging</span><span>${u.beveiliging ?? 0}</span></div>
        <div class="pi-kv"><span>Automatische beveiligingsupdates</span><span>${o.auto_beveiliging ? "aan" : "uit"}</span></div>
        ${u.pakketten?.length ? `<p class="pi-pakketten">${esc(u.pakketten.join(", "))}</p>` : ""}
        <div class="pi-knoppen">${u.aantal ? knopTaak("updates", "Nu installeren") : ""}${o.auto_beveiliging ? "" : knopTaak("auto_beveiliging", "Automatisch aanzetten", "btn-secondary")}</div></div>
      ${dockerKaart}${webKaart}${beveiligKaart}
      <div class="card"><div class="kop"><b>Opruimen</b><span class="tag grijs">elke nacht automatisch</span></div>
        <div class="pi-kv"><span>Docker build-cache vrij te maken</span><span>${esc(cache ?? "-")}</span></div>
        <div class="pi-kv"><span>Ongebruikte images</span><span>${esc(img ?? "-")}</span></div>
        <div class="pi-kv"><span>Systeemlogs</span><span>${esc(o.journal ?? "-")}</span></div>
        <div class="pi-kv"><span>Laatst automatisch opgeruimd</span><span>${esc(laatsteAuto || "nog niet")}</span></div>
        <div class="pi-knoppen">${knopTaak("opruimen", "Nu opruimen", "btn-secondary")}</div></div>
      <div class="card"><div class="kop"><b>Certificaten</b></div>
        ${certs.map((c) => `<div class="pi-kv"><span>${esc(c.domein)}${c.naam !== c.domein ? ` <small class="stil">(${esc(c.naam)})</small>` : ""}</span><span>${!c.in_gebruik ? '<span class="tag grijs">niet in gebruik</span>' : `<span class="tag ${c.dagen < 4 ? "rood" : c.dagen < 14 ? "oranje" : "groen"}">nog ${c.dagen} dagen</span>`}</span></div>`).join("") || '<p class="stil">Geen certificaten gevonden.</p>'}
        <div class="pi-knoppen">${knopTaak("certificaten", "Nu vernieuwen", "btn-secondary")}</div></div>
      ${o.herstart_nodig ? "" : `<div class="card"><b>Pi herstarten</b><p class="sub">Alleen nodig als iets vastloopt. Alle diensten zijn dan ongeveer een minuut weg.</p><div class="pi-knoppen">${knopTaak("herstart", "Pi herstarten", "pi-gevaar")}</div></div>`}
      <h2>Logboek</h2><div class="pi-lijst">${(S.acties || []).slice(0, 40).map((e) => `<div class="pi-rij" style="cursor:default"><span class="stip-s ${e.ok ? "goed" : "probleem"}"></span><span class="naam"><b>${e.bron === "claude" ? "" : esc(e.target.replace(/^[\w_]+:/, "")) + " · "}${esc(e.action)}${e.bron && e.bron !== "app" ? ` <span class="tag ${e.bron === "claude" ? "" : "grijs"}">${e.bron === "claude" ? "Claude" : "automatisch"}</span>` : ""}</b><span>${esc(tLang(e.ts))}${e.output ? " · " + esc((e.bron === "claude" ? e.output : e.output.split("\n").pop()).slice(0, 120)) : ""}</span></span></div>`).join("") || '<p class="stil" style="padding:12px 14px;margin:0">Nog niets gebeurd.</p>'}</div>`;
  }
  async function taak(btn) {
    const t = btn.dataset.taak;
    if (t !== "auto_beveiliging" && t !== "backup" && !bevestigd(btn, "t:" + t)) return;
    btn.disabled = true;
    try { await Api.taak(t); toast(`${btn.dataset.label}: gestart`); } catch (e) { toast(e.message, true); }
    laadOnderhoud();
  }

  /* ---------------- instellingen ---------------- */
  async function renderInstellingen() {
    const c = await Opslag.instellingen();
    const donker = document.documentElement.dataset.theme === "dark";
    return `
      <div class="inst-kop">Verbinding</div>
      <div class="inst-kaart"><div class="inst-inhoud"><form id="f-verbinding">
        <label>Adres van de Pi<input id="i-adres" type="url" value="${esc(c.adres)}" autocomplete="off"></label>
        <label>Token<input id="i-token" type="password" value="${esc(c.token)}" autocomplete="off" placeholder="Wordt automatisch gevuld via de koppellink"></label>
        <div class="inst-knoppen"><button type="submit">Opslaan en testen</button></div></form>
        <p class="hint" id="v-status">${c.token ? (S.fout ? esc(S.fout) : "Gekoppeld met " + esc(c.adres)) : "Nog niet gekoppeld. Open de koppellink die Claude je geeft, dan gaat dit vanzelf."}</p></div></div>
      <div class="inst-kop">Weergave</div>
      <div class="inst-kaart"><label class="inst-rij"><span class="inst-label">Donkere modus</span><input type="checkbox" id="i-donker" ${donker ? "checked" : ""}></label></div>
      <div class="inst-kop">App</div>
      <div class="inst-kaart"><button type="button" class="inst-rij inst-knop" id="btn-install-settings" style="width:100%;background:transparent;border-radius:0;font-weight:400"><span class="inst-label">Installeren op startscherm</span><span class="inst-chev"></span></button>
        <p class="inst-noot hidden" id="install-manual">Chrome bood de installatie niet automatisch aan. Tik rechtsboven op het menu (de drie puntjes) en kies "App installeren" of "Toevoegen aan startscherm".</p></div>
      <p class="pi-voet">IMeTech Pi ${VERSIE}${S.ov ? " · server " + esc(S.ov.versie || "") : ""}</p>`;
  }

  /* ---------------- render ---------------- */
  async function render() {
    const m = $("scherm");
    $("kop").textContent = S.tab === "overzicht" ? "Pi" : S.tab === "diensten" ? "Diensten" : S.tab === "onderhoud" ? "Onderhoud" : "Instellingen";
    if (S.tab === "instellingen") { m.innerHTML = await renderInstellingen(); return; }
    if (!S.ov) {
      m.innerHTML = S.fout ? `<div class="card fout"><b>Geen verbinding</b><p class="sub">${esc(S.fout)}</p><div class="pi-knoppen"><button type="button" class="btn-primary" data-tabknop="instellingen">Naar instellingen</button></div></div>` : `<p class="stil">Laden...</p>`;
      return;
    }
    const scroll = m.scrollTop;
    if (S.tab === "overzicht") { m.innerHTML = renderOverzicht(); tekenHoofd(); }
    else if (S.tab === "diensten") { m.innerHTML = S.detail ? renderDetail() : renderDiensten(); if (S.detail) tekenDetail(); }
    else if (S.tab === "onderhoud") m.innerHTML = renderOnderhoud();
    m.scrollTop = scroll;
  }
  function kiesTab(tab) {
    if (S.detail) { S.detail = null; window.Terug?.dicht?.("detail"); }
    S.tab = tab;
    document.querySelectorAll(".bottom-nav button").forEach((b) => b.classList.toggle("actief", b.dataset.tab === tab));
    window.Terug?.sync?.(tab === "overzicht" ? [] : ["tab"]);
    $("scherm").scrollTop = 0;
    render();
    if (tab === "overzicht") laadHist();
    if (tab === "onderhoud") laadOnderhoud();
  }

  /* ---------------- events ---------------- */
  document.addEventListener("click", async (e) => {
    const nav = e.target.closest(".bottom-nav [data-tab]"); if (nav) return kiesTab(nav.dataset.tab);
    const tk = e.target.closest("[data-tabknop]"); if (tk) return kiesTab(tk.dataset.tabknop);
    const tg = e.target.closest("[data-metriek]"); if (tg) { S.metriek = tg.dataset.metriek; document.querySelectorAll(".pi-tegel").forEach((b) => b.setAttribute("aria-pressed", b === tg)); document.querySelector(".card .kop b").textContent = METRIEK[S.metriek].t; return tekenHoofd(); }
    const rg = e.target.closest("[data-range]"); if (rg) { S.range = rg.dataset.range; rg.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b === rg)); return laadHist(); }
    const dr = e.target.closest("[data-drange]"); if (dr) { S.dRange = dr.dataset.drange; dr.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b === dr)); return tekenDetail(); }
    const di = e.target.closest("[data-dienst]"); if (di) { if (S.tab !== "diensten") { S.tab = "diensten"; document.querySelectorAll(".bottom-nav button").forEach((b) => b.classList.toggle("actief", b.dataset.tab === "diensten")); } return openDetail(di.dataset.dienst); }
    const da = e.target.closest("[data-dienstactie]"); if (da) return dienstActie(da);
    const ta = e.target.closest("[data-taak]"); if (ta) return taak(ta);
    if (e.target.closest("#btn-install-settings")) {
      if (window.Installatie?.isStandalone?.()) return toast("Je gebruikt de geïnstalleerde app al");
      if (window.Installatie?.canPrompt?.()) { await Installatie.promptInstall(); return; }
      $("install-manual")?.classList.remove("hidden");
      return;
    }
    const ac = e.target.closest("[data-actie]");
    if (ac) {
      const a = ac.dataset.actie;
      if (a === "terug") return sluitDetail();
      if (a === "alle-units") { S.alleUnits = !S.alleUnits; return render(); }
      if (a === "logs") {
        const pre = $("d-log"); pre.classList.remove("hidden"); pre.textContent = "Logs laden...";
        try { pre.textContent = (await Api.logs(S.detail)) || "(geen logregels)"; pre.scrollTop = pre.scrollHeight; pre.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
        catch (err) { pre.textContent = err.message; }
      }
    }
  });
  document.addEventListener("submit", async (e) => {
    if (e.target.id !== "f-verbinding") return;
    e.preventDefault();
    const c = await Opslag.instellingen();
    c.adres = $("i-adres").value.trim() || "https://pi.imetech.nl"; c.token = $("i-token").value.trim();
    await Opslag.set("instellingen", c);
    $("v-status").textContent = "Testen...";
    await laadOverzicht(true);
    $("v-status").textContent = S.fout ? S.fout : "Verbonden met " + c.adres;
    toast(S.fout ? "Verbinding mislukt" : "Opgeslagen en verbonden", !!S.fout);
  });
  document.addEventListener("change", async (e) => {
    if (e.target.id !== "i-donker") return;
    const c = await Opslag.instellingen(); c.donker = e.target.checked; await Opslag.set("instellingen", c); thema(); render();
  });
  /* trek om te vernieuwen (zelfde gevoel als de andere IMeTech-apps) */
  (function () {
    const m = $("scherm"), ptr = $("ptr"); if (!m || !ptr) return;
    let y0 = null, dy = 0;
    m.addEventListener("touchstart", (e) => { y0 = m.scrollTop <= 0 ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
    m.addEventListener("touchmove", (e) => {
      if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0);
      ptr.style.height = Math.min(dy / 2, 56) + "px"; ptr.classList.toggle("klaar", dy > 110);
    }, { passive: true });
    m.addEventListener("touchend", async () => {
      if (y0 == null) return; y0 = null;
      if (dy > 110) {
        ptr.classList.remove("klaar"); ptr.classList.add("bezig"); ptr.style.height = "44px";
        await Promise.all([laadOverzicht(true), S.tab === "onderhoud" ? laadOnderhoud() : null, S.tab === "overzicht" ? laadHist() : null, S.detail ? tekenDetail() : null]);
        ptr.classList.remove("bezig");
      }
      ptr.style.height = "0px"; ptr.classList.remove("klaar");
    });
  })();
  let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (S.tab === "overzicht") tekenHoofd(); if (S.detail) tekenDetail(); }, 200); });

  /* ---------------- start ---------------- */
  async function koppelUitLink() {
    const p = new URLSearchParams(location.search), code = p.get("koppel");
    if (!code) return;
    try { history.replaceState(null, "", location.pathname); } catch (_) {}
    const c = await Opslag.instellingen();
    const adres = p.get("adres") || c.adres || "https://pi.imetech.nl";
    try { c.token = await Api.koppel(adres, code); c.adres = adres; await Opslag.set("instellingen", c); toast("Gekoppeld met de Pi"); }
    catch (e) { toast(e.message, true); }
  }
  async function start() {
    await thema();
    if (window.Terug?.sluiter) { Terug.sluiter("detail", () => { S.detail = null; render(); }); Terug.sluiter("tab", () => kiesTab("overzicht")); }
    if (window.IMeTechApps) IMeTechApps.houdParams = true;
    await koppelUitLink();
    const c = await Opslag.instellingen();
    if (!c.token) { kiesTab("instellingen"); zetStatus("Nog niet gekoppeld"); return; }
    render();
    await Promise.all([laadOverzicht(), laadSpark()]);
    laadHist();
    Api.onderhoud().then((o) => { S.ond = o; laadOverzicht(true); }).catch(() => {});
    setInterval(() => { if (document.visibilityState === "visible") laadOverzicht(true); }, 15000);
    setInterval(() => { if (document.visibilityState === "visible" && S.tab === "overzicht") laadHist(); }, 60000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") laadOverzicht(true); });
  }
  /* Direct (synchroon) luisteren naar de installatie-prompt van Chrome: die komt maar één keer en vaak al
     voordat de rest van de app geladen is. De service worker ook meteen, anders is de app niet installeerbaar. */
  if (window.Installatie) Installatie.init(() => {});
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  start();
})();
