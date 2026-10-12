/*
 * Install Unscripted as a home-screen app.
 * Browsers that do not expose beforeinstallprompt can still use their menu.
 */
(() => {
  const button = document.getElementById("installAppButton");
  const status = document.getElementById("installAppStatus");
  if (!button || !status) return;
  let installEvent = null;

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
      tell("Unscripted is installed. Open it from your home screen.");
    } else {
      button.hidden = false;
    }
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installEvent = event;
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
    button.hidden = true;
    tell("Installed! Find Unscripted in your apps or on your home screen.");
  });
  sync();
})();
