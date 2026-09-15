"use client";

import { useEffect, useRef, useState } from "react";
import { LocateFixed, MapPin, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { countryName } from "@/lib/countries";
import { loadGoogleMaps } from "@/lib/google-maps";
import type { InvitePlace } from "@/lib/fields/invite";
import type { GeoSuggestion } from "@/lib/geo";
import { cn } from "@/lib/utils";

const KUWAIT = { lat: 29.3759, lng: 47.9774 };

function emptyPlace(): InvitePlace {
  return { location: "", lat: null, lng: null, placeId: "" };
}

function toPlace(hit: GeoSuggestion): InvitePlace | null {
  if (hit.lat == null || hit.lng == null) return null;
  return {
    location: hit.secondary ? `${hit.label}, ${hit.secondary}` : hit.label,
    lat: hit.lat,
    lng: hit.lng,
    placeId: hit.placeId,
  };
}

function countryQuery(country: string): string {
  return country ? `&country=${encodeURIComponent(country)}` : "";
}

async function lookupGeo(params: string): Promise<{
  status: number;
  data: unknown;
}> {
  const res = await fetch(`/api/geo?${params}`);
  const data: unknown = await res.json().catch(() => null);
  return { status: res.status, data };
}

export function LocationPicker({
  value,
  onChange,
  country = "",
}: {
  value: InvitePlace;
  onChange: (next: InvitePlace) => void;
  country?: string;
}) {
  const [query, setQuery] = useState(value.location);
  const [predictions, setPredictions] = useState<GeoSuggestion[]>([]);
  const [mapsReady, setMapsReady] = useState(false);
  const [mapsFailed, setMapsFailed] = useState(false);
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const countryRef = useRef(country);
  countryRef.current = country;
  const valueRef = useRef(value);
  valueRef.current = value;
  const searchTimer = useRef<number>(0);
  const searchAbort = useRef<AbortController | null>(null);
  const sessionRef = useRef(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `sess-${Date.now()}`,
  );
  const [provider, setProvider] = useState<"google" | "osm" | "">("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    setQuery(value.location);
  }, [value.location]);

  function snapMarkerBack() {
    const marker = markerRef.current;
    const current = valueRef.current;
    if (!marker) return;
    if (current.lat == null || current.lng == null) {
      marker.setMap(null);
      return;
    }
    marker.setPosition({ lat: current.lat, lng: current.lng });
  }

  function outsideCountryMessage() {
    const code = countryRef.current;
    return code
      ? `That place is outside ${countryName(code)}.`
      : "That place is outside the selected country.";
  }

  function applyPlace(next: InvitePlace) {
    setQuery(next.location);
    setPredictions([]);
    setSearching(false);
    setSearchError(null);
    onChangeRef.current(next);
  }

  async function reverseGeocode(lat: number, lng: number) {
    const fallback: InvitePlace = {
      location: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      lat,
      lng,
      placeId: "",
    };
    try {
      const { status, data } = await lookupGeo(
        `lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}${countryQuery(countryRef.current)}`,
      );
      if (status === 422) {
        setSearchError(outsideCountryMessage());
        snapMarkerBack();
        return;
      }
      if (data && typeof data === "object" && "lat" in data) {
        const place = toPlace(data as GeoSuggestion);
        if (place) {
          applyPlace(place);
          return;
        }
      }
    } catch {
      /* pin anyway when unrestricted */
    }
    if (countryRef.current) {
      setSearchError(outsideCountryMessage());
      snapMarkerBack();
      return;
    }
    applyPlace(fallback);
  }

  const reverseGeocodeRef = useRef(reverseGeocode);
  reverseGeocodeRef.current = reverseGeocode;

  useEffect(() => {
    let cancelled = false;
    let clickListener: google.maps.MapsEventListener | null = null;

    async function setup() {
      try {
        const cfg = await fetch("/api/geo?config=1");
        const json: unknown = await cfg.json();
        const key =
          json && typeof json === "object" && "key" in json
            ? String((json as { key?: unknown }).key ?? "")
            : "";
        if (!key) throw new Error("missing maps key");
        await loadGoogleMaps(key);
        if (cancelled || !mapEl.current) return;
        const win = window as Window & { gm_authFailure?: () => void };
        win.gm_authFailure = () => {
          if (cancelled) return;
          if (mapEl.current) mapEl.current.replaceChildren();
          setMapsReady(false);
          setMapsFailed(true);
        };
        const startLat = mapEl.current.dataset.lat
          ? Number(mapEl.current.dataset.lat)
          : NaN;
        const startLng = mapEl.current.dataset.lng
          ? Number(mapEl.current.dataset.lng)
          : NaN;
        const hasPin = Number.isFinite(startLat) && Number.isFinite(startLng);
        const map = new google.maps.Map(mapEl.current, {
          center: hasPin ? { lat: startLat, lng: startLng } : KUWAIT,
          zoom: hasPin ? 17 : 12,
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: true,
          gestureHandling: "greedy",
        });
        clickListener = map.addListener(
          "click",
          (event: google.maps.MapMouseEvent) => {
            const icon = event as google.maps.IconMouseEvent;
            if (icon.placeId) event.stop?.();
            const lat = event.latLng?.lat();
            const lng = event.latLng?.lng();
            if (lat == null || lng == null) return;
            reverseGeocodeRef.current(lat, lng);
          },
        );
        mapRef.current = map;
        window.setTimeout(() => {
          google.maps.event.trigger(map, "resize");
          if (hasPin) map.setCenter({ lat: startLat, lng: startLng });
        }, 80);
        setMapsReady(true);
      } catch {
        if (!cancelled) setMapsFailed(true);
      }
    }

    void setup();
    return () => {
      cancelled = true;
      clickListener?.remove();
      markerRef.current?.setMap(null);
      markerRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapsReady || !map) return;
    if (value.lat == null || value.lng == null) {
      markerRef.current?.setMap(null);
      markerRef.current = null;
      return;
    }
    const position = { lat: value.lat, lng: value.lng };
    if (!markerRef.current) {
      const marker = new google.maps.Marker({
        map,
        position,
        draggable: true,
        animation: google.maps.Animation.DROP,
      });
      marker.addListener("dragend", () => {
        const pos = marker.getPosition();
        if (!pos) return;
        reverseGeocodeRef.current(pos.lat(), pos.lng());
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setPosition(position);
      if (!markerRef.current.getMap()) markerRef.current.setMap(map);
    }
    map.panTo(position);
    if ((map.getZoom() ?? 0) < 16) map.setZoom(17);
  }, [mapsReady, value.lat, value.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapsReady || !map || !country || value.lat != null) return;
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode(
      {
        address: countryName(country),
        componentRestrictions: { country },
      },
      (results, status) => {
        if (status !== "OK" || !results?.[0] || mapRef.current !== map) return;
        const viewport = results[0].geometry.viewport;
        if (viewport) {
          map.fitBounds(viewport);
          return;
        }
        const location = results[0].geometry.location;
        if (location) {
          map.setCenter(location);
          map.setZoom(6);
        }
      },
    );
  }, [mapsReady, country, value.lat]);

  function searchPlaces(text: string) {
    window.clearTimeout(searchTimer.current);
    searchAbort.current?.abort();
    const q = text.trim();
    if (q.length < 2) {
      setPredictions([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    searchTimer.current = window.setTimeout(() => {
      const ac = new AbortController();
      searchAbort.current = ac;
      void fetch(
        `/api/geo?q=${encodeURIComponent(q)}&session=${encodeURIComponent(sessionRef.current)}${countryQuery(countryRef.current)}`,
        { signal: ac.signal },
      )
        .then(async (res) => {
          const source = res.headers.get("X-Geo-Provider");
          if (source === "google" || source === "osm") setProvider(source);
          if (!res.ok) {
            setSearchError("Could not load places");
            return [];
          }
          return res.json();
        })
        .then((rows: unknown) => {
          if (ac.signal.aborted) return;
          setPredictions(Array.isArray(rows) ? (rows as GeoSuggestion[]) : []);
          setSearching(false);
        })
        .catch(() => {
          if (ac.signal.aborted) return;
          setPredictions([]);
          setSearching(false);
          setSearchError("Could not load places");
        });
    }, 220);
  }

  useEffect(() => {
    setPredictions([]);
    setSearchError(null);
  }, [country]);

  function onQueryChange(text: string) {
    setQuery(text);
    onChangeRef.current({
      location: text,
      lat: value.lat,
      lng: value.lng,
      placeId: value.placeId,
    });
    searchPlaces(text);
  }

  async function selectSuggestion(row: GeoSuggestion) {
    const ready = toPlace(row);
    if (ready) {
      applyPlace(ready);
      return;
    }
    const { status, data } = await lookupGeo(
      `placeId=${encodeURIComponent(row.placeId)}&session=${encodeURIComponent(sessionRef.current)}${countryQuery(countryRef.current)}`,
    );
    sessionRef.current =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `sess-${Date.now()}`;
    if (status === 422) {
      setSearchError(outsideCountryMessage());
      setPredictions([]);
      return;
    }
    const place =
      data && typeof data === "object" ? toPlace(data as GeoSuggestion) : null;
    if (place) {
      applyPlace(place);
      return;
    }
    applyPlace({
      location: row.secondary ? `${row.label}, ${row.secondary}` : row.label,
      lat: null,
      lng: null,
      placeId: row.placeId,
    });
  }

  function clear() {
    window.clearTimeout(searchTimer.current);
    searchAbort.current?.abort();
    applyPlace(emptyPlace());
  }

  function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        reverseGeocodeRef.current(pos.coords.latitude, pos.coords.longitude);
        mapRef.current?.setZoom(17);
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  const countryLabel = country ? countryName(country) : "";

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Location</Label>
      <div className="relative z-50">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onBlur={() => {
            window.setTimeout(() => {
              setPredictions([]);
              setSearching(false);
            }, 160);
          }}
          placeholder={
            countryLabel
              ? `Search a place in ${countryLabel}`
              : "Search a place or type a video-call link"
          }
          className="ps-8 pe-8"
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear location"
          >
            <X className="size-3.5" />
          </button>
        )}
        {(searching || predictions.length > 0) && (
          <ul className="absolute inset-x-0 top-full z-[1100] mt-1 max-h-56 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg">
            {searching && predictions.length === 0 && (
              <li className="px-2 py-2 text-s text-muted-foreground">Searching…</li>
            )}
            {predictions.map((row) => (
              <li key={row.placeId}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void selectSuggestion(row)}
                  className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-start hover:bg-accent/60"
                >
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate text-s">{row.label}</span>
                    {row.secondary && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {row.secondary}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
            {provider === "google" && predictions.length > 0 && (
              <li className="px-2 py-1 text-end text-[10px] text-muted-foreground">
                Powered by Google
              </li>
            )}
          </ul>
        )}
      </div>
      {searchError && predictions.length === 0 && !searching && (
        <p className="text-xs text-destructive">{searchError}</p>
      )}
      <div className="relative z-0">
        <div
          ref={mapEl}
          data-lat={value.lat ?? undefined}
          data-lng={value.lng ?? undefined}
          className={cn(
            "nizek-location-map h-96 w-full overflow-hidden rounded-xl border border-border bg-muted/30",
            !mapsReady && !mapsFailed && "animate-pulse",
          )}
        />
        {mapsFailed && (
          <p className="pt-1.5 text-xs text-muted-foreground">
            Maps JavaScript API is off on this Cloud project. Enable it, add it
            to the key’s API restrictions, wait a minute, then refresh.
          </p>
        )}
        {mapsReady && (
          <button
            type="button"
            onClick={useMyLocation}
            className="absolute right-2 top-2 z-[5] inline-flex size-8 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm hover:bg-muted"
            aria-label="Use my location"
          >
            <LocateFixed className="size-3.5" />
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {countryLabel
          ? `Search, drop a pin, or use your location — only places in ${countryLabel} are kept.`
          : "Search a place, click the map to drop a pin, or type a video-call link."}
      </p>
    </div>
  );
}
