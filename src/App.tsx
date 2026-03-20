import { useState, useMemo } from "react";
import { Link } from "react-router";
import { games as realGames } from "virtual:games";

const mockTitles = [
  "Neon Drift",
  "Cyber Samurai",
  "Void Runner",
  "Pixel Forge",
  "Starship Command",
  "Abyssal Descent",
  "Crystal Quest",
  "Rogue Enigma",
  "Mech Arena",
  "Shadow Tactics",
  "Chrono Break",
  "Astro Miner",
  "Quantum Paradox",
  "Solar Flare",
  "Galactic Drift",
  "Titan Fall",
  "Echoes of Mana",
  "Blade Runner",
  "Zero Gravity",
];

const displayGames = [...new Set([...realGames, ...mockTitles])];

function FakeMedia({ index }: { index: number }) {
  const baseHue = (index * 137.5) % 360;
  const accentHue = (baseHue + 180) % 360;
  const shapeSize = 40 + (index % 5) * 15;

  const cx = 200 + Math.sin(index) * 80;
  const cy = 112 + Math.cos(index) * 40;

  return (
    <svg
      className="absolute inset-0 w-full h-full object-cover z-0 opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-transform duration-700 ease-out"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 400 225"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient
          id={`grad-${index}`}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop offset="0%" stopColor={`hsl(${baseHue}, 60%, 25%)`} />
          <stop
            offset="100%"
            stopColor={`hsl(${(baseHue + 40) % 360}, 50%, 45%)`}
          />
        </linearGradient>
        <pattern
          id={`grid-${index}`}
          x="0"
          y="0"
          width="24"
          height="24"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="2" cy="2" r="1.5" fill="rgba(255,255,255,0.08)" />
        </pattern>
      </defs>

      <rect width="400" height="225" fill={`url(#grad-${index})`} />
      <rect width="400" height="225" fill={`url(#grid-${index})`} />

      <circle
        cx={cx}
        cy={cy}
        r={shapeSize}
        fill={`hsl(${accentHue}, 70%, 60%)`}
        opacity="0.3"
        className="mix-blend-overlay"
      />

      <polygon
        points="0,225 400,225 400,160 0,190"
        fill="rgba(15, 23, 42, 0.4)"
      />
    </svg>
  );
}

function GameTile({ title, index }: { title: string; index: number }) {
  const isReal = realGames.includes(title);
  const route = isReal ? `/play/${title}` : "#";

  return (
    <Link
      to={route}
      className={`relative block w-full aspect-video bg-slate-800 rounded-2xl border-[3px] transition-all duration-300 overflow-hidden shadow-lg group ${
        isReal
          ? "border-transparent hover:border-indigo-400/50 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-indigo-500/10 cursor-pointer"
          : "border-slate-800 hover:border-slate-700 cursor-not-allowed opacity-75"
      }`}
      onClick={(e) => {
        if (!isReal) e.preventDefault();
      }}
    >
      <FakeMedia index={index} />

      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/30 to-transparent z-10" />

      <div className="absolute bottom-0 left-0 p-5 z-20 w-full flex justify-between items-end">
        <div className="flex-1 min-w-0 pr-4">
          <h2 className="text-slate-50 font-extrabold text-2xl tracking-wide truncate drop-shadow-md">
            {title}
          </h2>
          <div className="mt-2.5 flex items-center gap-3">
            {isReal ? (
              <span className="bg-indigo-500 text-white text-[0.7rem] font-bold px-3 py-1.5 rounded-md uppercase tracking-widest shadow-sm shadow-indigo-500/30 ring-1 ring-white/10">
                Play Now
              </span>
            ) : (
              <span className="bg-slate-700/80 text-slate-300 text-[0.7rem] font-semibold px-3 py-1.5 rounded-md uppercase tracking-widest backdrop-blur-sm">
                Coming Soon
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 text-slate-400 group-hover:text-white transition-colors duration-300 transform group-hover:scale-110">
          <svg
            className="w-9 h-9 drop-shadow-sm"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
      </div>
    </Link>
  );
}

export default function App() {
  const [searchQuery, setSearchQuery] = useState("");

  // Memoize the filtered list so it only recalculates when the query changes
  const filteredAndSortedGames = useMemo(() => {
    // First, filter based on search query
    const lowerQuery = searchQuery.toLowerCase();
    const filtered = displayGames.filter((game) =>
      game.toLowerCase().includes(lowerQuery),
    );

    // Second, sort: Real games first, then alphabetically
    return filtered.sort((a, b) => {
      const aIsReal = realGames.includes(a);
      const bIsReal = realGames.includes(b);

      if (aIsReal && !bIsReal) return -1; // a comes first
      if (!aIsReal && bIsReal) return 1; // b comes first
      return a.localeCompare(b); // both same status, sort alphabetically
    });
  }, [searchQuery]);

  return (
    <div
      className="min-h-screen w-full bg-slate-900 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200 relative overflow-x-hidden"
      style={{
        backgroundImage: `radial-gradient(rgba(148, 163, 184, 0.08) 2px, transparent 2px)`,
        backgroundSize: "24px 24px",
      }}
    >
      {/* Soft top glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-64 bg-indigo-500/10 blur-[120px] pointer-events-none rounded-full" />

      <div className="relative z-10 p-6 md:p-10 lg:p-12 w-full max-w-[1600px] mx-auto flex flex-col h-full">
        {/* Header Section */}
        <header className="mb-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 from-indigo-500 to-teal-400 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white rotate-3 shrink-0">
              <svg
                className="w-8 h-8 -rotate-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-4xl font-extrabold text-slate-50 tracking-tight">
                Game<span className="text-indigo-400">Hub</span>
              </h1>
              <p className="text-slate-400 font-medium mt-1 text-sm">
                Select a game to start playing
              </p>
            </div>
          </div>

          {/* Search & Stats Container */}
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
            {/* Search Bar */}
            <div className="relative w-full sm:w-80">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg
                  className="w-5 h-5 text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search games..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-slate-800/60 border border-slate-700/50 text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-slate-800 backdrop-blur-md transition-all placeholder:text-slate-500 shadow-inner"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>

            {/* Ready Stats (Hidden on mobile to save space, visible on SM and up) */}
            <div className="hidden sm:flex items-center gap-2 px-5 py-3 bg-slate-800/80 rounded-xl border border-slate-700/50 backdrop-blur-sm shrink-0 shadow-sm">
              <div className="w-2.5 h-2.5 bg-teal-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(45,212,191,0.6)]" />
              <span className="text-sm font-semibold text-slate-300">
                {realGames.length} Ready
              </span>
            </div>
          </div>
        </header>

        {/* Main Grid */}
        <main className="flex-1 w-full">
          {filteredAndSortedGames.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-8">
              {filteredAndSortedGames.map((game, index) => (
                <GameTile key={game} title={game} index={index} />
              ))}
            </div>
          ) : (
            <div className="w-full h-64 flex flex-col items-center justify-center text-slate-500 bg-slate-800/30 rounded-3xl border border-slate-800 border-dashed mt-8">
              <svg
                className="w-16 h-16 mb-4 text-slate-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-xl font-semibold text-slate-400">
                No games found
              </p>
              <p className="text-sm mt-1">Try a different search term</p>
              <button
                onClick={() => setSearchQuery("")}
                className="mt-6 px-4 py-2 bg-indigo-500/10 text-indigo-400 font-medium rounded-lg hover:bg-indigo-500/20 transition-colors"
              >
                Clear Search
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
