import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("./_next/static/chunks/3i738334mbht2.js", import.meta.url),
  "utf8",
);

test("歌曲播放時不再疊電子踢鼓和軍鼓，校正也不再出聲", () => {
  assert.equal(source.includes("burst(e+.09*t,3200"), false);
  assert.equal(source.includes('"kick"===e.kind||"snare"===e.kind||"wood"===e.kind'), false);
  assert.equal(source.includes('e=>"wood"===e.kind||e.time>=s-.02'), true);
  assert.equal(source.includes('"demo"===i.kind||e.accent'), true);
  assert.equal(source.includes("echoCancellation:!1"), true);
  assert.equal(source.includes("noiseSuppression:!1"), true);
  assert.equal(source.includes("autoGainControl:!1"), true);
  assert.equal(source.includes("聽到拍手"), true);
  assert.equal(source.includes("bundledBpm"), true);
  assert.equal(source.includes("181.2"), true);
});
