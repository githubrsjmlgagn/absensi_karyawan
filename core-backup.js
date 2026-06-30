/* ============================================================
   CORE-BACKUP.JS — Modul Backup, Restore & Reset Data (Lego Brick #12)
   ------------------------------------------------------------
   Dipakai oleh: SEMUA app Chicken Day yang menyimpan data lewat CoreDB
   (yaitu hampir semua app — IP, RO, dan outlet baru)

   Menggantikan boilerplate backupJSON()/restoreJSON()/resetSemuaData()/
   cekReminderBackup() yang sebelumnya ditulis ulang manual di tiap app.
   Modul ini TIDAK bikin tampilan apa pun — Anda yang sediakan tombol &
   panggil fungsi-fungsi ini, biasanya dari panel Pengaturan, dipasangkan
   dengan CoreConfirm untuk dialognya dan CoreDB untuk penyimpanannya.

   Butuh CoreDB sudah dibuka (await CoreDB.buka({...})) sebelum dipakai.

   CARA PAKAI:
   1. <script src="core-backup.js"></script>
   2. Saat app mulai (setelah CoreDB.buka):
        CoreBackup.init({
          db: CoreDB,                  // atau hasil CoreDB.buatInstance() kalau app pakai >1 store
          reminderKey: 'cda_last_backup',
          reminderHari: 7,              // ingatkan kalau sudah lebih dari sekian hari belum backup
          mergeArrayField: 'trx',       // nama field array di tiap record yang perlu digabung saat
                                         // restore (mis. 'trx' utk app katalog, 'entries' utk app ledger).
                                         // Kosongkan/null kalau record tidak punya array semacam ini.
          mergeKeyField: 'waktu',       // field unik di tiap elemen array, dipakai cek duplikat
          namaPrefix: 'backup',         // awalan nama file default, mis. 'backup_CD_Ampel_2026-07-01.json'
          getOutlet: CoreSettings.getOutlet   // fungsi -> string nama outlet, dipakai di nama file
        });

   3. Tombol "Unduh Backup":
        async function backupJSON(){
          await CoreBackup.unduh({
            confirm: CoreConfirm.show,      // null kalau mau langsung unduh tanpa tanya nama file
            onKosong: ()=>CoreToast.show('Tidak ada data untuk dibackup'),
            onSelesai: (nama)=>CoreToast.show(`✓ Backup diunduh: ${nama}`)
          });
        }

   4. Tombol "Pilih File Backup" (biasanya dipasangkan <input type=file>):
        async function restoreJSON(event){
          const file = event.target.files[0]; if(!file) return;
          try{
            const {restored, skipped} = await CoreBackup.restore(file);
            event.target.value='';
            CoreToast.show(`Restore selesai: ${restored} hari dipulihkan, ${skipped} sudah ada`);
            // ...muat ulang tampilan Anda sendiri di sini...
          }catch(err){ CoreToast.show('Gagal baca file: '+err.message); event.target.value=''; }
        }

   5. Tombol "Hapus Semua Data" (2 langkah konfirmasi otomatis):
        async function resetSemuaData(){
          await CoreBackup.resetSemua({
            confirmAwal: CoreConfirm.show,
            confirmAkhir: CoreConfirm.show,
            kataKonfirmasi: 'HAPUS',
            onKosong: ()=>CoreToast.show('Tidak ada data'),
            onSelesai: ()=>{ CoreToast.show('Semua data dihapus'); }
            // lalu muat ulang tampilan Anda sendiri di sini
          });
        }

   6. Dipanggil sekali saat app mulai, untuk ingatkan user kalau lama tidak backup:
        await CoreBackup.cekReminder({ onIngatkan: (pesan)=>CoreToast.show(pesan) });
   ============================================================ */
