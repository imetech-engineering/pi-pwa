/* Verbinding met de pi-monitor op de Pi (zelfde opzet als de assistent: adres + token). */
const Api = {
  async call(pad, opties = {}, tekst = false) {
    const c = await Opslag.instellingen();
    if (!c.adres || !c.token) throw new Error("Koppel eerst de app bij Instellingen");
    let r;
    try {
      r = await fetch(c.adres.replace(/\/$/, "") + "/api" + pad, {
        method: opties.method || "GET",
        headers: { "Authorization": "Bearer " + c.token, "Content-Type": "application/json" },
        body: opties.body ? JSON.stringify(opties.body) : undefined,
      });
    } catch (_) {
      throw new Error(navigator.onLine === false ? "Geen internet" : "Pi even niet bereikbaar, probeer het zo nog eens");
    }
    if (!r.ok) {
      let t = r.statusText;
      try { t = (await r.json()).detail || t; } catch (_) {}
      throw new Error(r.status === 401 ? "Token klopt niet, koppel opnieuw bij Instellingen" : r.status + ": " + t);
    }
    return tekst ? r.text() : r.json();
  },
  async koppel(adres, code) {
    const r = await fetch(adres.replace(/\/$/, "") + "/api/koppel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    if (!r.ok) throw new Error("Koppelcode ongeldig of verlopen");
    return (await r.json()).token;
  },
  overzicht() { return this.call("/overzicht"); },
  historie(range, key) { return this.call("/historie?range=" + range + (key ? "&key=" + encodeURIComponent(key) : "")); },
  logs(key, regels = 300) { return this.call("/logs?lines=" + regels + "&key=" + encodeURIComponent(key), {}, true); },
  acties() { return this.call("/acties"); },
  actie(key, action) { return this.call("/actie", { method: "POST", body: { key, action } }); },
  onderhoud() { return this.call("/onderhoud"); },
  taak(taak) { return this.call("/onderhoud", { method: "POST", body: { taak } }); },
};
