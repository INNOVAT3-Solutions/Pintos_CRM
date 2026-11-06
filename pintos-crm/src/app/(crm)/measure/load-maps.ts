/// <reference types="google.maps" />

/**
 * Loads the Google Maps JavaScript API once per page. Google only allows one
 * load per page, so every caller shares the same promise.
 */
type W = Window & {
  __pintosMaps?: Promise<typeof google.maps>;
  __pintosMapsReady?: () => void;
  gm_authFailure?: () => void;
};

export function loadGoogleMaps(key: string, onAuthFailure: () => void): Promise<typeof google.maps> {
  const w = window as W;
  // Google calls this global if the key is rejected (wrong restrictions, API not enabled, no billing).
  w.gm_authFailure = onAuthFailure;
  if (w.__pintosMaps) return w.__pintosMaps;

  w.__pintosMaps = new Promise((resolve, reject) => {
    w.__pintosMapsReady = () => resolve(google.maps);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=__pintosMapsReady`;
    s.async = true;
    s.onerror = () => {
      w.__pintosMaps = undefined;
      reject(new Error("Couldn't reach Google Maps. Check the internet connection."));
    };
    document.head.appendChild(s);
  });
  return w.__pintosMaps;
}
