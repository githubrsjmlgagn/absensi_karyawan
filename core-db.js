/* ============================================================
   CORE-DB.JS — Modul Penyimpanan IndexedDB Generik (Lego Brick #7)
   ------------------------------------------------------------
   Dipakai oleh: SEMUA app Chicken Day yang menyimpan data harian
   (per tanggal) atau data dengan key unik lainnya (IP, RO, app baru)

   Menggantikan boilerplate bukaDB()/dbGet()/dbPut()/dbDelete()/
   dbGetAllKeys()/dbGetAllKeys() yang sebelumnya ditulis ulang
   manual di tiap app. Termasuk juga util migrasi dari localStorage
   lama (kalau app sebelumnya masih pakai localStorage).

   CARA PAKAI:
   1. <script src="core-db.js"></script>
   2. Saat app mulai (HARUS di-await sebelum dipakai):
        await CoreDB.buka({
          dbName: 'ChickenDayDB',   // nama unik per app/outlet
          versi: 1,
          store: 'penjualan',       // nama object store
          keyPath: 'tanggal'        // field yang jadi primary key, mis. 'tanggal' / 'id'
        });

   3. Simpan / ambil / hapus 1 record:
        await CoreDB.put({ tanggal:'2026-06-30', trx:[...] });
        const data = await CoreDB.get('2026-06-30');     // -> object atau null
        await CoreDB.hapus('2026-06-30');

   4. Ambil semua data / semua key (mis. untuk backup atau hitung jumlah):
        const semuaKey = await CoreDB.getSemuaKey();      // -> array key
        const semuaData = await CoreDB.getSemua();        // -> array object

   5. (Opsional) Migrasi data lama dari localStorage ke IndexedDB,
      dipanggil sekali saat init kalau app sebelumnya pakai localStorage:
        const jumlah = await CoreDB.migrasiDariLocalStorage({
          prefix: 'cda_penjualan_',          // awalan key localStorage lama
          keyPattern: /^\d{4}-\d{2}-\d{2}$/  // pola sisa key setelah prefix dibuang
        });
        if(jumlah>0) toast(`${jumlah} hari data lama dipindahkan`);

   CATATAN: bisa pakai BEBERAPA store sekaligus dengan init beberapa
   instance lewat CoreDB.buatInstance() kalau 1 app butuh >1 store
   (lihat di bagian bawah file).
   ============================================================ */
(function(){

  function buatInstance(){
    let db = null, cfg = { store: '', keyPath: 'id' };

    function buka(opts){
      cfg = Object.assign({}, cfg, opts || {});
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(cfg.dbName, cfg.versi || 1);
        req.onupgradeneeded = e => {
          const d = e.target.result;
          if(!d.objectStoreNames.contains(cfg.store)){
            d.createObjectStore(cfg.store, { keyPath: cfg.keyPath });
          }
        };
        req.onsuccess = e => { db = e.target.result; resolve(db); };
        req.onerror = e => reject(e.target.error);
      });
    }

    function pastikanSiap(){
      if(!db) throw new Error('CoreDB belum dibuka. Panggil await CoreDB.buka({...}) dulu.');
    }

    function get(key){
      pastikanSiap();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(cfg.store, 'readonly');
        const req = tx.objectStore(cfg.store).get(key);
        req.onsuccess = e => resolve(e.target.result || null);
        req.onerror = e => reject(e.target.error);
      });
    }

    function put(obj){
      pastikanSiap();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(cfg.store, 'readwrite');
        const req = tx.objectStore(cfg.store).put(obj);
        req.onsuccess = () => resolve();
        req.onerror = e => reject(e.target.error);
      });
    }

    function hapus(key){
      pastikanSiap();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(cfg.store, 'readwrite');
        const req = tx.objectStore(cfg.store).delete(key);
        req.onsuccess = () => resolve();
        req.onerror = e => reject(e.target.error);
      });
    }

    function getSemuaKey(){
      pastikanSiap();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(cfg.store, 'readonly');
        const req = tx.objectStore(cfg.store).getAllKeys();
        req.onsuccess = e => resolve(e.target.result || []);
        req.onerror = e => reject(e.target.error);
      });
    }

    function getSemua(){
      pastikanSiap();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(cfg.store, 'readonly');
        const req = tx.objectStore(cfg.store).getAll();
        req.onsuccess = e => resolve(e.target.result || []);
        req.onerror = e => reject(e.target.error);
      });
    }

    // Pindahkan data lama dari localStorage (format: prefix+key -> JSON string)
    // ke IndexedDB. Data yang sudah ada di IndexedDB TIDAK ditimpa.
    // Setelah berhasil dipindah, key localStorage lama dihapus.
    async function migrasiDariLocalStorage(opts){
      opts = opts || {};
      const prefix = opts.prefix || '';
      const keyPattern = opts.keyPattern || null;
      const keys = [];
      for(let i=0; i<localStorage.length; i++){
        const k = localStorage.key(i);
        if(k && k.startsWith(prefix)){
          const sisa = k.replace(prefix, '');
          if(!keyPattern || keyPattern.test(sisa)) keys.push({ key: k, sisa });
        }
      }
      if(!keys.length) return 0;
      let migrated = 0;
      for(const { key: k, sisa } of keys){
        try{
          const raw = localStorage.getItem(k);
          if(!raw) continue;
          const obj = JSON.parse(raw);
          obj[cfg.keyPath] = obj[cfg.keyPath] || sisa;
          const existing = await get(obj[cfg.keyPath]);
          if(!existing){
            await put(obj);
            migrated++;
          }
          localStorage.removeItem(k);
        }catch(e){ console.warn('CoreDB: migrasi gagal untuk', sisa, e); }
      }
      return migrated;
    }

    return { buka, get, put, hapus, getSemuaKey, getSemua, migrasiDariLocalStorage };
  }

  // Instance default (cukup untuk app dengan 1 object store, kasus paling umum)
  const utama = buatInstance();

  window.CoreDB = Object.assign({ buatInstance }, utama);
})();
