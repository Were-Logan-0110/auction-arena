import { useEffect } from "react";
import { useGame } from "./store/useGame";
import Home from "./screens/Home";
import Lobby from "./screens/Lobby";
import GameScreen from "./screens/GameScreen";
import MatchScreen from "./screens/MatchScreen";

export default function App() {
  const screen = useGame((s) => s.screen);
  const loadPool = useGame((s) => s.loadPool);
  const error = useGame((s) => s.error);
  const clearError = useGame((s) => s.clearError);

  useEffect(() => {
    loadPool();
  }, [loadPool]);

  return (
    <div className="bg-arena min-h-screen">
      {error && (
        <div className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <div className="glass rounded-xl border-red-500/40 px-4 py-3 text-sm text-red-300 shadow-card">
            {error}
            <button
              className="ml-3 font-bold text-red-200 hover:text-white"
              onClick={clearError}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {screen === "home" && <Home />}
      {screen === "lobby" && <Lobby />}
      {screen === "game" && <GameScreen />}
      {screen === "match" && <MatchScreen />}
    </div>
  );
}
