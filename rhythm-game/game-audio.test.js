import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("./_next/static/chunks/3i738334mbht2.js", import.meta.url),
  "utf8",
);

function keptWhenSong(hits, endAt, quietSong) {
  const limit = endAt + 1 - 0.02;
  return hits.filter((hit) => (quietSong ? hit.time >= limit : hit.kind === "wood" || hit.time >= limit));
}

test("歌曲播放時不再疊電子踢鼓和軍鼓，校正也不再出聲", () => {
  assert.equal(source.includes("burst(e+.09*t,3200"), false);
  assert.equal(source.includes('"kick"===e.kind||"snare"===e.kind||"wood"===e.kind'), false);
  assert.equal(source.includes('"demo"===i.kind||e.accent'), true);
  assert.equal(source.includes("echoCancellation:!1"), true);
  assert.equal(source.includes("noiseSuppression:!1"), true);
  assert.equal(source.includes("autoGainControl:!1"), true);
  assert.equal(source.includes("聽到拍手"), true);
  assert.equal(source.includes("bundledBpm"), true);
  assert.equal(source.includes("181.2"), true);
});

test("麥克風加歌曲不留任何合成打擊，點螢幕的聽題目仍留木魚", () => {
  const hits = ["wood", "kick", "snare", "hat", "lead"].map((kind) => ({ kind, time: 1.2 }));
  assert.deepEqual(
    keptWhenSong(hits, 8, true).map((hit) => hit.kind),
    [],
  );
  assert.deepEqual(
    keptWhenSong(hits, 8, false).map((hit) => hit.kind),
    ["wood"],
  );
  assert.equal(
    source.includes('this.quietSong?e.time>=s-.02:"wood"===e.kind||e.time>=s-.02'),
    true,
  );
  assert.equal(source.includes('t.quietSong="mic"===ee.input&&!!a'), true);
  assert.equal(source.includes("this.master&&this.master.connect(c,0,1)}catch"), false);
  assert.equal(source.includes("playedAt.some"), true);
  assert.equal(source.includes("lastExcess"), true);
});
