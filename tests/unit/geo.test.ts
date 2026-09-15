import { describe, expect, it } from "vitest";
import {
  suggestionFromPhoton,
  suggestionsFromPhotonCollection,
  suggestionsFromGoogleAutocomplete,
  suggestionFromGooglePlaceDetails,
  suggestionFromGoogleGeocode,
  suggestionMatchesCountry,
} from "../../src/lib/geo";

describe("geo suggestions", () => {
  it("reads a photon place", () => {
    const hit = suggestionFromPhoton({
      geometry: { coordinates: [47.9774, 29.3759] },
      properties: {
        osm_id: 1,
        osm_type: "N",
        name: "Nizek",
        city: "Kuwait City",
        country: "Kuwait",
        countrycode: "KW",
      },
    });
    expect(hit).toEqual({
      placeId: "N:1",
      label: "Nizek",
      secondary: "Kuwait City, Kuwait",
      lat: 29.3759,
      lng: 47.9774,
      country: "KW",
    });
  });

  it("skips features without coordinates", () => {
    expect(suggestionFromPhoton({ properties: { name: "Nowhere" } })).toBeNull();
    expect(suggestionsFromPhotonCollection({ features: [null, {}] })).toEqual([]);
  });

  it("reads Google autocomplete predictions without coordinates", () => {
    const rows = suggestionsFromGoogleAutocomplete({
      suggestions: [
        {
          placePrediction: {
            placeId: "ChIJtest",
            structuredFormat: {
              mainText: { text: "Nizek" },
              secondaryText: { text: "Kuwait City, Kuwait" },
            },
          },
        },
      ],
    });
    expect(rows).toEqual([
      {
        placeId: "ChIJtest",
        label: "Nizek",
        secondary: "Kuwait City, Kuwait",
        lat: null,
        lng: null,
        country: null,
      },
    ]);
  });

  it("reads Google place details coordinates and country", () => {
    expect(
      suggestionFromGooglePlaceDetails({
        id: "places/ChIJtest",
        displayName: { text: "Nizek" },
        formattedAddress: "Sharq, Kuwait City",
        location: { latitude: 29.3759, longitude: 47.9774 },
        addressComponents: [{ shortText: "KW", types: ["country"] }],
      }),
    ).toEqual({
      placeId: "ChIJtest",
      label: "Nizek",
      secondary: "Sharq, Kuwait City",
      lat: 29.3759,
      lng: 47.9774,
      country: "KW",
    });
  });

  it("reads a country from Google geocode components", () => {
    const hit = suggestionFromGoogleGeocode({
      results: [
        {
          place_id: "ChIJpin",
          formatted_address: "Kuwait City, Kuwait",
          geometry: { location: { lat: 29.37, lng: 47.97 } },
          address_components: [
            { short_name: "KW", types: ["country", "political"] },
          ],
        },
      ],
    });
    expect(hit?.country).toBe("KW");
    expect(suggestionMatchesCountry(hit, "KW")).toBe(true);
    expect(suggestionMatchesCountry(hit, "US")).toBe(false);
    expect(suggestionMatchesCountry(hit, "")).toBe(true);
  });
});
