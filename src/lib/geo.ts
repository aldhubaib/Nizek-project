import { isCountryCode } from "@/lib/countries";

export type GeoSuggestion = {
  placeId: string;
  label: string;
  secondary: string;
  lat: number | null;
  lng: number | null;
  country: string | null;
};

export type PhotonFeature = {
  geometry?: { coordinates?: unknown };
  properties?: {
    osm_id?: unknown;
    osm_type?: unknown;
    name?: unknown;
    street?: unknown;
    housenumber?: unknown;
    district?: unknown;
    city?: unknown;
    state?: unknown;
    country?: unknown;
    countrycode?: unknown;
  };
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeCountryCode(raw: string | null | undefined): string {
  const code = (raw ?? "").trim().toUpperCase();
  return isCountryCode(code) ? code : "";
}

export function countryFromAddressComponents(components: unknown): string | null {
  if (!Array.isArray(components)) return null;
  for (const item of components) {
    if (!item || typeof item !== "object") continue;
    const row = item as {
      types?: unknown;
      shortText?: unknown;
      short_name?: unknown;
    };
    const types = Array.isArray(row.types) ? row.types.map(String) : [];
    if (!types.includes("country")) continue;
    const code = text(row.shortText || row.short_name).toUpperCase();
    return isCountryCode(code) ? code : null;
  }
  return null;
}

export function suggestionMatchesCountry(
  suggestion: Pick<GeoSuggestion, "country"> | null | undefined,
  country: string,
): boolean {
  const required = normalizeCountryCode(country);
  if (!required) return true;
  const found = suggestion?.country?.trim().toUpperCase() ?? "";
  return found === required;
}

function countryFromPhoton(props: PhotonFeature["properties"]): string | null {
  const code = text(props?.countrycode).toUpperCase();
  return isCountryCode(code) ? code : null;
}

function joinParts(parts: Array<string | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(", ");
}

export function suggestionFromPhoton(
  feature: PhotonFeature,
): GeoSuggestion | null {
  const coords = feature.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = typeof coords[0] === "number" ? coords[0] : Number(coords[0]);
  const lat = typeof coords[1] === "number" ? coords[1] : Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const props = feature.properties ?? {};
  const name = text(props.name);
  const street = joinParts([text(props.housenumber), text(props.street)]);
  const area = joinParts([
    text(props.district),
    text(props.city),
    text(props.state),
    text(props.country),
  ]);
  const label = name || street || area || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  const secondary = joinParts([
    name ? street : "",
    area === label ? "" : area,
  ]);

  const osmType = text(props.osm_type);
  const osmId = typeof props.osm_id === "number" ? String(props.osm_id) : text(props.osm_id);
  const placeId =
    osmType && osmId ? `${osmType}:${osmId}` : `${lat.toFixed(6)},${lng.toFixed(6)}`;

  return {
    placeId,
    label,
    secondary,
    lat,
    lng,
    country: countryFromPhoton(props),
  };
}

export function suggestionsFromPhotonCollection(raw: unknown): GeoSuggestion[] {
  if (!raw || typeof raw !== "object") return [];
  const features = (raw as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];
  const seen = new Set<string>();
  const out: GeoSuggestion[] = [];
  for (const feature of features) {
    if (!feature || typeof feature !== "object") continue;
    const suggestion = suggestionFromPhoton(feature as PhotonFeature);
    if (!suggestion) continue;
    if (seen.has(suggestion.placeId)) continue;
    seen.add(suggestion.placeId);
    out.push(suggestion);
  }
  return out;
}

function googleText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  return text((value as { text?: unknown }).text);
}

/** Autocomplete (New) returns names only — coordinates come from Place Details. */
export function suggestionsFromGoogleAutocomplete(raw: unknown): GeoSuggestion[] {
  if (!raw || typeof raw !== "object") return [];
  const rows = (raw as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const out: GeoSuggestion[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const prediction = (row as { placePrediction?: unknown }).placePrediction;
    if (!prediction || typeof prediction !== "object") continue;
    const pred = prediction as {
      placeId?: unknown;
      place?: unknown;
      text?: unknown;
      structuredFormat?: {
        mainText?: unknown;
        secondaryText?: unknown;
      };
    };
    let placeId = text(pred.placeId);
    if (!placeId) {
      const resource = text(pred.place);
      placeId = resource.replace(/^places\//, "");
    }
    if (!placeId || seen.has(placeId)) continue;
    const label =
      googleText(pred.structuredFormat?.mainText) ||
      googleText(pred.text) ||
      placeId;
    const secondary = googleText(pred.structuredFormat?.secondaryText);
    seen.add(placeId);
    out.push({ placeId, label, secondary, lat: null, lng: null, country: null });
  }
  return out;
}

export function suggestionFromGooglePlaceDetails(raw: unknown): GeoSuggestion | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as {
    id?: unknown;
    formattedAddress?: unknown;
    shortFormattedAddress?: unknown;
    displayName?: unknown;
    location?: { latitude?: unknown; longitude?: unknown };
    addressComponents?: unknown;
  };
  const lat = Number(row.location?.latitude);
  const lng = Number(row.location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const name = googleText(row.displayName);
  const address = text(row.formattedAddress) || text(row.shortFormattedAddress);
  const label = name || text(row.shortFormattedAddress) || address;
  const secondary = address && address !== label ? address : "";
  const placeId =
    text(row.id).replace(/^places\//, "") || `${lat.toFixed(6)},${lng.toFixed(6)}`;
  return {
    placeId,
    label,
    secondary,
    lat,
    lng,
    country: countryFromAddressComponents(row.addressComponents),
  };
}

export function suggestionFromGoogleGeocode(raw: unknown): GeoSuggestion | null {
  if (!raw || typeof raw !== "object") return null;
  const results = (raw as { results?: unknown }).results;
  if (!Array.isArray(results) || results.length === 0) return null;
  const first = results[0];
  if (!first || typeof first !== "object") return null;
  const row = first as {
    place_id?: unknown;
    formatted_address?: unknown;
    geometry?: { location?: { lat?: unknown; lng?: unknown } };
    address_components?: unknown;
  };
  const lat = Number(row.geometry?.location?.lat);
  const lng = Number(row.geometry?.location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const label = text(row.formatted_address) || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  return {
    placeId: text(row.place_id),
    label,
    secondary: "",
    lat,
    lng,
    country: countryFromAddressComponents(row.address_components),
  };
}
