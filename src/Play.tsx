import { useParams, useNavigate } from "react-router";

export default function Play() {
  const { gameId } = useParams();
  const navigate = useNavigate();

  return (
    <div className="w-screen h-screen bg-black flex flex-col overflow-hidden">
      <div className="h-14 bg-neutral-900 flex items-center px-6 border-b border-neutral-800 shrink-0">
        <button
          onClick={() => navigate("/")}
          className="text-neutral-400 hover:text-white flex items-center gap-2 transition-colors font-medium"
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
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Lobby
        </button>
        <h2 className="text-white font-bold ml-auto mr-auto tracking-wide">
          {gameId}
        </h2>
        <div className="w-20"></div>
      </div>

      <div className="flex-1 w-full relative">
        <iframe
          src={`/Games/${gameId}/index.html`}
          className="absolute inset-0 w-full h-full border-none"
          title={gameId}
          allow="fullscreen"
        />
      </div>
    </div>
  );
}
