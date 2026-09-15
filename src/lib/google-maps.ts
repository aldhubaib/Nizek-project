const SCRIPT_ATTR = "data-nizek-maps";
const CALLBACK = "__nizekMapsInit";

type MapsWindow = Window & {
  __nizekMapsInit?: () => void;
  gm_authFailure?: () => void;
};

let loading: Promise<void> | null = null;

function mapsReady(): boolean {
  return Boolean(typeof google !== "undefined" && google.maps?.Map);
}

export function loadGoogleMaps(key: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("maps is client-only"));
  }
  if (mapsReady()) return Promise.resolve();
  if (!key.trim()) return Promise.reject(new Error("missing maps key"));
  if (loading) return loading;

  loading = new Promise<void>((resolve, reject) => {
    const win = window as MapsWindow;
    win.gm_authFailure = () => {
      loading = null;
      reject(new Error("maps-js-not-enabled"));
    };
    const previous = win.__nizekMapsInit;
    win.__nizekMapsInit = () => {
      previous?.();
      if (mapsReady()) resolve();
      else {
        loading = null;
        reject(new Error("maps failed to initialize"));
      }
    };

    const existing = document.querySelector<HTMLScriptElement>(
      `script[${SCRIPT_ATTR}]`,
    );
    if (existing) {
      if (mapsReady()) {
        resolve();
        return;
      }
      existing.addEventListener("error", () => {
        loading = null;
        reject(new Error("maps failed to load"));
      });
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=${CALLBACK}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.setAttribute(SCRIPT_ATTR, "1");
    script.onerror = () => {
      loading = null;
      reject(new Error("maps failed to load"));
    };
    document.head.appendChild(script);
  });

  return loading;
}
