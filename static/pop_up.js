/**
 * FreelanceFlow – Cookie & Terms of Service consent popup
 * Įterpkite šį failą į kiekvieną puslapį (arba bazinį šabloną) prieš </body>
 * Usage: <script src="{{ url_for('static', filename='consent_popup.js') }}"></script>
 *
 * Veikimo logika:
 *  – Rodo popup TIEK slapukų politikai, TIEK Paslaugų sąlygoms kartu.
 *  – Vartotojas turi pažymėti abi varneles ir paspausti „Sutinku".
 *  – Sutikimas išsaugomas localStorage['ff_consent'] = 'accepted'.
 *  – Jei localStorage nepasiekiamas (pvz. private mode), fallback į sessionStorage.
 *  – Popup dingsta su smooth animacija.
 */

(function () {
  'use strict';

  var STORAGE_KEY = 'ff_consent';
  var STORAGE_VAL = 'accepted';

  function getStorage() {
    try { localStorage.setItem('__test__', '1'); localStorage.removeItem('__test__'); return localStorage; }
    catch (e) { return sessionStorage; }
  }

  function isAlreadyAccepted() {
    try { return getStorage().getItem(STORAGE_KEY) === STORAGE_VAL; }
    catch (e) { return false; }
  }

  function saveConsent() {
    try { getStorage().setItem(STORAGE_KEY, STORAGE_VAL); }
    catch (e) { /* silent fail */ }
  }

  function injectStyles() {
    if (document.getElementById('ff-consent-style')) return;
    var style = document.createElement('style');
    style.id = 'ff-consent-style';
    style.textContent = [
      '#ff-consent-overlay{',
        'position:fixed;inset:0;z-index:99999;',
        'background:rgba(15,23,42,.55);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);',
        'display:flex;align-items:flex-end;justify-content:center;',
        'padding:1rem;',
        'opacity:1;transition:opacity .35s ease;',
      '}',
      '#ff-consent-overlay.ff-hiding{opacity:0;}',
      '#ff-consent-box{',
        'width:100%;max-width:620px;',
        'background:var(--surface,#fff);',
        'border-radius:16px 16px 12px 12px;',
        'padding:1.75rem 1.75rem 1.5rem;',
        'box-shadow:0 -4px 32px rgba(79,70,229,.15);',
        'transform:translateY(0);transition:transform .35s cubic-bezier(.4,0,.2,1);',
      '}',
      '#ff-consent-overlay.ff-hiding #ff-consent-box{transform:translateY(60px);}',
      '.ff-consent-icon{',
        'width:44px;height:44px;border-radius:12px;',
        'background:rgba(79,70,229,.1);',
        'display:flex;align-items:center;justify-content:center;',
        'margin-bottom:1rem;',
        'font-size:22px;',
      '}',
      '.ff-consent-title{font-size:1.05rem;font-weight:700;color:var(--text,#0f172a);margin:0 0 .4rem;}',
      '.ff-consent-desc{font-size:.875rem;color:var(--muted,#667085);line-height:1.55;margin:0 0 1.1rem;}',
      '.ff-checks{display:flex;flex-direction:column;gap:.55rem;margin-bottom:1.25rem;}',
      '.ff-check-row{display:flex;align-items:flex-start;gap:.6rem;}',
      '.ff-check-row input[type=checkbox]{',
        'width:18px;height:18px;margin-top:2px;flex-shrink:0;',
        'accent-color:var(--primary,#4f46e5);cursor:pointer;',
      '}',
      '.ff-check-row label{font-size:.84rem;color:var(--text-color,#1e293b);line-height:1.5;cursor:pointer;}',
      '.ff-check-row label a{color:var(--primary,#4f46e5);text-decoration:none;font-weight:600;}',
      '.ff-check-row label a:hover{text-decoration:underline;}',
      '.ff-consent-actions{display:flex;gap:.75rem;align-items:center;flex-wrap:wrap;}',
      '#ff-accept-btn{',
        'flex:1;min-width:140px;',
        'background:var(--primary,#4f46e5);color:#fff;',
        'border:none;border-radius:10px;',
        'padding:.6rem 1.25rem;font-size:.9rem;font-weight:600;',
        'cursor:pointer;transition:background .2s,opacity .2s;',
        'opacity:.45;pointer-events:none;',
      '}',
      '#ff-accept-btn.ff-ready{opacity:1;pointer-events:auto;}',
      '#ff-accept-btn.ff-ready:hover{background:var(--primary-dark,#4338ca);}',
      '#ff-decline-link{font-size:.8rem;color:var(--muted,#667085);text-decoration:none;cursor:pointer;white-space:nowrap;}',
      '#ff-decline-link:hover{text-decoration:underline;}',
      '[data-theme=dark] #ff-consent-box{box-shadow:0 -4px 32px rgba(0,0,0,.5);}',
      '[data-theme=dark] .ff-consent-icon{background:rgba(99,102,241,.18);}',
    ].join('');
    document.head.appendChild(style);
  }

  function buildPopup() {
    var overlay = document.createElement('div');
    overlay.id = 'ff-consent-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'ff-consent-title');

    overlay.innerHTML = [
      '<div id="ff-consent-box">',
        '<div class="ff-consent-icon" aria-hidden="true">',
          '<i class="fa-solid fa-cookie-bite" style="color:var(--primary,#4f46e5)"></i>',
        '</div>',
        '<p class="ff-consent-title" id="ff-consent-title">Jūsų privatumas svarbus mums</p>',
        '<p class="ff-consent-desc">',
          'FreelanceFlow naudoja sesijos slapukus autentifikacijai bei lokalią atmintį ',
          'temos nustatymams išsaugoti. Prieš tęsiant, prašome perskaityti ir sutikti su ',
          'mūsų dokumentais.',
        '</p>',
        '<div class="ff-checks">',
          '<div class="ff-check-row">',
            '<input type="checkbox" id="ff-chk-cookies">',
            '<label for="ff-chk-cookies">',
              'Susipažinau su <a href="/cookies" target="_blank" rel="noopener">Slapukų politika</a> ',
              'ir sutinku su slapukų naudojimu.',
            '</label>',
          '</div>',
          '<div class="ff-check-row">',
            '<input type="checkbox" id="ff-chk-terms">',
            '<label for="ff-chk-terms">',
              'Perskaičiau ir sutinku su <a href="/terms" target="_blank" rel="noopener">Paslaugų teikimo sąlygomis</a> ',
              '(įskaitant informacinį mokesčių skaičiavimų pobūdį).',
            '</label>',
          '</div>',
        '</div>',
        '<div class="ff-consent-actions">',
          '<button id="ff-accept-btn" disabled>',
            '<i class="fa-solid fa-check me-2"></i>Sutinku ir tęsiu',
          '</button>',
          '<a id="ff-decline-link" role="button" tabindex="0">',
            'Atsisakyti ir išeiti',
          '</a>',
        '</div>',
      '</div>',
    ].join('');

    document.body.appendChild(overlay);

    var btn     = document.getElementById('ff-accept-btn');
    var chkC    = document.getElementById('ff-chk-cookies');
    var chkT    = document.getElementById('ff-chk-terms');
    var decline = document.getElementById('ff-decline-link');

    function updateBtn() {
      if (chkC.checked && chkT.checked) {
        btn.disabled = false;
        btn.classList.add('ff-ready');
      } else {
        btn.disabled = true;
        btn.classList.remove('ff-ready');
      }
    }

    chkC.addEventListener('change', updateBtn);
    chkT.addEventListener('change', updateBtn);

    btn.addEventListener('click', function () {
      saveConsent();
      dismiss(overlay);
    });

    function declineAction() {
      window.location.href = 'https://www.google.com';
    }

    decline.addEventListener('click', declineAction);
    decline.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') declineAction();
    });

    // Trap focus inside popup
    overlay.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var focusable = overlay.querySelectorAll('a,button,input,[tabindex]:not([tabindex="-1"])');
      var first = focusable[0];
      var last  = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    });

    // Initial focus
    setTimeout(function () { chkC.focus(); }, 100);
  }

  function dismiss(overlay) {
    overlay.classList.add('ff-hiding');
    setTimeout(function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 380);
  }

  function init() {
    if (isAlreadyAccepted()) return;
    injectStyles();
    buildPopup();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();