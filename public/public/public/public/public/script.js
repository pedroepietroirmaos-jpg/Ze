```javascript
(function () {
  const page = document.body.dataset.page;
  const params = new URLSearchParams(location.search);
  const token = params.get('t');

  if (page === 'home') {
    const btn = document.getElementById('continueBtn');
    const err = document.getElementById('error');
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'Loading...';
      try {
        const r = await fetch('/api/start', { method: 'POST' });
        const data = await r.json();
        if (!data.ok) throw new Error(data.message || 'Erro');
        location.href = '/wait?t=' + data.token;
      } catch (e) {
        err.textContent = 'Não foi possível iniciar.'; err.hidden = false;
        btn.disabled = false; btn.textContent = 'Continue to Step ->';
      }
    });
  }

  if (page === 'wait') {
    const timerEl = document.getElementById('timer');
    const barFill = document.getElementById('barFill');
    const msg = document.getElementById('waitMsg');
    if (!token) { location.replace('/'); return; }

    async function init() {
      let status;
      try {
        const r = await fetch('/api/status?t=' + encodeURIComponent(token));
        if (!r.ok) throw new Error();
        status = await r.json();
      } catch { location.replace('/'); return; }

      const total = status.total;
      let remaining = status.remaining;

      function render() {
        timerEl.textContent = remaining;
        barFill.style.width = ((total - remaining) / total) * 100 + '%';
        msg.textContent = remaining > 0 ? 'Your key will be ready in ' + remaining + ' seconds...' : 'Done! Redirecting...';
      }
      render();

      const interval = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          remaining = 0; render(); clearInterval(interval);
          setTimeout(() => location.href = '/success?t=' + encodeURIComponent(token), 600);
          return;
        }
        render();
      }, 1000);
    }
    init();
  }

  if (page === 'success') {
    const statusEl = document.getElementById('status');
    const keyBox = document.getElementById('keyBox');
    const keyText = document.getElementById('keyText');
    const copyBtn = document.getElementById('copyBtn');
    const expires = document.getElementById('expires');
    const back = document.getElementById('backLink');
    if (!token) { location.replace('/'); return; }

    async function claim() {
      try {
        const r = await fetch('/api/claim?t=' + encodeURIComponent(token));
        const data = await r.json();
        if (r.status === 425) { location.replace('/wait?t=' + encodeURIComponent(token)); return; }
        if (!r.ok || !data.ok) { statusEl.textContent = data.message || 'Sessão inválida.'; back.hidden = false; return; }
        keyText.textContent = data.key; keyBox.hidden = false; copyBtn.hidden = false;
        statusEl.textContent = 'Copy your key and paste it in the Zenix script.';
        const exp = new Date(data.expiresAt);
        expires.textContent = 'Expires on ' + exp.toLocaleString() + ' (valid for 3 days)';
        expires.hidden = false; back.hidden = false;
      } catch { statusEl.textContent = 'Erro de conexão. Recarregue a página.'; }
    }

    copyBtn.addEventListener('click', async () => {
      const text = keyText.textContent;
      try { await navigator.clipboard.writeText(text); } catch {
        const ta = document.createElement('textarea'); ta.value = text;
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      copyBtn.textContent = 'Copiado!';
      setTimeout(() => (copyBtn.textContent = 'Copiar'), 2000);
    });
    claim();
  }
})();
```
