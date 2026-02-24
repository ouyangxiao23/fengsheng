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
            background:#d1d9e6;
            box-shadow:0 4px 16px rgba(26,39,68,0.18), 0 2px 6px rgba(26,39,68,0.1);
            padding:10px 20px;border-radius:10px;font-size:13px;z-index:99;
            color:#1a2744;font-weight:500;
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.style.display = 'none', duration);
}
