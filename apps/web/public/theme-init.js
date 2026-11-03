// Applies the saved or system theme before first paint (external file: the CSP allows no inline script).
(() => {
  let choice = null;
  try {
    choice = localStorage.getItem("optnews-theme");
  } catch {}
  const dark = choice === "dark" || (choice !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
})();
