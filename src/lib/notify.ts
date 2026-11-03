import { APP_NAME } from "./brand";

export function notifySupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestNotify(): Promise<boolean> {
  if (!notifySupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

const SEEN_KEY = "migra:notified";

/** Show a notification at most once per tag (persists across reloads). */
export async function notifyOnce(tag: string, title: string, body: string) {
  if (!notifySupported() || Notification.permission !== "granted") return;
  let seen: string[] = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
    if (Array.isArray(parsed)) seen = parsed.filter((x): x is string => typeof x === "string");
  } catch {
    // ignore corrupt value
  }
  if (seen.includes(tag)) return;
  localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, tag].slice(-200)));
  const opts: NotificationOptions = { body, tag, silent: true, icon: "./icon-192.png" };
  try {
    // service worker notifications work on Android Chrome; page notifications don't
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(`${APP_NAME}: ${title}`, opts);
      return;
    }
  } catch {
    // fall through
  }
  try {
    new Notification(`${APP_NAME}: ${title}`, opts);
  } catch {
    // some browsers throw for page-level notifications
  }
}
