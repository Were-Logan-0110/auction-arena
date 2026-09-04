import { io } from "socket.io-client";

const URL = `http://localhost:${process.env.AUCTION_PORT ?? "8137"}`;
const host = io(URL);
const guest = io(URL);

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
  // pre-register listeners before triggering events
  const createdP = waitEvent(host, "created");
  host.emit("create", { mode: 5, name: "HostA" });
  const created = await createdP;
  console.log("created room", created.code, "host idx", created.idx);

  const oppJoinedP = waitEvent(host, "opponent_joined");
  const joinedP = waitEvent(guest, "joined");
  guest.emit("join", { code: created.code, name: "GuestB" });
  const joined = await joinedP;
  const opp = await oppJoinedP;
  console.log("guest joined idx", joined.idx, "| host saw opponent:", opp.name);

  const stateGuestP = waitEvent(guest, "state");
  const stateHostP = waitEvent(host, "state");
  host.emit("start");
  const state1 = await stateGuestP;
  const state2 = await stateHostP;
  console.log("game started:", state1.names.join(" vs "), "rounds:", state1.rounds.length, "budget:", state1.budgets[0]);

  const firstTurn = state1.turn;
  const actor = firstTurn === 0 ? host : guest;
  actor.emit("bid", { amount: 4 });
  const afterBid = await waitEvent(host, "state", (s) => s.lastBid === 4);
  console.log("bid accepted: lastBid", afterBid.lastBid, "bidder", afterBid.bidder, "turn", afterBid.turn);

  const responder = afterBid.turn === 0 ? host : guest;
  const foldP = waitEvent(host, "state", (s) => s.status === "round_done");
  responder.emit("fold");
  const afterFold = await foldP;
  const rw = afterFold.rounds[0].winner;
  console.log("fold ok: round winner", rw, "wonAmount", afterFold.rounds[0].wonAmount,
    "winner budget", afterFold.budgets[rw]);

  const nextP = waitEvent(host, "state", (s) => s.roundIdx === 1 || s.phase === "end");
  responder.emit("next");
  const afterNext = await nextP;
  console.log("next round ->", afterNext.phase === "end" ? "end" : "round " + (afterNext.roundIdx + 1));

  host.disconnect();
  guest.disconnect();
  console.log("ONLINE FLOW OK");
  process.exit(0);
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
