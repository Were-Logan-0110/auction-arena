import { io } from "socket.io-client";

const URL = `http://localhost:${process.env.AUCTION_PORT ?? "8137"}`;
const code = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitEvent = (s, ev, pred, timeoutMs = 8000) =>
  new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error(`timeout waiting ${ev}`)), timeoutMs);
    s.on(ev, function handler(msg) {
      if (!pred || pred(msg)) {
        clearTimeout(to);
        s.off(ev, handler);
        resolve(msg);
      }
    });
  });

async function main() {
  const client = io(URL);
  const rejoinedP = waitEvent(client, "rejoined", (m) => m.ok);
  const stateP = waitEvent(client, "state", (s) => s && s.rounds);
  client.emit("rejoin", { code, idx: 0 });
  const rejoined = await rejoinedP;
  const state = await stateP;
  console.log("rejoin ok idx", rejoined.idx, "| state round", state.roundIdx + 1, "| names", state.names.join(" vs "));
  client.disconnect();
  console.log("REJOIN OK");
  process.exit(0);
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
