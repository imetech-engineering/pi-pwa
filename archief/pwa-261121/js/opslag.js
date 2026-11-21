/* Instellingen (adres, token, weergave) in IndexedDB. Eigen database "pi-beheer":
   alle IMeTech-apps delen dezelfde origin (github.io), dus niet die van de assistent gebruiken. */
(function () {
  const DB = "pi-beheer", STORE = "kv";
  function open() {
    return new Promise((ok, nee) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => nee(r.error);
    });
  }
  async function get(k) {
    const db = await open();
    return new Promise((ok, nee) => {
      const t = db.transaction(STORE, "readonly").objectStore(STORE).get(k);
      t.onsuccess = () => ok(t.result);
      t.onerror = () => nee(t.error);
    });
  }
  async function set(k, v) {
    const db = await open();
    return new Promise((ok, nee) => {
      const t = db.transaction(STORE, "readwrite").objectStore(STORE).put(v, k);
      t.onsuccess = () => ok();
      t.onerror = () => nee(t.error);
    });
  }
  const api = { get, set, async instellingen() { return (await get("instellingen")) || { adres: "https://pi.imetech.nl", token: "", donker: null }; } };
  if (typeof self !== "undefined") self.Opslag = api;
})();
