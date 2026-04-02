(() => {
  "use strict";

  const navButtons = Array.from(document.querySelectorAll(".screen-nav [data-target]"));
  const screens = Array.from(document.querySelectorAll(".screen"));

  const showScreen = (id) => {
    navButtons.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.target === id));
    screens.forEach((screen) => screen.classList.toggle("is-active", screen.dataset.screen === id));
  };

  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => showScreen(btn.dataset.target));
  });

  const drawer = document.getElementById("clinicalDrawer");
  const openDrawerBtn = document.getElementById("openDrawerBtn");
  const closeDrawerBtn = document.getElementById("closeDrawerBtn");

  const setDrawer = (open) => {
    if (!drawer) return;
    drawer.classList.toggle("open", open);
    drawer.setAttribute("aria-hidden", String(!open));
  };

  openDrawerBtn?.addEventListener("click", () => setDrawer(true));
  closeDrawerBtn?.addEventListener("click", () => setDrawer(false));
  drawer?.addEventListener("click", (event) => {
    if (event.target === drawer) setDrawer(false);
  });
})();
