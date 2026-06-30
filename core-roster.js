/* ============================================================
   CORE-ROSTER.JS — Modul Data Master Karyawan/Staff (Lego Brick #15)
   ------------------------------------------------------------
   Dipakai oleh: app yang butuh daftar nama karyawan/staff sederhana
   yang bisa ditambah & dihapus dari panel Pengaturan (mis. app
   Absensi — daftar karyawan yang dipilih saat tap absen; bisa juga
   dipakai app lain sebagai pengganti kolom "petugas" bebas ketik).

   Modul ini TIDAK bikin tampilan apa pun — Anda yang render daftar
   & form tambah/hapus sendiri di HTML, modul ini cuma "otak"-nya:
   simpan & ambil data lewat CoreDB.

   Butuh CoreDB sudah dibuka dengan keyPath 'id'. Roster boleh
   berbagi 1 store yang sama dengan jenis data lain di app Anda
   (mis. record harian bertanggal), asal field 'tipe' dipakai utk
   membedakan jenis record — lihat contoh di bawah.

   CARA PAKAI:
   1. <script src="core-db.js"></script>
      <script src="core-roster.js"></script>
   2. Saat app mulai:
        await CoreDB.buka({ dbName:'AppDB', versi:1, store:'records', keyPath:'id' });
        CoreRoster.init({ db: CoreDB, tipe:'karyawan' }); // tipe boleh diganti, default 'karyawan'
        await CoreRoster.muat();           // wajib dipanggil sebelum getList()

   3. Ambil daftar (sync, dari cache hasil muat()/tambah()/hapus() terakhir):
        CoreRoster.getList()    // -> [{id, tipe:'karyawan', nama}, ...]
        CoreRoster.cariById(id)

   4. Tambah / ubah nama / hapus (otomatis update cache & DB):
        const hasil = await CoreRoster.tambah('Andi');
        if(!hasil.ok){ CoreToast.show(hasil.pesan); return; }

        await CoreRoster.ubahNama(id, 'Andi Saputra');
        await CoreRoster.hapus(id);

   5. (Opsional) Tambah field tambahan selain nama, mis. nomor HP:
        await CoreRoster.tambah('Andi', { hp:'6281234567890' });
   ============================================================ */
(function(){

  let cfg = { db: null, tipe: 'karyawan' };
  let cache = [];

  function init(opts){
    cfg = Object.assign({}, cfg, opts || {});
  }

  function pastikanDB(){
    if(!cfg.db) throw new Error('CoreRoster butuh db. Panggil CoreRoster.init({db: CoreDB, ...}) dulu.');
  }

  async function muat(){
    pastikanDB();
    const semua = await cfg.db.getSemua();
    cache = semua.filter(r => r.tipe === cfg.tipe);
    return cache;
  }

  function getList(){ return cache; }
  function cariById(id){ return cache.find(r => r.id === id) || null; }

  function buatId(){
    return 'k_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  async function tambah(nama, extra){
    pastikanDB();
    nama = (nama || '').trim();
    if(!nama) return { ok:false, pesan:'Nama tidak boleh kosong' };
    const record = Object.assign({ id: buatId(), tipe: cfg.tipe, nama }, extra || {});
    await cfg.db.put(record);
    cache.push(record);
    return { ok:true, record };
  }

  async function ubahNama(id, namaBaru){
    pastikanDB();
    namaBaru = (namaBaru || '').trim();
    if(!namaBaru) return { ok:false, pesan:'Nama tidak boleh kosong' };
    const rec = cariById(id);
    if(!rec) return { ok:false, pesan:'Data tidak ditemukan' };
    rec.nama = namaBaru;
    await cfg.db.put(rec);
    return { ok:true, record: rec };
  }

  async function hapus(id){
    pastikanDB();
    await cfg.db.hapus(id);
    cache = cache.filter(r => r.id !== id);
    return true;
  }

  window.CoreRoster = { init, muat, getList, cariById, tambah, ubahNama, hapus };
})();
