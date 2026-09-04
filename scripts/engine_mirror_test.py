import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import server

assert len(server.POOL["GK"]) > 0, "GK pool empty"
s = server.create_state(5, ["A", "B"])
assert s["phase"] == "round" and len(s["rounds"]) == 5
assert s["budgets"] == [100.0, 100.0]
assert server.VISIBLE_FLOOR <= s["rounds"][0]["visible"]["overall"] <= 97, s["rounds"][0]["visible"]["overall"]
assert s["rounds"][0]["hidden"]["id"] != s["rounds"][0]["visible"]["id"], "hidden duplicates visible"

# over many draws the pool should hit both an average card and a star
ratings = [server.create_rounds(list(s["formation"]), set())[0]["visible"]["overall"] for _ in range(200)]
assert min(ratings) <= 80 and max(ratings) >= 86, (min(ratings), max(ratings))

# simulate a full bidding exchange then fold
ok = server.open_bid(s, 3.0)
assert ok and s["status"] == "response" and s["lastBid"] == 3.0
assert not server.open_bid(s, 4.0), "should be response phase now"
ok = server.raise_bid(s, 4.5)
assert ok and s["lastBid"] == 4.5
ok = server.fold_bid(s)
assert ok and s["status"] == "round_done" and s["rounds"][0]["winner"] == s["rounds"][0]["bids"][-1]["by"]
assert s["budgets"][s["rounds"][0]["winner"]] == 95.5

# invalid raise too small
s2 = server.create_state(5, ["A", "B"])
server.open_bid(s2, 5.0)
assert not server.raise_bid(s2, 5.0), "raise must be >= last + step"
server.raise_bid(s2, 6.0)
assert s2["lastBid"] == 6.0

# next must never skip a round that is still being bid on (double-tap guard)
s3 = server.create_state(5, ["A", "B"])
assert not server.next_round(s3), "cannot advance while round is still bidding"
server.open_bid(s3, 1.0)
assert not server.next_round(s3), "cannot advance during response"
server.fold_bid(s3)
assert server.next_round(s3), "should advance after a finished round"
assert s3["roundIdx"] == 1 and len(s3["squads"][0]) + len(s3["squads"][1]) == 2
# advancing again while the new round is bidding must be a no-op
assert not server.next_round(s3), "double advance must be rejected"

print("engine mirror OK")
