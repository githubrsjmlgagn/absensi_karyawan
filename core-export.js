/* ============================================================
   CORE-EXPORT.JS — Modul Export Excel (Lego Brick #10)
   v2 — tambahan: builder Lapis 2 utk tipe app ABSENSI (lihat
   sheetRekapAbsensiRingkasan/sheetRekapAbsensiDetail di bawah).
   Builder lama (Katalog/Ledger) TIDAK berubah.
   ------------------------------------------------------------
   Dipakai oleh: SEMUA app Chicken Day yang punya fitur "export
   data ke Excel" — yaitu HAMPIR SEMUA app, karena ini inti dari
   digitalisasi (dulu tulis di kertas, sekarang export Excel).

   Butuh library SheetJS (xlsx.full.min.js) sudah dimuat duluan:
     <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
     <script src="core-export.js"></script>

   ------------------------------------------------------------
   STRUKTUR MODUL — 2 LAPIS:

   LAPIS 1 — MESIN INTI (selalu sama di semua app, tidak perlu diubah)
     CoreExport.unduh({...})  -> bikin workbook dari sheet-sheet yang
                                   sudah Anda siapkan, tanya nama file
                                   lewat dialog (pakai CoreConfirm),
                                   lalu unduh .xlsx

   LAPIS 2 — BUILDER SIAP PAKAI (pilih sesuai tipe app Anda)
     Tipe KATALOG (seperti IP — user pilih menu dari daftar, qty,
     jadi nota): CoreExport.sheetRekapKatalog(...) + sheetDetailNotaKatalog(...)

     Tipe LEDGER (seperti RO — user isi form debit/kredit manual):
     CoreExport.sheetLedger(...)

     Kalau app Anda punya struktur laporan yang beda sama sekali,
     boleh lewati Lapis 2 dan susun aoa (array-of-array) sendiri,
     lalu tetap pakai CoreExport.unduh() di Lapis 1.

   ============================================================
   CONTOH PAKAI LENGKAP — APP TIPE KATALOG (seperti IP):

     async function exportExcel(){
       if(!state.trx.length){ CoreToast.show('Belum ada transaksi'); return; }

       const sheet1 = CoreExport.sheetRekapKatalog({
         items: ITEMS,                 // semua menu master (dari CoreCart init)
         trx: state.trx,                // array nota {items:[{id,qty,harga,nama,ch}], ...}
         judulAtas: [['Tanggal', state.tanggal], ['Outlet', getNamaOutlet()||'Chicken Day']],
         strukItem: state.struk.item,   // opsional, untuk baris pembanding struk
         strukOmzet: state.struk.omzet
       });

       const sheet2 = CoreExport.sheetDetailNotaKatalog({ trx: state.trx });

       const defNama = `IP_${state.tanggal}_CD_${getNamaOutlet()}`;
       await CoreExport.unduh({
         sheets: [
           { nama:'Rekap Item', ws: sheet1 },
           { nama:'Detail Nota', ws: sheet2 }
         ],
         namaFileDefault: defNama,
         confirm: CoreConfirm.show,   // dialog tanya nama file, boleh diganti null utk skip dialog
         onSelesai: async ()=>{
           state.exported = true;
           await save();
         }
       });
     }

   ------------------------------------------------------------
   CONTOH PAKAI — APP TIPE LEDGER (seperti RO):

     async function exportExcel(){
       const entries = CoreLedger.getEntries();
       if(!entries.length){ CoreToast.show('Belum ada entry'); return; }
       const ringkasan = CoreLedger.getRingkasan();

       const sheet1 = CoreExport.sheetLedger({
         entries, ringkasan,
         judulAtas: [['Tanggal', tglHariIni], ['Outlet', getNamaOutlet()||'Chicken Day']]
       });

       await CoreExport.unduh({
         sheets: [{ nama:'Rekap Kas', ws: sheet1 }],
         namaFileDefault: `RO_${tglHariIni}_CD_${getNamaOutlet()}`,
         confirm: CoreConfirm.show
       });
     }
   ============================================================
   CONTOH PAKAI — APP TIPE ABSENSI (mis. Absensi Toko, dipadukan
   dengan CoreShift.rekapBulanan() utk hitung ringkasan & detail):

     async function exportExcel(bulanStr){
       const { ringkasan, detail } = await hitungRekapBulanan(bulanStr);

       const sheet1 = CoreExport.sheetRekapAbsensiRingkasan({
         ringkasan,
         judulAtas: [['Bulan', bulanStr], ['Toko', 'Absensi Toko']]
       });
       const sheet2 = CoreExport.sheetRekapAbsensiDetail({
         detail,
         judulAtas: [['Bulan', bulanStr]]
       });

       await CoreExport.unduh({
         sheets: [
           { nama:'Rekap Bulanan', ws: sheet1 },
           { nama:'Detail Harian', ws: sheet2 }
         ],
         namaFileDefault: `Absensi-${bulanStr}`,
         confirm: CoreConfirm.show
       });
     }
   ============================================================ */
