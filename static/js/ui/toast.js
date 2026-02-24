/**
 * Toast notification helper.
 */

let toastTimer = null;

export function showToast(msg, duration = 2000) {
    let toast = document.getElementById('toast-msg');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-msg';
        toast.style.cssText = `
            position:fixed;bottom:60px;left:50%;transform:translateX(-50%);
            background:var(--color-glass);
            backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
            border:1px solid var(--color-border);
            padding:8px 16px;border-radius:6px;font-size:13px;z-index:99;
            color:var(--color-text);
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.style.display = 'none', duration);
}
