/* ============================================================
   CORE-CONFIRM.JS — Modul Dialog Konfirmasi & Input (Lego Brick #4)
   ------------------------------------------------------------
   Dipakai oleh: SEMUA app Chicken Day (IP, RO, dan outlet baru)

   Pengganti alert()/confirm()/prompt() bawaan browser yang
   tampilannya jelek dan tidak konsisten di tiap HP. Dipakai untuk:
   - konfirmasi hapus data
   - minta nama file sebelum unduh Excel
   - konfirmasi apa pun yang butuh jawaban "Ya/Batal"

   Modul ini TIDAK perlu HTML tambahan — tampilannya dibuat sendiri.

   CARA PAKAI (selalu pakai "await", karena ini async):

   1) Konfirmasi sederhana (Ya/Batal):
        const ok = await CoreConfirm.show({
          title:'Hapus data ini?',
          message:'Tindakan ini tidak bisa dibatalkan.',
          confirmText:'Ya, Hapus', danger:true
        });
        if(ok) { ...lanjut hapus... }

   2) Minta input teks (misal nama file):
        const nama = await CoreConfirm.show({
          title:'Nama File Excel',
          message:'Sesuaikan nama file sebelum diunduh.',
          inputDefault:'IP_2026-06-30_CD_Ampel',
          confirmText:'Unduh Excel'
        });
        if(nama===null){ return; } // user tekan Batal
        // nama berisi teks yang diketik user

   3) Konfirmasi berbahaya yang wajib ketik ulang teks tertentu:
        const ok = await CoreConfirm.show({
          title:'Hapus SEMUA Data?',
          requireText:'HAPUS',
          requireHint:'Ketik HAPUS untuk konfirmasi',
          danger:true
        });
   ============================================================ */
(function(){

  let el = {}, resolveFn = null, hasInput = false, requireText = '';

  function injectDOM(){
    if(document.getElementById('coreconfirm-overlay')) return;

    const style = document.createElement('style');
    style.textContent = `
      #coreconfirm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9998;
        display:none;align-items:flex-end;justify-content:center;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}
      #coreconfirm-overlay.show{display:flex;}
      .coreconfirm-box{background:#fff;border-radius:20px 20px 0 0;padding:20px;width:100%;
        max-width:380px;box-shadow:0 -4px 24px rgba(0,0,0,.12);}
      @media(min-width:480px){
        #coreconfirm-overlay{align-items:center;}
        .coreconfirm-box{border-radius:20px;}
      }
      .coreconfirm-box h3{margin:0 0 8px;font-size:16px;color:#7A1E1E;}
      .coreconfirm-box .cc-msg{font-size:13px;color:#4a4a4a;line-height:1.6;margin:0 0 12px;white-space:pre-line;}
      .coreconfirm-box input{width:100%;padding:12px 14px;border:1.5px solid #e8e4e0;
        border-radius:10px;outline:none;font-size:15px;box-sizing:border-box;margin-bottom:6px;}
      .coreconfirm-box input:focus{border-color:#7A1E1E;}
      .cc-hint{font-size:12px;color:#b83228;font-weight:600;margin-bottom:8px;}
      .cc-footer{display:flex;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid #e8e4e0;}
      .cc-footer button{flex:1;padding:13px;border:none;border-radius:10px;font-weight:700;
        font-size:15px;cursor:pointer;}
      .cc-btn-cancel{background:#fff;border:1.5px solid #e8e4e0;color:#1e1e1e;}
      .cc-btn-ok{background:#7A1E1E;color:#fff;}
      .cc-btn-ok.danger{background:#fff;border:1.5px solid #b83228;color:#b83228;}
      .cc-btn-ok:disabled{opacity:.5;cursor:not-allowed;}
      .hidden{display:none!important;}
    `;
    document.head.appendChild(style);

    const wrap = document.createElement('div');
    wrap.id = 'coreconfirm-overlay';
    wrap.innerHTML = `
      <div class="coreconfirm-box">
        <h3 id="cc-title">Konfirmasi</h3>
        <p class="cc-msg" id="cc-message"></p>
        <div id="cc-input-wrap" class="hidden">
          <input type="text" id="cc-input" placeholder="">
        </div>
        <div class="cc-hint hidden" id="cc-hint"></div>
        <div class="cc-footer">
          <button class="cc-btn-cancel" id="cc-btn-cancel">Batal</button>
          <button class="cc-btn-ok" id="cc-btn-ok">Ya</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    el = {
      overlay: wrap,
      title: document.getElementById('cc-title'),
      message: document.getElementById('cc-message'),
      inputWrap: document.getElementById('cc-input-wrap'),
      input: document.getElementById('cc-input'),
      hint: document.getElementById('cc-hint'),
      btnOk: document.getElementById('cc-btn-ok'),
      btnCancel: document.getElementById('cc-btn-cancel')
    };

    el.btnCancel.addEventListener('click', ()=>{
      close();
      if(resolveFn) resolveFn(hasInput ? null : false);
      resolveFn = null;
    });
    el.btnOk.addEventListener('click', ()=>{
      if(el.btnOk.disabled) return;
      close();
      if(resolveFn) resolveFn(hasInput ? el.input.value.trim() : true);
      resolveFn = null;
    });
    el.input.addEventListener('keydown', e=>{
      if(e.key==='Enter' && !el.btnOk.disabled) el.btnOk.click();
    });
    wrap.addEventListener('click', e=>{
      if(e.target.id==='coreconfirm-overlay') el.btnCancel.click();
    });
  }

  function close(){ el.overlay.classList.remove('show'); }

  function show(opts){
    opts = opts || {};
    injectDOM();
    return new Promise(resolve=>{
      resolveFn = resolve;
      hasInput = !!(opts.requireText || (opts.inputDefault!==undefined && opts.inputDefault!==null));
      requireText = opts.requireText || '';

      el.title.textContent = opts.title || 'Konfirmasi';
      el.message.textContent = opts.message || '';
      el.btnCancel.textContent = opts.cancelText || 'Batal';
      el.btnOk.textContent = opts.confirmText || 'Ya';
      el.btnOk.classList.toggle('danger', !!opts.danger);

      if(opts.requireText){
        el.inputWrap.classList.remove('hidden');
        el.input.type = 'text'; el.input.value=''; el.input.placeholder = opts.requireText;
        el.hint.classList.remove('hidden');
        el.hint.textContent = opts.requireHint || `Ketik "${opts.requireText}" untuk konfirmasi`;
        el.btnOk.disabled = true;
        el.input.oninput = ()=>{ el.btnOk.disabled = el.input.value.trim() !== requireText; };
      } else if(opts.inputDefault !== undefined && opts.inputDefault !== null){
        el.inputWrap.classList.remove('hidden');
        el.input.type = opts.inputType || 'text';
        el.input.value = opts.inputDefault;
        el.input.placeholder = opts.inputPlaceholder || '';
        el.hint.classList.add('hidden');
        el.input.oninput = null;
        el.btnOk.disabled = false;
      } else {
        el.inputWrap.classList.add('hidden');
        el.hint.classList.add('hidden');
        el.input.oninput = null;
        el.btnOk.disabled = false;
      }

      el.overlay.classList.add('show');
      setTimeout(()=>{ if(hasInput){ el.input.focus(); el.input.select(); } }, 50);
    });
  }

  window.CoreConfirm = { show };
})();