(function(){

  function pastikanXLSX(){
    if(typeof XLSX === 'undefined'){
      throw new Error('CoreExport butuh library SheetJS (xlsx.full.min.js). Muat dulu sebelum core-export.js.');
    }
  }

  /* ============================================================
     LAPIS 1 — MESIN INTI
     ============================================================ */

  // Bikin 1 worksheet dari array-of-array (aoa) + opsional lebar kolom.
  // Dipakai langsung kalau Anda mau susun layout sendiri (bukan lewat builder Lapis 2).
  function buatSheet(aoa, colWidths){
    pastikanXLSX();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    if(colWidths) ws['!cols'] = colWidths.map(w => ({ wch: w }));
    return ws;
  }

  // Gabungkan beberapa worksheet jadi 1 file .xlsx dan unduh.
  // opts.sheets: [{ nama:'Rekap Item', ws: <hasil buatSheet/sheetXxx> }, ...]
  // opts.namaFileDefault: nama file tanpa ekstensi, mis. 'IP_2026-06-30_CD_Ampel'
  // opts.confirm: fungsi async(opts)->string|null buat tanya nama file (biasanya CoreConfirm.show).
  //               Kalau null/diabaikan, langsung unduh pakai namaFileDefault tanpa tanya.
  // opts.onSelesai: opsional, dipanggil SETELAH file berhasil diunduh (mis. untuk set exported=true & save())
  // opts.onBatal: opsional, dipanggil kalau user membatalkan dialog nama file
  // return: nama file yang diunduh, atau null kalau dibatalkan
  async function unduh(opts){
    opts = opts || {};
    pastikanXLSX();
    if(!opts.sheets || !opts.sheets.length){
      throw new Error('CoreExport.unduh butuh minimal 1 sheet.');
    }

    let nama = opts.namaFileDefault || 'export';
    if(typeof opts.confirm === 'function'){
      const input = await opts.confirm({
        title: opts.dialogTitle || 'Nama File Excel',
        message: opts.dialogMessage || 'Sesuaikan nama file sebelum diunduh, lalu tekan Unduh Excel.',
        inputDefault: nama,
        inputPlaceholder: 'Nama file',
        confirmText: opts.dialogConfirmText || 'Unduh Excel'
      });
      if(input === null){
        if(opts.onBatal) opts.onBatal();
        return null;
      }
      nama = input.trim() || nama;
    }

    nama = nama.replace(/[\/\\:*?"<>|]/g, '-');
    if(!/\.xlsx$/i.test(nama)) nama += '.xlsx';

    const wb = XLSX.utils.book_new();
    opts.sheets.forEach(s => XLSX.utils.book_append_sheet(wb, s.ws, s.nama || 'Sheet'));
    XLSX.writeFile(wb, nama);

    if(opts.onSelesai) await opts.onSelesai(nama);
    return nama;
  }

  /* ============================================================
     LAPIS 2 — BUILDER: APP TIPE KATALOG (mis. IP)
     items: master menu [{id,nama,harga,ch}, ...]
     trx: array nota tersimpan hari itu [{items:[{id,qty,harga,nama,ch}],...}, ...]
     ============================================================ */

  // Sheet 1: rekap qty terjual per item master, dengan rumus SUM otomatis di Excel,
  // plus opsional baris pembanding angka dari struk fisik.
  function sheetRekapKatalog(opts){
    opts = opts || {};
    const items = opts.items || [];
    const trx = opts.trx || [];
    const judulAtas = opts.judulAtas || [];

    const agg = {};
    trx.forEach(t => t.items.forEach(it => { agg[it.id] = (agg[it.id]||0) + it.qty; }));

    const aoa = [...judulAtas, [], ['No','Item','Channel','Harga','Qty','Subtotal']];
    const HDR = aoa.length; // baris terakhir sebelum data (1-indexed di Excel = HDR+1)
    items.forEach((it, idx) => {
      const q = agg[it.id];
      const r = HDR + 1 + idx;
      const qty = (q && q>0) ? q : '';
      const sub = (q && q>0) ? { f: `D${r}*E${r}` } : '';
      aoa.push([it.id, it.nama, it.ch ? 'Ojol' : 'Reguler', it.harga, qty, sub]);
    });

    const rAwal = HDR+1, rAkhir = HDR+items.length;
    aoa.push([]);
    const rTotal = rAkhir+2;
    aoa.push(['','','','TOTAL', { f:`SUM(E${rAwal}:E${rAkhir})` }, { f:`SUM(F${rAwal}:F${rAkhir})` }]);
    aoa.push([]);
    aoa.push(['Jumlah nota', trx.length]);
    aoa.push(['Jumlah item', { f:`E${rTotal}` }]);
    aoa.push(['Total', { f:`F${rTotal}` }]);
    if(opts.strukItem !== undefined){
      aoa.push(['Jumlah item (struk)', opts.strukItem===''? '' : Number(opts.strukItem)]);
    }
    if(opts.strukOmzet !== undefined){
      aoa.push(['Total (struk)', opts.strukOmzet===''? '' : Number(opts.strukOmzet)]);
    }

    return buatSheet(aoa, opts.colWidths || [5,32,8,10,6,12]);
  }

  // Sheet 2: rincian tiap nota baris per baris, dengan subtotal & total per nota lewat rumus Excel.
  function sheetDetailNotaKatalog(opts){
    opts = opts || {};
    const trx = opts.trx || [];

    const aoa = [['No Nota','Waktu','Item','Qty','Harga','Subtotal','Total Nota']];
    let r = 1;
    trx.forEach((t, i) => {
      const jam = new Date(t.waktu).toLocaleString('id-ID');
      const baris0 = r+1;
      t.items.forEach((it, j) => {
        r++;
        const sub = { f:`E${r}*D${r}` };
        const tot = j===0 ? { f:`SUM(F${baris0}:F${baris0+t.items.length-1})` } : '';
        aoa.push([j===0?i+1:'', j===0?jam:'', it.nama, it.qty, it.harga, sub, tot]);
      });
    });

    return buatSheet(aoa, opts.colWidths || [8,20,32,6,10,12,12]);
  }

  /* ============================================================
     LAPIS 2 — BUILDER: APP TIPE LEDGER (mis. RO)
     entries: dari CoreLedger.getEntries() -> [{waktu,subjek,debit,kredit,petugas,saldo}, ...]
     ringkasan: dari CoreLedger.getRingkasan()
     ============================================================ */

  function sheetLedger(opts){
    opts = opts || {};
    const entries = opts.entries || [];
    const ringkasan = opts.ringkasan || {};
    const judulAtas = opts.judulAtas || [];

    const aoa = [...judulAtas, [], ['Saldo Awal', ringkasan.saldoAwal||0], [],
      ['No','Waktu','Subjek','Debit','Kredit','Saldo','Petugas']];
    entries.forEach((e, idx) => {
      const jam = new Date(e.waktu).toLocaleString('id-ID');
      aoa.push([idx+1, jam, e.subjek, e.debit||'', e.kredit||'', e.saldo, e.petugas||'']);
    });
    aoa.push([]);
    aoa.push(['Total Debit', ringkasan.totalDebit||0]);
    aoa.push(['Total Kredit', ringkasan.totalKredit||0]);
    aoa.push(['Saldo Akhir', ringkasan.saldoAkhir||0]);

    return buatSheet(aoa, opts.colWidths || [5,20,30,12,12,12,16]);
  }

  /* ============================================================
     LAPIS 2 — BUILDER: APP TIPE ABSENSI (mis. Absensi Toko)            [v2]
     ringkasan: dari CoreShift.rekapBulanan(...).ringkasan
       -> [{id, nama, hadir, normal, lembur, telat}, ...] (menit)
     detail: dari CoreShift.rekapBulanan(...).detail
       -> [{tanggal, nama, shift, masuk, pulang, normal, lembur, telat, keterangan}, ...]
     Catatan: jam kerja disimpan sebagai ANGKA MENIT mentah (bukan teks
     "Xj Ym") supaya bisa di-SUM langsung di Excel; satuan ditandai di
     judul kolom.
     ============================================================ */

  function sheetRekapAbsensiRingkasan(opts){
    opts = opts || {};
    const ringkasan = opts.ringkasan || [];
    const judulAtas = opts.judulAtas || [];

    const aoa = [...judulAtas, [], ['Nama','Hadir (hari)','Jam Normal (menit)','Jam Lembur (menit)','Telat (menit)']];
    const HDR = aoa.length;
    ringkasan.forEach(r => aoa.push([r.nama, r.hadir, r.normal, r.lembur, r.telat]));

    const rAwal = HDR+1, rAkhir = HDR+ringkasan.length;
    aoa.push([]);
    aoa.push(['TOTAL',
      { f:`SUM(B${rAwal}:B${rAkhir})` },
      { f:`SUM(C${rAwal}:C${rAkhir})` },
      { f:`SUM(D${rAwal}:D${rAkhir})` },
      { f:`SUM(E${rAwal}:E${rAkhir})` }
    ]);

    return buatSheet(aoa, opts.colWidths || [24,12,16,16,12]);
  }

  function sheetRekapAbsensiDetail(opts){
    opts = opts || {};
    const detail = opts.detail || [];
    const judulAtas = opts.judulAtas || [];

    const aoa = [...judulAtas, [],
      ['Tanggal','Nama','Shift','Jam Masuk','Jam Pulang','Jam Normal (menit)','Jam Lembur (menit)','Telat (menit)','Keterangan']];
    detail.forEach(d => aoa.push([d.tanggal, d.nama, d.shift, d.masuk, d.pulang, d.normal, d.lembur, d.telat, d.keterangan||'']));

    return buatSheet(aoa, opts.colWidths || [12,20,10,10,10,14,14,10,24]);
  }

  window.CoreExport = {
    buatSheet, unduh,
    sheetRekapKatalog, sheetDetailNotaKatalog,
    sheetLedger,
    sheetRekapAbsensiRingkasan, sheetRekapAbsensiDetail
  };
})();
