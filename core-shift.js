/* ============================================================
   CORE-SHIFT.JS — Mesin Jadwal Shift & Jam Kerja untuk App Tipe
   "ABSENSI" (Lego Brick #16)
   ------------------------------------------------------------
   Dipakai oleh: app bertipe seperti Absensi Toko — karyawan absen
   masuk/pulang sesuai shift yang dijadwalkan, lalu jam kerja
   normal/telat/lembur dihitung otomatis per hari & direkap bulanan.

   Sama seperti core-cart.js (tipe Katalog) / core-ledger.js (tipe
   Ledger): ini "otak"-nya saja — murni perhitungan, TIDAK menyimpan
   data ke storage apa pun & TIDAK bikin tampilan. Anda simpan data
   harian (jadwal & absensi) sendiri lewat CoreDB, lalu kirim ke
   modul ini untuk dihitung.

   STRUKTUR DATA YANG DIPAKAI MODUL INI:
   - shifts: [{id, nama, mulai:'HH:MM', selesai:'HH:MM'}, ...]
   - record harian per tanggal (bentuk bebas, field minimal):
       { tanggal:'YYYY-MM-DD',
         jadwal: { karyawanId: shiftId, ... },
         absensi: { karyawanId: {masuk:'HH:MM', pulang:'HH:MM', keterangan}, ... } }

   CARA PAKAI:
   1. <script src="core-shift.js"></script>
   2. Saat app mulai:
        const SHIFTS = [
          { id:'pagi',  nama:'Pagi',  mulai:'07:00', selesai:'16:00' },
          { id:'siang', nama:'Siang', mulai:'10:00', selesai:'19:00' }
        ];
        CoreShift.init({ shifts: SHIFTS });

   3. Hitung 1 entri (dipakai di tampilan status absen & koreksi):
        const calc = CoreShift.hitungEntri(shiftId, '07:10', '16:20');
        // -> {shiftNormal, telat, total, normal, lembur} (semua dalam MENIT)
        // pulang boleh null kalau karyawan belum absen pulang

   4. Kapan tombol "Absen Pulang" boleh aktif (mis. 5 menit sebelum
      jam pulang shift):
        const target = CoreShift.targetAktifPulang(shiftId, 5); // -> Date hari ini

   5. Rentang tanggal 1 bulan (buat ambil semua record harian bulan itu):
        CoreShift.bulanRange('2026-07')  // -> ['2026-07-01', ..., '2026-07-31']

   6. Rekap bulanan — kirim data karyawan + semua record harian bulan
      itu (sudah Anda ambil sendiri dari CoreDB):
        const { ringkasan, detail } = CoreShift.rekapBulanan({
          karyawan: CoreRoster.getList(),        // [{id,nama}, ...]
          harianList: arrayRecordHarianBulanIni  // [{tanggal,jadwal,absensi}, ...]
        });
        // ringkasan: [{id,nama,hadir,normal,lembur,telat}, ...] (menit)
        // detail: [{tanggal,nama,shift,masuk,pulang,normal,lembur,telat,keterangan}, ...]
        // -> siap dipakai langsung ke CoreExport.sheetRekapAbsensiRingkasan/Detail
   ============================================================ */
