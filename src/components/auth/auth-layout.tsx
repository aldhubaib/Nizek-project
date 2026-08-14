"use client";

export type GalleryPhoto = { id: string; column: "a" | "b"; url: string };

const CARDS_A = [
  { title: "Mobile App Redesign", from: "#bcdcff", to: "#e8f2ff", text: "#1a2340" },
  { title: "Work is bond", from: "#0f0f0f", to: "#1a1a1a", text: "#f2ead6" },
  { title: "Ambitious teams ship", from: "#ff5a2a", to: "#ff7a4a", text: "#0d0d0d" },
  { title: "Studio Portrait", from: "#f0e6d8", to: "#d9cab6", text: "#2b2416" },
  { title: "Ocean Deep", from: "#0c2340", to: "#2d8a9e", text: "#e8f4f8" },
];

const CARDS_B = [
  { title: "Visual Electric", from: "#f3ede4", to: "#dcd2c2", text: "#2b2416" },
  { title: "Data visualization studio", from: "#0d0d18", to: "#1a1a2e", text: "#e8e6f5" },
  { title: "A personal assistant", from: "#f5efe6", to: "#e8dcc8", text: "#2b2416" },
  { title: "Resources to get started", from: "#0a1f14", to: "#12341f", text: "#e8f0e0" },
  { title: "Neon Mint", from: "#0d1b2a", to: "#2dd4a8", text: "#0a1a12" },
];

export function AuthLayout({
  children,
  photos = [],
  logoUrl = null,
}: {
  children: React.ReactNode;
  photos?: GalleryPhoto[];
  logoUrl?: string | null;
}) {
  return (
    <div className="flex min-h-screen w-full bg-black text-white">
      {/* Left: auth form */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="flex w-full max-w-[400px] flex-col items-center text-center">
          {/* Logo */}
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Nizek" className="h-11 w-11 rounded-xl" />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15">
              <span className="text-base font-bold text-primary">N</span>
            </div>
          )}

          <h1 className="mt-6 text-[26px] font-semibold leading-[1.2] tracking-tight text-white">
            Welcome to Nizek
          </h1>
          <p className="text-[26px] font-semibold leading-[1.2] tracking-tight text-white/45">
            Start managing now.
          </p>

          {/* Clerk form */}
          <div className="mt-8 w-full">{children}</div>

          <p className="mt-8 text-[10px] text-white/30">
            Access is restricted to approved accounts only.
          </p>
        </div>
      </div>

      {/* Right: scrolling gallery */}
      <ScrollingGallery photos={photos} />
    </div>
  );
}

function ScrollingGallery({ photos }: { photos: GalleryPhoto[] }) {
  const custom = photos.length > 0;
  const photosA = photos.filter((p) => p.column === "a");
  const photosB = photos.filter((p) => p.column === "b");

  return (
    <div className="relative hidden w-[46%] shrink-0 overflow-hidden lg:block">
      <div className="absolute inset-0 grid grid-cols-2 gap-4 p-4">
        <div className="relative overflow-hidden">
          <div className="animate-scroll-up flex flex-col gap-4">
            {custom
              ? [...photosA, ...photosA].map((p, i) => (
                  <PhotoCard key={`a-${i}`} src={p.url} />
                ))
              : [...CARDS_A, ...CARDS_A].map((c, i) => (
                  <GalleryCard key={`a-${i}`} {...c} />
                ))}
          </div>
        </div>
        <div className="relative overflow-hidden">
          <div className="animate-scroll-down flex flex-col gap-4">
            {custom
              ? [...photosB, ...photosB].map((p, i) => (
                  <PhotoCard key={`b-${i}`} src={p.url} />
                ))
              : [...CARDS_B, ...CARDS_B].map((c, i) => (
                  <GalleryCard key={`b-${i}`} {...c} />
                ))}
          </div>
        </div>
      </div>

      {/* Top/bottom fade for polish */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black to-transparent" />
    </div>
  );
}

function PhotoCard({ src }: { src: string }) {
  return (
    <div className="aspect-[3/4] w-full overflow-hidden rounded-2xl shadow-lg ring-1 ring-white/5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-full w-full object-cover" />
    </div>
  );
}

function GalleryCard({
  title,
  from,
  to,
  text,
}: {
  title: string;
  from: string;
  to: string;
  text: string;
}) {
  return (
    <div
      className="flex aspect-[3/4] w-full flex-col justify-end rounded-2xl p-5 shadow-lg ring-1 ring-white/5"
      style={{
        backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
        color: text,
      }}
    >
      <div className="text-[15px] font-semibold leading-tight tracking-tight">
        {title}
      </div>
    </div>
  );
}
