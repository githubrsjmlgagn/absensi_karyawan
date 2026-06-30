/* ============================================================
   APP.JS — Absensi Toko
   ------------------------------------------------------------
   File ini cuma berisi logika & tampilan KHUSUS app ini.
   Semua kebutuhan generik (PIN, dialog, toast, storage, format
   tanggal, export Excel, backup, kamera, data karyawan, mesin
   shift) dipasok oleh modul-modul core-*.js — lihat tag <script>
   di index.html.
   ============================================================ */

/* ===================== KONFIGURASI APP ===================== */

const SHIFTS = [
  { id: "pagi",  nama: "Pagi",  mulai: "07:00", selesai: "16:00" },
  { id: "siang", nama: "Middle", mulai: "10:00", selesai: "19:00" },
  { id: "sore",  nama: "Siang",  mulai: "12:30", selesai: "21:30" },
];

const PULANG_AKTIF_SEBELUM_MENIT = 5; // tombol "Absen Pulang" aktif mulai N menit sebelum jam pulang shift

// Key Profil/Pengaturan (lewat CoreSettings) — nama outlet & nomor WA admin pusat
// pakai key bawaan CoreSettings (outletKey/waKey).

/* ===================== UTIL KECIL KHUSUS APP INI ===================== */

function pad(n) { return n.toString().padStart(2, "0"); }
function nowHHMM(d = new Date()) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function sanitizeFileName(name) {
  const cleaned = (name || "").replace(/[\\/:*?"<>|]/g, "").trim();
  return cleaned || "Absensi";
}

function formatSisaWaktu(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}j ${pad(m)}m ${pad(s)}d`;
  return `${pad(m)}:${pad(s)}`;
}

/* ===================== STORAGE (lewat CoreDB, 1 store dipakai bersama) ===================== */
// Store 'records' menampung 2 jenis record, dibedakan field "tipe":
//   - tipe:'karyawan' -> dikelola oleh CoreRoster (id:'k_xxx', nama)
//   - tipe:'harian'   -> record per tanggal {id:tanggal, tanggal, jadwal, absensi}

async function initStorage() {
  await CoreDB.buka({ dbName: "AbsensiTokoDB", versi: 1, store: "records", keyPath: "id" });
  CoreRoster.init({ db: CoreDB, tipe: "karyawan" });
  await CoreRoster.muat();
  CoreBackup.init({
    db: CoreDB,
    keyPath: "id",
    reminderKey: "at_last_backup",
    reminderHari: 7,
    mergeArrayField: null,
    namaPrefix: "Backup_AbsensiToko",
    getOutlet: CoreSettings.getOutlet,
  });
}

async function getHarian(tanggal) {
  const rec = await CoreDB.get(tanggal);
  if (rec && rec.tipe === "harian") return rec;
  return { id: tanggal, tipe: "harian", tanggal, jadwal: {}, absensi: {} };
}
async function saveHarian(rec) { await CoreDB.put(rec); }

/* ===================== PROFIL TOKO (lewat CoreSettings) ===================== */

function terapkanNamaTokoKeHeader() {
  const nama = CoreSettings.getOutlet();
  document.getElementById("brand-nama-toko").textContent = nama ? nama.toUpperCase() : "TOKO";
  document.title = nama ? `Absensi ${nama}` : "Absensi Toko";
}

function renderProfilTab() {
  document.getElementById("profil-nama-toko").value = CoreSettings.getOutlet();
  document.getElementById("profil-wa-admin").value = CoreSettings.getWaNumber();
}

function handleSimpanNamaToko() {
  const hasil = CoreSettings.setOutlet(document.getElementById("profil-nama-toko").value);
  CoreToast.show(hasil.pesan);
  if (hasil.ok) terapkanNamaTokoKeHeader();
}

function handleSimpanWaAdmin() {
  const hasil = CoreSettings.setWaNumber(document.getElementById("profil-wa-admin").value);
  CoreToast.show(hasil.pesan);
  if (hasil.ok) document.getElementById("profil-wa-admin").value = hasil.value;
}

/* ===================== STATE ===================== */

const state = {
  todayRecord: null,   // record harian utk hari ini (tab Absen)
  jadwalRecord: null,  // record harian utk tanggal yg dipilih (tab Jadwal, di panel Pengaturan)
};

let pulangInterval = null;

/* ===================== JAM BERJALAN ===================== */

function tickClock() {
  const now = new Date();
  document.getElementById("clock-time").textContent =
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  document.getElementById("clock-date").textContent = CoreFormat.tglHeader(CoreFormat.todayStr());

  // ganti hari otomatis tanpa perlu reload, kalau app dibiarkan terbuka lewat tengah malam
  const todayNow = CoreFormat.todayStr();
  if (state.todayRecord && state.todayRecord.tanggal !== todayNow) {
    getHarian(todayNow).then((rec) => {
      state.todayRecord = rec;
      renderAbsenSelect();
      renderAbsenStatus();
      renderLogHariIni();
    });
  }
}

/* ===================== TAB: ABSEN (halaman utama) ===================== */

function renderAbsenSelect() {
  const sel = document.getElementById("pilih-karyawan");
  const karyawan = CoreRoster.getList();
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">— Pilih nama —</option>' +
    karyawan.map((k) => `<option value="${k.id}">${escapeHtml(k.nama)}</option>`).join("");
  if (karyawan.some((k) => k.id === currentVal)) sel.value = currentVal;
}

function renderAbsenStatus() {
  const sel = document.getElementById("pilih-karyawan");
  const id = sel.value;
  const shiftInfo = document.getElementById("shift-info");
  const statusInfo = document.getElementById("status-info");
  const btn = document.getElementById("btn-absen");

  if (!id) {
    shiftInfo.hidden = true;
    statusInfo.hidden = true;
    btn.disabled = true;
    btn.className = "btn-action";
    btn.textContent = "Pilih nama dulu";
    removeTombolPulang();
    return;
  }

  const rec = state.todayRecord;
  const shiftId = rec.jadwal[id];

  if (!shiftId) {
    shiftInfo.hidden = false;
    shiftInfo.innerHTML = `Jadwal shift belum diatur untuk hari ini. <b>Hubungi admin.</b>`;
    statusInfo.hidden = true;
    btn.disabled = true;
    btn.className = "btn-action";
    btn.textContent = "Belum bisa absen";
    removeTombolPulang();
    return;
  }

  const shift = CoreShift.shiftById(shiftId);
  shiftInfo.hidden = false;
  shiftInfo.innerHTML = `Shift hari ini: <b>${escapeHtml(shift.nama)}</b> · ${shift.mulai}–${shift.selesai}`;

  const entry = rec.absensi[id] || {};

  if (!entry.masuk) {
    statusInfo.hidden = true;
    btn.disabled = false;
    btn.className = "btn-action mode-masuk";
    btn.innerHTML = "Absen Masuk";
    btn.dataset.action = "masuk";
    removeTombolPulang();
    return;
  }

  if (entry.masuk && !entry.pulang) {
    const calc = CoreShift.hitungEntri(shiftId, entry.masuk, null);
    statusInfo.hidden = true;
    btn.disabled = true;
    btn.className = "btn-action btn-info-masuk";
    btn.innerHTML =
      `<span class="btn-info-jam">✓ Masuk ${entry.masuk}</span>` +
      (calc.telat > 0
        ? `<span class="btn-info-status telat-label">Telat ${CoreFormat.durasi(calc.telat)}</span>`
        : `<span class="btn-info-status tepat-label">Tepat Waktu</span>`);

    renderTombolPulang(id, shiftId);
    return;
  }

  // sudah masuk & pulang
  const calc = CoreShift.hitungEntri(shiftId, entry.masuk, entry.pulang);
  statusInfo.hidden = false;
  statusInfo.innerHTML =
    `Masuk: ${entry.masuk}${calc.telat > 0 ? ` <span class="telat">(telat ${CoreFormat.durasi(calc.telat)})</span>` : ""}<br>` +
    `Pulang: ${entry.pulang}<br>` +
    `Jam normal: ${CoreFormat.durasi(calc.normal)}` +
    (calc.lembur > 0 ? ` · <span class="lembur">Lembur ${CoreFormat.durasi(calc.lembur)}</span>` : "");
  btn.disabled = true;
  btn.className = "btn-action";
  btn.innerHTML = "Selesai untuk hari ini ✓";
  removeTombolPulang();
}

function removeTombolPulang() {
  const old = document.getElementById("btn-pulang-wrap");
  if (old) old.remove();
  if (pulangInterval) { clearInterval(pulangInterval); pulangInterval = null; }
}

function renderTombolPulang(karyawanId, shiftId) {
  removeTombolPulang();

  const card = document.getElementById("btn-absen").closest(".card");
  const wrap = document.createElement("div");
  wrap.id = "btn-pulang-wrap";
  wrap.className = "card pulang-card";

  const target = CoreShift.targetAktifPulang(shiftId, PULANG_AKTIF_SEBELUM_MENIT);
  const now = new Date();
  const sudahAktif = now >= target;
  const jamTarget = `${pad(target.getHours())}:${pad(target.getMinutes())}`;

  wrap.innerHTML = `
    <div class="pulang-label">Absen Pulang</div>
    <div class="pulang-progress-wrap">
      <div class="pulang-progress-bar" id="pulang-progress-bar"></div>
    </div>
    <button id="btn-pulang-action" class="btn-action mode-pulang" ${sudahAktif ? "" : "disabled"}>
      ${
        sudahAktif
          ? "Absen Pulang"
          : `Aktif jam ${jamTarget} <span id="pulang-countdown">(${formatSisaWaktu(target - now)})</span>`
      }
    </button>`;
  card.after(wrap);

  const btnPulang = document.getElementById("btn-pulang-action");
  const progressBar = document.getElementById("pulang-progress-bar");

  if (sudahAktif) {
    progressBar.style.width = "100%";
  } else {
    const countdownEl = document.getElementById("pulang-countdown");
    const totalMs = target.getTime() - now.getTime();
    const startTime = Date.now();

    pulangInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / totalMs) * 100);
      progressBar.style.width = pct + "%";

      const sisaMs = target.getTime() - Date.now();
      if (sisaMs <= 0) {
        clearInterval(pulangInterval); pulangInterval = null;
        btnPulang.disabled = false;
        btnPulang.textContent = "Absen Pulang";
        progressBar.style.width = "100%";
      } else {
        countdownEl.textContent = `(${formatSisaWaktu(sisaMs)})`;
      }
    }, 1000);
  }

  btnPulang.addEventListener("click", async () => {
    if (pulangInterval) { clearInterval(pulangInterval); pulangInterval = null; }
    const rec = state.todayRecord;
    if (!rec.absensi[karyawanId]) rec.absensi[karyawanId] = {};
    const jam = nowHHMM();
    rec.absensi[karyawanId].pulang = jam;
    await saveHarian(rec);
    renderAbsenStatus();
    renderLogHariIni();

    const karyawan = CoreRoster.cariById(karyawanId);
    const shift = CoreShift.shiftById(shiftId);
    const namaKaryawan = karyawan ? karyawan.nama : "Karyawan";
    const namaToko = CoreSettings.getOutlet();
    CoreCamera.tangkap({
      judul: "Foto Absen Pulang",
      namaFile: `Absen-${sanitizeFileName(namaKaryawan)}-${jam.replace(":", "")}.jpg`,
      caption: `${namaToko ? namaToko + " · " : ""}${namaKaryawan} · Absen Pulang · ${jam} · Shift ${shift ? shift.nama : "-"}`,
    });
  });
}

async function handleAbsenClick() {
  const sel = document.getElementById("pilih-karyawan");
  const id = sel.value;
  const btn = document.getElementById("btn-absen");
  const action = btn.dataset.action;
  if (!id || !action) return;

  const rec = state.todayRecord;
  if (!rec.absensi[id]) rec.absensi[id] = {};
  const jam = nowHHMM();
  rec.absensi[id][action] = jam;
  await saveHarian(rec);

  renderAbsenStatus();
  renderLogHariIni();

  // Absen sudah tersimpan di atas. Foto bersifat opsional/pelengkap.
  const karyawan = CoreRoster.cariById(id);
  const shift = CoreShift.shiftById(rec.jadwal[id]);
  const namaKaryawan = karyawan ? karyawan.nama : "Karyawan";
  const namaToko = CoreSettings.getOutlet();
  CoreCamera.tangkap({
    judul: "Foto Absen Masuk",
    namaFile: `Absen-${sanitizeFileName(namaKaryawan)}-${jam.replace(":", "")}.jpg`,
    caption: `${namaToko ? namaToko + " · " : ""}${namaKaryawan} · Absen Masuk · ${jam} · Shift ${shift ? shift.nama : "-"}`,
  });
}

function renderLogHariIni() {
  const wrap = document.getElementById("log-hari-ini");
  const rec = state.todayRecord;
  const karyawanList = CoreRoster.getList();

  const rows = Object.keys(rec.absensi)
    .map((id) => {
      const k = karyawanList.find((x) => x.id === id);
      if (!k) return null;
      const e = rec.absensi[id];
      const shift = CoreShift.shiftById(rec.jadwal[id]);
      return { nama: k.nama, masuk: e.masuk, pulang: e.pulang, shiftNama: shift ? shift.nama : "-" };
    })
    .filter(Boolean)
    .sort((a, b) => (a.masuk || "").localeCompare(b.masuk || ""));

  if (rows.length === 0) {
    wrap.innerHTML = '<div class="log-empty">Belum ada yang absen hari ini.</div>';
    return;
  }

  wrap.innerHTML = rows
    .map(
      (r) =>
        `<div class="log-row"><span class="nm">${escapeHtml(r.nama)} · ${escapeHtml(r.shiftNama)}</span>` +
        `<span class="tm">${r.masuk || "--:--"} → ${r.pulang || "--:--"}</span></div>`
    )
    .join("");
}

/* ===================== PANEL PENGATURAN — buka/tutup & sub-navigasi ===================== */

function bukaPengaturan() {
  document.getElementById("settings-panel").hidden = false;
  activateSubTab("profil");
}

function tutupPengaturan() {
  document.getElementById("settings-panel").hidden = true;
}

function activateSubTab(tab) {
  document.querySelectorAll("#settings-panel .tab").forEach((el) => el.classList.remove("active"));
  document.getElementById("sub-" + tab).classList.add("active");
  document.querySelectorAll(".subnav-btn").forEach((b) => b.classList.toggle("active", b.dataset.subtab === tab));

  if (tab === "profil") renderProfilTab();
  if (tab === "jadwal") renderJadwalTab();
  if (tab === "karyawan") renderKaryawanTab();
  if (tab === "rekap") renderRekapTampilan();
}

/* ===================== SUBTAB: JADWAL ===================== */

async function renderJadwalTab() {
  const tanggalInput = document.getElementById("jadwal-tanggal");
  if (!tanggalInput.value) tanggalInput.value = CoreFormat.todayStr();
  const tanggal = tanggalInput.value;

  const karyawan = CoreRoster.getList();
  const wrap = document.getElementById("jadwal-list");

  if (karyawan.length === 0) {
    wrap.innerHTML = '<div class="log-empty">Belum ada karyawan. Tambahkan dulu di tab Karyawan.</div>';
    document.getElementById("koreksi-list").innerHTML = '<div class="log-empty">Tidak ada karyawan berjadwal di tanggal ini.</div>';
    return;
  }

  state.jadwalRecord = await getHarian(tanggal);
  const rec = state.jadwalRecord;

  wrap.innerHTML = karyawan
    .map((k) => {
      const val = rec.jadwal[k.id] || "";
      const options =
        `<option value="">Belum diatur</option>` +
        CoreShift.getShifts().map((s) => `<option value="${s.id}" ${val === s.id ? "selected" : ""}>${escapeHtml(s.nama)} (${s.mulai}-${s.selesai})</option>`).join("");
      return `<div class="jadwal-row"><span class="nm">${escapeHtml(k.nama)}</span>
        <select data-karyawan-id="${k.id}" class="jadwal-select">${options}</select></div>`;
    })
    .join("");

  wrap.querySelectorAll(".jadwal-select").forEach((selEl) => {
    selEl.addEventListener("change", async () => {
      const rec2 = state.jadwalRecord;
      if (selEl.value) rec2.jadwal[selEl.dataset.karyawanId] = selEl.value;
      else delete rec2.jadwal[selEl.dataset.karyawanId];
      await saveHarian(rec2);
      syncKeAbsenJikaTanggalSama(rec2);
      renderKoreksiAbsensi();
    });
  });

  renderKoreksiAbsensi();
}

function syncKeAbsenJikaTanggalSama(rec) {
  if (state.todayRecord && rec.tanggal === state.todayRecord.tanggal) {
    state.todayRecord = rec;
    renderAbsenStatus();
    renderLogHariIni();
  }
}

function renderKoreksiAbsensi() {
  const rec = state.jadwalRecord;
  const karyawan = CoreRoster.getList();
  const wrap = document.getElementById("koreksi-list");

  const idList = Array.from(new Set([...Object.keys(rec.jadwal), ...Object.keys(rec.absensi)]));
  const rows = idList.map((id) => karyawan.find((k) => k.id === id)).filter(Boolean);

  if (rows.length === 0) {
    wrap.innerHTML = '<div class="log-empty">Tidak ada karyawan berjadwal di tanggal ini.</div>';
    return;
  }

  wrap.innerHTML = rows
    .map((k) => {
      const shift = CoreShift.shiftById(rec.jadwal[k.id]);
      const entry = rec.absensi[k.id] || {};
      return `<div class="koreksi-row">
        <span class="nm">${escapeHtml(k.nama)}<small>${shift ? escapeHtml(shift.nama) + " · " + shift.mulai + "-" + shift.selesai : "tanpa shift"}</small></span>
        <input type="time" class="koreksi-masuk" data-karyawan-id="${k.id}" value="${entry.masuk || ""}" aria-label="Jam masuk" />
        <input type="time" class="koreksi-pulang" data-karyawan-id="${k.id}" value="${entry.pulang || ""}" aria-label="Jam pulang" />
        <input type="text" class="koreksi-keterangan" data-karyawan-id="${k.id}" value="${escapeHtml(entry.keterangan || "")}" placeholder="Keterangan (opsional)" aria-label="Keterangan" />
      </div>`;
    })
    .join("");

  async function simpanKoreksi(inputEl, field) {
    const id = inputEl.dataset.karyawanId;
    const rec2 = state.jadwalRecord;
    if (!rec2.absensi[id]) rec2.absensi[id] = {};
    if (inputEl.value) rec2.absensi[id][field] = inputEl.value;
    else delete rec2.absensi[id][field];
    await saveHarian(rec2);
    inputEl.classList.add("saved-flash");
    setTimeout(() => inputEl.classList.remove("saved-flash"), 600);
    syncKeAbsenJikaTanggalSama(rec2);
  }

  wrap.querySelectorAll(".koreksi-masuk").forEach((el) => el.addEventListener("change", () => simpanKoreksi(el, "masuk")));
  wrap.querySelectorAll(".koreksi-pulang").forEach((el) => el.addEventListener("change", () => simpanKoreksi(el, "pulang")));
  wrap.querySelectorAll(".koreksi-keterangan").forEach((el) => el.addEventListener("change", () => simpanKoreksi(el, "keterangan")));
}

async function handleCopyKemarin() {
  const tanggalInput = document.getElementById("jadwal-tanggal");
  const tanggal = tanggalInput.value || CoreFormat.todayStr();
  const kemarin = CoreFormat.tambahHari(tanggal, -1);

  const recKemarin = await getHarian(kemarin);
  if (!recKemarin.jadwal || Object.keys(recKemarin.jadwal).length === 0) {
    CoreToast.show("Tidak ada jadwal di tanggal sebelumnya untuk disalin.");
    return;
  }

  const recTujuan = state.jadwalRecord;
  if (recTujuan.jadwal && Object.keys(recTujuan.jadwal).length > 0) {
    const lanjut = await CoreConfirm.show({
      title: "Timpa jadwal tanggal ini?",
      message: "Tanggal ini sudah punya jadwal. Menyalin jadwal kemarin akan menimpanya.",
      confirmText: "Ya, Timpa",
      danger: true,
    });
    if (!lanjut) return;
  }

  recTujuan.jadwal = { ...recKemarin.jadwal };
  await saveHarian(recTujuan);
  syncKeAbsenJikaTanggalSama(recTujuan);
  renderJadwalTab();
  CoreToast.show("✓ Jadwal kemarin disalin");
}

/* ===================== SUBTAB: KARYAWAN ===================== */

function renderKaryawanTab() {
  const wrap = document.getElementById("daftar-karyawan");
  const karyawan = CoreRoster.getList();
  if (karyawan.length === 0) {
    wrap.innerHTML = '<div class="log-empty">Belum ada karyawan.</div>';
    return;
  }
  wrap.innerHTML = karyawan
    .map(
      (k) =>
        `<div class="employee-row"><span>${escapeHtml(k.nama)}</span>` +
        `<button class="btn-del" data-id="${k.id}">Hapus</button></div>`
    )
    .join("");

  wrap.querySelectorAll(".btn-del").forEach((b) => {
    b.addEventListener("click", async () => {
      const ok = await CoreConfirm.show({
        title: "Hapus karyawan ini?",
        message: "Data absensi lama tetap tersimpan, hanya nama dihapus dari daftar pilihan.",
        confirmText: "Ya, Hapus",
        danger: true,
      });
      if (!ok) return;
      await CoreRoster.hapus(b.dataset.id);
      renderKaryawanTab();
      renderAbsenSelect();
      renderJadwalTab();
    });
  });
}

async function handleTambahKaryawan() {
  const input = document.getElementById("input-nama-karyawan");
  const hasil = await CoreRoster.tambah(input.value);
  if (!hasil.ok) { CoreToast.show(hasil.pesan); return; }
  input.value = "";
  renderKaryawanTab();
  renderAbsenSelect();
  renderJadwalTab();
}

/* ===================== SUBTAB: REKAP ===================== */

async function hitungRekapBulanan(bulanStr) {
  const dates = CoreShift.bulanRange(bulanStr);
  const karyawan = CoreRoster.getList();
  const semua = await CoreDB.getSemua();
  const harianList = semua.filter((r) => r.tipe === "harian" && dates.includes(r.tanggal));
  return CoreShift.rekapBulanan({ karyawan, harianList });
}

async function renderRekapTampilan() {
  const bulanInput = document.getElementById("rekap-bulan");
  if (!bulanInput.value) {
    const now = new Date();
    bulanInput.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  }
  const { ringkasan } = await hitungRekapBulanan(bulanInput.value);
  const wrap = document.getElementById("rekap-ringkasan");

  if (ringkasan.length === 0) {
    wrap.innerHTML = '<div class="log-empty">Belum ada data absensi di bulan ini.</div>';
    return;
  }

  wrap.innerHTML = `
    <table class="rekap">
      <thead><tr>
        <th>Nama</th><th>Hadir</th><th>Jam Normal</th><th>Lembur</th><th>Telat</th>
      </tr></thead>
      <tbody>
        ${ringkasan
          .map(
            (r) =>
              `<tr><td>${escapeHtml(r.nama)}</td><td>${r.hadir} hari</td><td>${CoreFormat.durasi(r.normal)}</td><td>${CoreFormat.durasi(r.lembur)}</td><td>${CoreFormat.durasi(r.telat)}</td></tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

async function handleExportExcel() {
  const bulanInput = document.getElementById("rekap-bulan");
  const bulanStr = bulanInput.value;
  if (!bulanStr) { CoreToast.show("Pilih bulan dulu."); return; }
  if (typeof XLSX === "undefined") {
    CoreToast.show("Fitur export butuh koneksi internet sekali untuk memuat library Excel. Coba lagi saat online.");
    return;
  }

  const { ringkasan, detail } = await hitungRekapBulanan(bulanStr);
  if (ringkasan.length === 0 && detail.length === 0) {
    CoreToast.show("Belum ada data untuk diexport.");
    return;
  }

  const namaToko = CoreSettings.getOutlet();

  const sheet1 = CoreExport.sheetRekapAbsensiRingkasan({
    ringkasan,
    judulAtas: [["Bulan", bulanStr], ["Toko", namaToko || "Absensi Toko"]],
  });
  const sheet2 = CoreExport.sheetRekapAbsensiDetail({
    detail: detail.slice().sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.nama.localeCompare(b.nama)),
    judulAtas: [["Bulan", bulanStr]],
  });

  await CoreExport.unduh({
    sheets: [
      { nama: "Rekap Bulanan", ws: sheet1 },
      { nama: "Detail Harian", ws: sheet2 },
    ],
    namaFileDefault: sanitizeFileName(`Absensi-${bulanStr}${namaToko ? "_" + namaToko : ""}`),
    confirm: CoreConfirm.show,
    onSelesai: (nama) => CoreToast.show(`✓ Excel diunduh: ${nama}`),
  });
}

/* ===================== SUBTAB: REKAP — Share WA ke admin pusat ===================== */

function buatTeksRekapWA(bulanStr, ringkasan, namaToko) {
  const judul = namaToko ? `*Rekap Absensi — ${namaToko}*` : "*Rekap Absensi*";
  const baris = ringkasan
    .map((r) => `• ${r.nama}: ${r.hadir} hari hadir, normal ${CoreFormat.durasi(r.normal)}, lembur ${CoreFormat.durasi(r.lembur)}, telat ${CoreFormat.durasi(r.telat)}`)
    .join("\n");
  return `${judul}\nBulan: ${CoreFormat.bulanPanjang(bulanStr)}\n\n${}`;
}

async function handleShareWaRekap() {
  const bulanInput = document.getElementById("rekap-bulan");
  const bulanStr = bulanInput.value;
  if (!bulanStr) { CoreToast.show("Pilih bulan dulu."); return; }

  const nomorAdmin = CoreSettings.getWaNumber();
  if (!nomorAdmin) { CoreToast.show("Atur dulu Nomor WA Admin Pusat di tab Profil."); return; }

  const { ringkasan } = await hitungRekapBulanan(bulanStr);
  if (ringkasan.length === 0) { CoreToast.show("Belum ada data untuk dibagikan."); return; }

  const teks = buatTeksRekapWA(bulanStr, ringkasan, CoreSettings.getOutlet());
  CoreWA.send(nomorAdmin, teks);
}

/* ===================== SUBTAB: DATA (PIN, backup, restore, reset) ===================== */

async function muatUlangSemuaTampilan() {
  await CoreRoster.muat();
  renderKaryawanTab();
  renderAbsenSelect();
  state.todayRecord = await getHarian(CoreFormat.todayStr());
  renderAbsenStatus();
  renderLogHariIni();
  renderJadwalTab();
}

async function handleBackup() {
  await CoreBackup.unduh({
    confirm: CoreConfirm.show,
    onKosong: () => CoreToast.show("Tidak ada data untuk dibackup"),
    onSelesai: (nama) => CoreToast.show(`✓ Backup diunduh: ${nama}`),
  });
}

async function handleRestore(file) {
  try {
    const { restored, skipped } = await CoreBackup.restore(file);
    CoreToast.show(`Restore selesai: ${restored} data dipulihkan, ${skipped} sudah ada`);
    await muatUlangSemuaTampilan();
  } catch (err) {
    CoreToast.show("Gagal baca file: " + err.message);
  }
}

async function handleResetSemua() {
  await CoreBackup.resetSemua({
    confirmAwal: CoreConfirm.show,
    confirmAkhir: CoreConfirm.show,
    kataKonfirmasi: "HAPUS",
    onKosong: () => CoreToast.show("Tidak ada data"),
    onSelesai: async () => {
      CoreToast.show("Semua data dihapus");
      await muatUlangSemuaTampilan();
    },
  });
}

/* ===================== INIT ===================== */

async function init() {
  CoreSettings.init({ outletKey: "at_outlet", waKey: "at_wa_admin" });
  terapkanNamaTokoKeHeader();

  await initStorage();

  CoreShift.init({ shifts: SHIFTS });

  CorePin.init({
    storageKey: "at_admin_pin",
    judulBuat: "Buat PIN Admin",
    subBuat: "Buat PIN 4 digit untuk mengunci panel Pengaturan",
    judulBuka: "Pengaturan",
    subBuka: "Masukkan PIN untuk membuka Pengaturan",
    onUnlocked: () => bukaPengaturan(),
  });

  tickClock();
  setInterval(tickClock, 1000);

  state.todayRecord = await getHarian(CoreFormat.todayStr());

  renderAbsenSelect();
  renderAbsenStatus();
  renderLogHariIni();

  document.getElementById("pilih-karyawan").addEventListener("change", renderAbsenStatus);
  document.getElementById("btn-absen").addEventListener("click", handleAbsenClick);

  // ---- Buka/tutup panel Pengaturan ----
  document.getElementById("btn-buka-pengaturan").addEventListener("click", () => CorePin.open("pengaturan"));
  document.getElementById("btn-tutup-pengaturan").addEventListener("click", tutupPengaturan);
  document.querySelectorAll(".subnav-btn").forEach((b) => {
    b.addEventListener("click", () => activateSubTab(b.dataset.subtab));
  });

  // ---- Subtab Profil ----
  document.getElementById("btn-simpan-toko").addEventListener("click", handleSimpanNamaToko);
  document.getElementById("btn-simpan-wa-admin").addEventListener("click", handleSimpanWaAdmin);

  // ---- Subtab Karyawan ----
  document.getElementById("btn-tambah-karyawan").addEventListener("click", handleTambahKaryawan);
  document.getElementById("input-nama-karyawan").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleTambahKaryawan();
  });

  // ---- Subtab Jadwal ----
  document.getElementById("jadwal-tanggal").addEventListener("change", renderJadwalTab);
  document.getElementById("btn-copy-kemarin").addEventListener("click", handleCopyKemarin);

  // ---- Subtab Rekap ----
  document.getElementById("btn-tampilkan-rekap").addEventListener("click", renderRekapTampilan);
  document.getElementById("btn-export-excel").addEventListener("click", handleExportExcel);
  document.getElementById("btn-share-wa-rekap").addEventListener("click", handleShareWaRekap);

  // ---- Subtab Data ----
  document.getElementById("btn-ganti-pin").addEventListener("click", () => CorePin.change());
  document.getElementById("btn-backup").addEventListener("click", handleBackup);
  document.getElementById("btn-pilih-restore").addEventListener("click", () => {
    document.getElementById("input-restore").click();
  });
  document.getElementById("input-restore").addEventListener("change", (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) handleRestore(file);
  });
  document.getElementById("btn-reset").addEventListener("click", handleResetSemua);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  // Ingatkan backup berkala (lihat dokumentasi core-backup.js poin 6)
  CoreBackup.cekReminder({ onIngatkan: (pesan) => CoreToast.show(pesan, 4000) });
}

document.addEventListener("DOMContentLoaded", init);