(function(){

  let SHIFTS = [];

  function init(opts){
    opts = opts || {};
    SHIFTS = opts.shifts || [];
  }

  function getShifts(){ return SHIFTS; }
  function shiftById(id){ return SHIFTS.find(s => s.id === id); }

  function hhmmToMenit(s){
    const [h, m] = s.split(':').map(Number);
    return h * 60 + m;
  }

  // Lembur = murni waktu kerja SETELAH jam tutup shift resmi, terlepas dari
  // telat atau tidak. Jam normal = sisanya, dibatasi maksimal sebesar durasi
  // shift (datang lebih awal tidak menambah jam normal).
  function hitungEntri(shiftId, masuk, pulang){
    const shift = shiftById(shiftId);
    if(!shift) return null;

    const shiftMulai = hhmmToMenit(shift.mulai);
    const shiftSelesai = hhmmToMenit(shift.selesai);
    const shiftNormal = shiftSelesai - shiftMulai;

    const masukMin = masuk ? hhmmToMenit(masuk) : null;
    const pulangMin = pulang ? hhmmToMenit(pulang) : null;

    const telat = masukMin != null ? Math.max(0, masukMin - shiftMulai) : 0;

    let total = null, normal = null, lembur = null;
    if(masukMin != null && pulangMin != null){
      total = Math.max(0, pulangMin - masukMin);
      lembur = Math.max(0, pulangMin - shiftSelesai);
      const rawNormal = total - lembur;
      normal = Math.max(0, Math.min(rawNormal, shiftNormal));
    }

    return { shiftNormal, telat, total, normal, lembur };
  }

  // Jam (Date, hari ini) saat tombol "Absen Pulang" boleh mulai aktif —
  // menitSebelum menit sebelum jam tutup shift resmi.
  function targetAktifPulang(shiftId, menitSebelum){
    const shift = shiftById(shiftId);
    if(!shift) return null;
    const [hh, mm] = shift.selesai.split(':').map(Number);
    const target = new Date();
    target.setHours(hh, mm - (menitSebelum || 0), 0, 0);
    return target;
  }

  function pad2(n){ return n.toString().padStart(2,'0'); }

  // bulanStr format 'YYYY-MM' -> array tanggal 'YYYY-MM-DD' sepanjang bulan itu
  function bulanRange(bulanStr){
    const [y, m] = bulanStr.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const dates = [];
    for(let d=1; d<=lastDay; d++) dates.push(`${y}-${pad2(m)}-${pad2(d)}`);
    return dates;
  }

  // karyawan: [{id,nama}, ...]
  // harianList: [{tanggal, jadwal:{karyawanId:shiftId}, absensi:{karyawanId:{masuk,pulang,keterangan}}}, ...]
  function rekapBulanan(opts){
    opts = opts || {};
    const karyawan = opts.karyawan || [];
    const harianList = opts.harianList || [];

    const detail = [];
    const ringkasanMap = {};
    karyawan.forEach(k => { ringkasanMap[k.id] = { id:k.id, nama:k.nama, hadir:0, normal:0, lembur:0, telat:0 }; });

    harianList.forEach(rec => {
      const jadwalHari = rec.jadwal || {};
      const absensiHari = rec.absensi || {};
      Object.keys(absensiHari).forEach(id => {
        const k = karyawan.find(x => x.id === id);
        if(!k) return;
        const shiftId = jadwalHari[id];
        const e = absensiHari[id];
        if(!shiftId || !e.masuk) return;
        const calc = hitungEntri(shiftId, e.masuk, e.pulang || null);
        const shift = shiftById(shiftId);

        detail.push({
          tanggal: rec.tanggal, nama: k.nama, shift: shift ? shift.nama : '-',
          masuk: e.masuk, pulang: e.pulang || '-',
          normal: calc.normal != null ? calc.normal : 0,
          lembur: calc.lembur != null ? calc.lembur : 0,
          telat: calc.telat, keterangan: e.keterangan || ''
        });

        if(!ringkasanMap[id]) ringkasanMap[id] = { id, nama:k.nama, hadir:0, normal:0, lembur:0, telat:0 };
        ringkasanMap[id].hadir += 1;
        ringkasanMap[id].normal += calc.normal || 0;
        ringkasanMap[id].lembur += calc.lembur || 0;
        ringkasanMap[id].telat += calc.telat || 0;
      });
    });

    return { ringkasan: Object.values(ringkasanMap), detail };
  }

  window.CoreShift = { init, getShifts, shiftById, hitungEntri, targetAktifPulang, bulanRange, rekapBulanan };
})();
