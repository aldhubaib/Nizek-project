import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  normalizeCountryCode,
  suggestionFromGoogleGeocode,
  suggestionFromGooglePlaceDetails,
  suggestionMatchesCountry,
  suggestionsFromGoogleAutocomplete,
  suggestionsFromPhotonCollection,
} from "@/lib/geo";
import {
  googleAutocomplete,
  googleMapsServerKey,
  googlePlaceDetails,
  googleReverseGeocode,
} from "@/lib/google-places";

export const runtime = "nodejs";

const PHOTON = "https://photon.komoot.io";
const USER_AGENT = "NizekPanel/1.0 (https://panel.nizek.com)";

let lastPhoton = 0;

async function photon(path: string): Promise<unknown> {
  const wait = lastPhoton + 350 - Date.now();
  lastPhoton = Date.now() + Math.max(0, wait);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  const res = await fetch(`${PHOTON}${path}`, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`geo ${res.status}`);
  return res.json();
}

export async function GET(req: NextRequest) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const placeId = req.nextUrl.searchParams.get("placeId")?.trim() ?? "";
  const session = req.nextUrl.searchParams.get("session")?.trim() ?? "";
  const country = normalizeCountryCode(req.nextUrl.searchParams.get("country"));
  const latParam = req.nextUrl.searchParams.get("lat");
  const lngParam = req.nextUrl.searchParams.get("lng");
  const googleKey = googleMapsServerKey();

  function outsideCountry() {
    return NextResponse.json({ error: "outside_country" }, { status: 422 });
  }

  if (req.nextUrl.searchParams.get("config") === "1") {
    return NextResponse.json({ key: googleKey });
  }

  try {
    if (placeId) {
      if (!googleKey) {
        return NextResponse.json({ error: "not_configured" }, { status: 501 });
      }
      const data = await googlePlaceDetails(placeId, session || undefined);
      const place = suggestionFromGooglePlaceDetails(data);
      if (country && (!place || !suggestionMatchesCountry(place, country))) {
        return outsideCountry();
      }
      return NextResponse.json(place);
    }

    if (latParam != null && lngParam != null) {
      const lat = Number(latParam);
      const lng = Number(lngParam);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
      }
      if (googleKey) {
        const data = await googleReverseGeocode(lat, lng);
        const place = suggestionFromGoogleGeocode(data);
        if (country && (!place || !suggestionMatchesCountry(place, country))) {
          return outsideCountry();
        }
        return NextResponse.json(place);
      }
      const data = await photon(
        `/reverse?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&lang=en`,
      );
      const place = suggestionsFromPhotonCollection(data)[0] ?? null;
      if (country && (!place || !suggestionMatchesCountry(place, country))) {
        return outsideCountry();
      }
      return NextResponse.json(place);
    }

    if (q.length < 2) return NextResponse.json([]);

    if (googleKey) {
      const data = await googleAutocomplete(q, session || undefined, country || undefined);
      return NextResponse.json(
        suggestionsFromGoogleAutocomplete(data).slice(0, 6),
        { headers: { "X-Geo-Provider": "google" } },
      );
    }

    const data = await photon(`/api/?q=${encodeURIComponent(q)}&limit=12&lang=en`);
    const rows = suggestionsFromPhotonCollection(data).filter((row) =>
      suggestionMatchesCountry(row, country),
    );
    return NextResponse.json(rows.slice(0, 6), {
      headers: { "X-Geo-Provider": "osm" },
    });
  } catch (err) {
    console.error("[geo]", err);
    return NextResponse.json({ error: "Lookup failed" }, { status: 502 });
  }
}
