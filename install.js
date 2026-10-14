/*
 * Install Unscripted as a home-screen app.
 * Browsers that do not expose beforeinstallprompt can still use their menu.
 */
(() => {
  const button = document.getElementById("installAppButton");
  const status = document.getElementById("installAppStatus");
  if (!button || !status) return;
  let installEvent = null;
  const offer = document.createElement("aside");
  offer.hidden = true;
  offer.setAttribute("aria-label", "Install Unscripted");
  offer.style.cssText = "position:fixed;left:16px;right:16px;bottom:calc(90px + env(safe-area-inset-bottom));max-width:460px;margin:auto;z-index:40;padding:18px;border-radius:20px;background:#202426;color:#f9f8f3;border:1px solid #465043;box-shadow:0 12px 40px #0008";
  offer.innerHTML = '<div style="display:flex;gap:12px;align-items:center"><img src="./icon-192.png" width="48" height="48" alt="" style="border-radius:12px"><div><strong>Take your thoughts with you.</strong><p style="margin:5px 0;font-size:14px">Install Unscripted and open it from your home screen.</p></div></div><div style="display:flex;gap:10px;margin-top:14px"><button type="button" class="button-primary" data-install>Install Unscripted</button><button type="button" class="button-soft" data-later>Not now</button></div>';
  document.body.appendChild(offer);
  let dismissed = false;
  try { dismissed = sessionStorage.getItem("unscripted-install-dismissed") === "1"; } catch (_) {}
  offer.querySelector("[data-install]").addEventListener("click", () => button.click());
  offer.querySelector("[data-later]").addEventListener("click", () => {
    offer.hidden = true;
    dismissed = true;
    try { sessionStorage.setItem("unscripted-install-dismissed", "1"); } catch (_) {}
  });

  function installed() {
    return window.matchMedia("(display-mode: standalone)").matches ||
           window.matchMedia("(display-mode: fullscreen)").matches ||
           window.navigator.standalone === true;
  }
  function tell(message) {
    status.hidden = false;
    status.textContent = message;
  }
  function sync() {
    if (installed()) {
      button.hidden = true;
      offer.hidden = true;
      tell("Unscripted is installed. Open it from your home screen.");
    } else {
      button.hidden = false;
    }
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installEvent = event;
    if (!installed() && !dismissed) offer.hidden = false;
    button.hidden = false;
    button.textContent = "↓ Install Unscripted";
  });

  button.addEventListener("click", async () => {
    if (installed()) {
      sync();
      return;
    }
    if (!installEvent) {
      tell("On Android: open this page in Chrome, tap ⋮, then choose Install app or Add to Home screen. In Samsung Internet, use its menu to add the page to your Home screen.");
      return;
    }
    offer.hidden = true;
    const promptEvent = installEvent;
    installEvent = null;
    button.disabled = true;
    try {
      await promptEvent.prompt();
      const result = await promptEvent.userChoice;
      if (result && result.outcome === "accepted") {
        tell("Follow the install confirmation, then open Unscripted from your home screen.");
      } else {
        tell("No problem. You can install Unscripted later from your browser menu.");
      }
    } catch (error) {
      tell("Open your browser menu and choose Install app or Add to Home screen.");
    } finally {
      button.disabled = false;
    }
  });

  window.addEventListener("appinstalled", () => {
    installEvent = null;
    offer.hidden = true;
    button.hidden = true;
    tell("Installed! Find Unscripted in your apps or on your home screen.");
  });
  sync();
})();
