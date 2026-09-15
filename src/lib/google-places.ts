import "server-only";

const PLACES = "https://places.googleapis.com/v1";
const GEOCODE = "https://maps.googleapis.com/maps/api/geocode/json";
const KUWAIT = { latitude: 29.3759, longitude: 47.9774 };

export function googleMapsServerKey(): string {
  return (
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    ""
  );
}

async function placesPost(path: string, body: unknown, fieldMask?: string): Promise<unknown> {
  const key = googleMapsServerKey();
  const res = await fetch(`${PLACES}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      ...(fieldMask ? { "X-Goog-FieldMask": fieldMask } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? JSON.stringify((data as { error: unknown }).error)
        : `places ${res.status}`;
    throw new Error(message);
  }
  return data;
}

async function placesGet(path: string, fieldMask: string): Promise<unknown> {
  const key = googleMapsServerKey();
  const res = await fetch(`${PLACES}${path}`, {
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": fieldMask,
    },
    cache: "no-store",
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? JSON.stringify((data as { error: unknown }).error)
        : `places ${res.status}`;
    throw new Error(message);
  }
  return data;
}

export async function googleAutocomplete(
  input: string,
  sessionToken?: string,
  country?: string,
): Promise<unknown> {
  const region = country?.trim().toLowerCase() ?? "";
  return placesPost(
    "/places:autocomplete",
    {
      input,
      languageCode: "en",
      ...(region
        ? { includedRegionCodes: [region] }
        : {
            locationBias: {
              circle: {
                center: KUWAIT,
                radius: 50000.0,
              },
            },
          }),
      ...(region === "kw"
        ? {
            locationBias: {
              circle: {
                center: KUWAIT,
                radius: 50000.0,
              },
            },
          }
        : {}),
      ...(sessionToken ? { sessionToken } : {}),
    },
    "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text,suggestions.placePrediction.text.text",
  );
}

export async function googlePlaceDetails(
  placeId: string,
  sessionToken?: string,
): Promise<unknown> {
  const params = new URLSearchParams({ languageCode: "en" });
  if (sessionToken) params.set("sessionToken", sessionToken);
  const id = placeId.replace(/^places\//, "");
  return placesGet(
    `/places/${encodeURIComponent(id)}?${params.toString()}`,
    "id,displayName,formattedAddress,shortFormattedAddress,location,addressComponents",
  );
}

export async function googleReverseGeocode(
  lat: number,
  lng: number,
): Promise<unknown> {
  const key = googleMapsServerKey();
  const url = `${GEOCODE}?latlng=${encodeURIComponent(`${lat},${lng}`)}&key=${encodeURIComponent(key)}&language=en`;
  const res = await fetch(url, { cache: "no-store" });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`geocode ${res.status}`);
  const status = data && typeof data === "object" ? (data as { status?: unknown }).status : "";
  if (status && status !== "OK" && status !== "ZERO_RESULTS") {
    throw new Error(`geocode ${String(status)}`);
  }
  return data;
}
