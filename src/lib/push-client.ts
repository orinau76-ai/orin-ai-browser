import { registerPushToken } from "./push.functions";

export type PushStatus =
  | { status: "registered"; token: string }
  | { status: "granted-local" }
  | { status: "unsupported" | "open-in-new-tab" | "denied" | "not-configured" };

const config = {
  apiKey: import.meta.env["VITE_FIREBASE_API_KEY"] as string | undefined,
  projectId: import.meta.env["VITE_FIREBASE_PROJECT_ID"] as string | undefined,
  appId: import.meta.env["VITE_FIREBASE_APP_ID"] as string | undefined,
  vapidKey: import.meta.env["VITE_FIREBASE_VAPID_KEY"] as string | undefined,
};

/**
 * Asks for notification permission and, when Firebase web config is present,
 * registers an FCM device token with the backend. Called from a click handler:
 * browsers ignore permission requests without a user gesture, and reject them
 * entirely inside the cross-origin preview iframe.
 */
export async function enablePush(): Promise<PushStatus> {
  if (typeof window === "undefined" || !("Notification" in window)) return { status: "unsupported" };
  if (window.top !== window.self) return { status: "open-in-new-tab" };

  const permission =
    Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return { status: "denied" };

  if (!config.apiKey || !config.projectId || !config.appId || !config.vapidKey) {
    return { status: "granted-local" };
  }

  try {
    const appModule = await import(/* @vite-ignore */ "firebase/app");
    const messagingModule = await import(/* @vite-ignore */ "firebase/messaging");
    if (!(await messagingModule.isSupported())) return { status: "unsupported" };

    const messagingSenderId = config.appId.split(":")[1] ?? "";
    const firebaseConfig = {
      apiKey: config.apiKey,
      projectId: config.projectId,
      appId: config.appId,
      vapidKey: config.vapidKey,
      messagingSenderId,
    };
    const query = new URLSearchParams(firebaseConfig as Record<string, string>).toString();
    const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${query}`);
    const messaging = messagingModule.getMessaging(appModule.initializeApp(firebaseConfig));
    const token = await messagingModule.getToken(messaging, {
      vapidKey: config.vapidKey,
      serviceWorkerRegistration: registration,
    });
    if (!token) return { status: "granted-local" };
    await registerPushToken({ data: { token, userAgent: navigator.userAgent } });
    return { status: "registered", token };
  } catch {
    return { status: "granted-local" };
  }
}
