const GOAL = 10000;
const WORKER_URL = 'https://abaixo-assinado-1.juliospinola-l.workers.dev';
const site = window.location.href;

let CAMPANHA_ID = null;
let displayedCount = 0;

/* ── Utilitários ── */
function formatNum(n) {
  return n.toLocaleString('pt-BR');
}

function updateUI(n, animate) {
  const pct = Math.min(100, (n / GOAL) * 100);
  const left = Math.max(0, GOAL - n);

  document.getElementById('progressFill').style.width = pct.toFixed(2) + '%';
  document.getElementById('progressPct').textContent = pct.toFixed(1) + '%';
  document.getElementById('progressCount').innerHTML = formatNum(n) + ' <span>/ Meta: ' + formatNum(GOAL) + '</span>';
  document.getElementById('remainingText').textContent = left > 0
    ? 'Faltam ' + formatNum(left) + ' para a meta'
    : 'Meta atingida!';

  const el = document.getElementById('liveNum');
  el.textContent = formatNum(n);

  if (animate) {
    el.style.color = '#6effa0';
    setTimeout(function () { el.style.color = ''; }, 600);
  }
}

/* ── Busca IP do visitante ── */
async function getIP() {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    return data.ip.replace(/[^0-9a-fA-F.:]/g, '') || null;
  } catch {
    return null;
  }
}

/* ── Busca campanha_id + contagem via Worker ── */
function fetchRemoteCount(animate) {
  fetch(WORKER_URL + '/count?site=' + site)
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data.campanha_id) CAMPANHA_ID = data.campanha_id;
      var count = data.count || 0;
      if (count >= displayedCount) {
        displayedCount = count;
        updateUI(displayedCount, animate);
      }
    })
    .catch(function () { /* mantém valor atual */ });
}

/* ── Máscara CEP + busca ViaCEP ── */
document.addEventListener('DOMContentLoaded', function () {
  var cepInput = document.getElementById('cep');

  cepInput.addEventListener('input', function (e) {
    var v = e.target.value.replace(/\D/g, '').slice(0, 8);
    if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5);
    e.target.value = v;

    if (v.replace(/\D/g, '').length === 8) {
      buscarCEP(v.replace(/\D/g, ''));
    }
  });

  fetchRemoteCount(false);
});

function buscarCEP(cep) {
  fetch('https://viacep.com.br/ws/' + cep + '/json/')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (!data.erro) {
        var ruaInput = document.getElementById('rua');
        var ufInput = document.getElementById('estado');
        var cddInput = document.getElementById('cidade');
        if (!ruaInput.value) ruaInput.value = data.logradouro || '';
        if (!ufInput.value) ufInput.value = data.uf || '';
        if (!cddInput.value) cddInput.value = data.localidade || '';
        document.getElementById('numero').focus();
      }
    })
    .catch(function (err) { console.warn('CEP não encontrado:', err); });
}

/* ── Validação ── */
function clearErrors() {
  document.querySelectorAll('.form-input.error').forEach(function (el) { el.classList.remove('error'); });
  document.querySelectorAll('.field-error').forEach(function (el) { el.style.display = 'none'; });
}

function showError(inputId, msgId) {
  document.getElementById(inputId).classList.add('error');
  document.getElementById(msgId).style.display = 'block';
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function validateCEP(cep) {
  return /^\d{5}-?\d{3}$/.test(cep);
}

/* ── Envio do formulário ── */
async function handleSign() {
  if (!CAMPANHA_ID) {
    showToast('❌ Campanha não identificada. Recarregue a página.', true);
    return;
  }

  clearErrors();
  var ok = true;

  var nome        = document.getElementById('nome').value.trim();
  var tel         = document.getElementById('tel').value.trim();
  var mail        = document.getElementById('mail').value.trim();
  var rua         = document.getElementById('rua').value.trim();
  var numero      = document.getElementById('numero').value.trim();
  var complemento = document.getElementById('complemento').value.trim();
  var estado      = document.getElementById('estado').value.trim();
  var cidade      = document.getElementById('cidade').value.trim();
  var cep         = document.getElementById('cep').value.trim();

  if (!nome) { showError('nome', 'erroNome'); ok = false; }
  if (!tel || tel.replace(/\D/g, '').length < 10) { showError('tel', 'erroTel'); ok = false; }
  if (!mail || !validateEmail(mail)) { showError('mail', 'erroMail'); ok = false; }
  if (!rua || rua.length < 3 || !numero) {
    showError('rua', 'erroRua');
    if (!numero) document.getElementById('numero').classList.add('error');
    ok = false;
  }
  if (!cep || !validateCEP(cep)) { showError('cep', 'erroCep'); ok = false; }

  if (!ok) return;

  const cepLimpo = cep.replace(/\D/g, '');
  const foneLimpo = tel.replace(/\D/g, '');

  /* Incrementa otimisticamente na UI */
  displayedCount++;
  updateUI(displayedCount, true);

  try {
    const ip = await getIP();

    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campanha_id:           CAMPANHA_ID,
        nome_assinante:        nome,
        numero_assinante:      foneLimpo,
        email_assinante:       mail,
        endereco_assinante:    rua,
        n_assinante:           parseInt(numero) || null,
        complemento_assinante: complemento || null,
        estado_assinante:      estado || null,
        cidade_assinante:      cidade || null,
        cep_assinante:         cepLimpo,
        ip_origem:             ip
      })
    });

    if (!res.ok) {
      const err = await res.json();
      displayedCount--;
      updateUI(displayedCount, false);
      if (err.code === '23505') {
        const campo = err.message && err.message.includes('fone') ? 'telefone' : 'e-mail';
        showToast('⚠️ Este ' + campo + ' já assinou esta campanha.', true);
      } else {
        showToast('❌ Erro ao registrar assinatura. Tente novamente.', true);
      }
      return;
    }

    setTimeout(function () { fetchRemoteCount(false); }, 3000);

  } catch (err) {
    console.warn('Erro de rede:', err);
    displayedCount--;
    updateUI(displayedCount, false);
    showToast('❌ Erro de conexão. Verifique sua internet e tente novamente.', true);
    return;
  }

  /* Limpa o formulário */
  ['nome', 'tel', 'mail', 'rua', 'numero', 'complemento', 'cep', 'estado', 'cidade'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });

  showToast('✅ Assinatura registrada com sucesso!');
}

function showToast(msg, erro) {
  var toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.toggle('toast--erro', !!erro);
  toast.classList.add('show');
  setTimeout(function () { toast.classList.remove('show'); }, 2500);
}