(function(){

  let cfg = {
    db: null,
    reminderKey: 'core_last_backup',
    reminderHari: 7,
    mergeArrayField: null,
    mergeKeyField: 'waktu',
    namaPrefix: 'backup',
    keyPath: 'tanggal',
    getOutlet: function(){ return ''; }
  };

  function init(opts){
    cfg = Object.assign({}, cfg, opts || {});
  }

  function pastikanDB(){
    if(!cfg.db) throw new Error('CoreBackup butuh db. Panggil CoreBackup.init({db: CoreDB, ...}) dulu.');
  }

  /* ---- unduh backup ---- */
  async function unduh(opts){
    opts = opts || {};
    pastikanDB();
    const allKeys = await cfg.db.getSemuaKey();
    if(!allKeys.length){
      if(opts.onKosong) opts.onKosong();
      return null;
    }

    const outlet = cfg.getOutlet() || '';
    const today = (new Date()).toISOString().slice(0,10);
    const defNama = opts.namaFileDefault || `${cfg.namaPrefix}_CD_${outlet?outlet+'_':''}${today}`;

    let nama = defNama;
    if(typeof opts.confirm === 'function'){
      const input = await opts.confirm({
        title: opts.dialogTitle || 'Unduh Backup?',
        message: opts.dialogMessage || `Backup akan mencakup ${allKeys.length} hari/record data. Sesuaikan nama file jika perlu, lalu tekan Unduh Backup.`,
        inputDefault: defNama,
        inputPlaceholder: 'Nama file',
        confirmText: opts.dialogConfirmText || 'Unduh Backup'
      });
      if(input === null) return null;
      nama = input.trim() || defNama;
    }

    nama = nama.replace(/[\/\\:*?"<>|]/g, '-');
    if(!/\.json$/i.test(nama)) nama += '.json';

    const allData = await cfg.db.getSemua();
    const backup = { versi: 2, dibuat: new Date().toISOString(), outlet: outlet || '', data: {} };
    allData.forEach(rec => { backup.data[rec[cfg.keyPath]] = rec; });

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nama; a.click();
    URL.revokeObjectURL(url);

    localStorage.setItem(cfg.reminderKey, Date.now().toString());
    if(opts.onSelesai) await opts.onSelesai(nama);
    return nama;
  }

  function bacaFile(file){
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try{ resolve(JSON.parse(e.target.result)); }
        catch(err){ reject(new Error('Format file tidak valid')); }
      };
      reader.onerror = () => reject(new Error('Gagal membaca file'));
      reader.readAsText(file);
    });
  }

  /* ---- restore dari file backup, digabung dengan data yang sudah ada ---- */
  // return: { restored, skipped }
  async function restore(file, opts){
    opts = opts || {};
    pastikanDB();
    const backup = await bacaFile(file);
    if(!backup.data || typeof backup.data !== 'object') throw new Error('Format file backup tidak valid');

    const keys = Object.keys(backup.data);
    if(!keys.length) return { restored:0, skipped:0 };

    let restored = 0, skipped = 0;
    for(const k of keys){
      const existing = await cfg.db.get(k);
      const masuk = backup.data[k];

      if(existing && cfg.mergeArrayField && existing[cfg.mergeArrayField] && existing[cfg.mergeArrayField].length){
        // record sudah ada & punya isi (mis. sudah ada transaksi hari itu) -> gabung, jangan timpa
        const arrLama = existing[cfg.mergeArrayField];
        const kunciLama = new Set(arrLama.map(x => x[cfg.mergeKeyField]));
        const arrBaru = (masuk[cfg.mergeArrayField] || []).filter(x => !kunciLama.has(x[cfg.mergeKeyField]));
        if(arrBaru.length){
          existing[cfg.mergeArrayField] = [...arrLama, ...arrBaru];
          await cfg.db.put(existing);
          restored++;
        } else {
          skipped++;
        }
      } else if(!existing){
        const obj = Object.assign({}, masuk);
        obj[cfg.keyPath] = obj[cfg.keyPath] || k;
        await cfg.db.put(obj);
        restored++;
      } else {
        skipped++;
      }
    }
    return { restored, skipped };
  }

  /* ---- hapus semua data, dengan 2 lapis konfirmasi ---- */
  async function resetSemua(opts){
    opts = opts || {};
    pastikanDB();
    const allKeys = await cfg.db.getSemuaKey();
    if(!allKeys.length){
      if(opts.onKosong) opts.onKosong();
      return false;
    }

    if(typeof opts.confirmAwal === 'function'){
      const lanjut = await opts.confirmAwal({
        title: opts.judulAwal || 'Hapus Semua Data?',
        message: opts.pesanAwal || `Anda akan menghapus SELURUH data dari ${allKeys.length} hari/record secara permanen. Pastikan sudah backup terlebih dahulu.`,
        confirmText: 'Lanjutkan', danger: true
      });
      if(!lanjut) return false;
    }

    if(typeof opts.confirmAkhir === 'function'){
      const KATA = opts.kataKonfirmasi || 'HAPUS';
      const hasil = await opts.confirmAkhir({
        title: 'Konfirmasi Terakhir',
        message: opts.pesanAkhir || `Langkah ini tidak bisa dibatalkan. Ketik ${KATA} pada kolom di bawah untuk benar-benar menghapus semua data.`,
        requireText: KATA,
        confirmText: 'Hapus Semua Data Sekarang', danger: true
      });
      if(hasil !== KATA) return false;
    }

    for(const k of allKeys){ await cfg.db.hapus(k); }
    if(opts.onSelesai) await opts.onSelesai();
    return true;
  }

  /* ---- reminder backup berkala ---- */
  async function cekReminder(opts){
    opts = opts || {};
    pastikanDB();
    const allKeys = await cfg.db.getSemuaKey();
    if(!allKeys.length) return;

    const last = localStorage.getItem(cfg.reminderKey);
    if(!last){
      if(opts.onIngatkan) opts.onIngatkan('Belum pernah backup data — disarankan backup lewat ⚙ Pengaturan');
      return;
    }
    const hariBerlalu = Math.floor((Date.now()-Number(last))/86400000);
    if(hariBerlalu >= cfg.reminderHari){
      if(opts.onIngatkan) opts.onIngatkan(`Sudah ${hariBerlalu} hari sejak backup terakhir — disarankan backup lagi lewat ⚙ Pengaturan`);
    }
  }

  window.CoreBackup = { init, unduh, restore, resetSemua, cekReminder };
})();
