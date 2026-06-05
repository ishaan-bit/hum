export function isHumDebugEnabled() {
  if (process.env.NODE_ENV !== "development") return false;
  if (typeof window === "undefined") return true;

  return window.localStorage.getItem("hum:debug") === "1";
}
