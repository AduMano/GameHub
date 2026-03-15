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
      className="absolute inset-0 w-full h-full object-cover z-0 opacity-60 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
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
          <stop offset="0%" stopColor={`hsl(${baseHue}, 80%, 15%)`} />
          <stop
            offset="100%"
            stopColor={`hsl(${(baseHue + 40) % 360}, 80%, 35%)`}
          />
        </linearGradient>
        <pattern
          id={`grid-${index}`}
          x="0"
          y="0"
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="2" cy="2" r="1" fill="rgba(255,255,255,0.05)" />
        </pattern>
      </defs>

      <rect width="400" height="225" fill={`url(#grad-${index})`} />
      <rect width="400" height="225" fill={`url(#grid-${index})`} />

      <circle
        cx={cx}
        cy={cy}
        r={shapeSize}
        fill={`hsl(${accentHue}, 80%, 50%)`}
        opacity="0.4"
      />

      <polygon points="0,225 400,225 400,160 0,190" fill="rgba(0,0,0,0.6)" />
    </svg>
  );
}

function GameTile({ title, index }: { title: string; index: number }) {
  const isReal = realGames.includes(title);
  const route = isReal ? `/play/${title}` : "#";

  return (
    <Link
      to={route}
      className={`relative block w-full aspect-video bg-neutral-900 rounded-xl border-4 transition-all duration-300 overflow-hidden shadow-2xl group ${
        isReal
          ? "border-transparent hover:border-white hover:-translate-y-2 cursor-pointer"
          : "border-neutral-800 hover:border-neutral-600 cursor-not-allowed opacity-80"
      }`}
      onClick={(e) => {
        if (!isReal) e.preventDefault();
      }}
    >
      <FakeMedia index={index} />

      <div className="absolute inset-0 from-black/95 via-black/40 to-transparent z-10" />

      <div className="absolute bottom-0 left-0 p-6 z-20 w-full flex justify-between items-end">
        <div className="flex-1 min-w-0 pr-4">
          <h2 className="text-white font-black text-2xl uppercase tracking-widest truncate drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
            {title}
          </h2>
          <div className="mt-2 flex items-center gap-3">
            {isReal ? (
              <span className="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-sm uppercase tracking-wider shadow-[0_0_10px_rgba(220,38,38,0.5)]">
                Press Start
              </span>
            ) : (
              <span className="bg-neutral-700 text-neutral-300 text-xs font-bold px-3 py-1 rounded-sm uppercase tracking-wider">
                Place Holder
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 text-white/20 group-hover:text-white/40 transition-colors">
          <svg
            className="w-8 h-8"
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
  return (
    <div className="min-h-screen w-full bg-neutral-950 p-8 flex flex-col font-sans selection:bg-red-600 selection:text-white">
      <header className="mb-12">
        <h1 className="text-6xl font-black text-white uppercase tracking-tighter drop-shadow-sm">
          UX GAMES
        </h1>
        <div className="h-1.5 w-32 bg-red-600 mt-6 rounded-full shadow-[0_0_15px_rgba(220,38,38,0.8)]" />
      </header>

      <main className="flex-1 w-full">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-8 w-full">
          {displayGames.map((game, index) => (
            <GameTile key={game} title={game} index={index} />
          ))}
        </div>
      </main>
    </div>
  );
}
