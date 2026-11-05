// Applies the saved theme before first paint (external file: the CSP allows no inline script). Dark is the default
// for a first visit; "system" is stored explicitly when someone picks it.
(() => {
  let choice = null;
  try {
    choice = localStorage.getItem("optnews-theme");
  } catch {}
  const dark = choice === "system" ? matchMedia("(prefers-color-scheme: dark)").matches : choice !== "light";
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#141010" : "#faf8f5");
})();
