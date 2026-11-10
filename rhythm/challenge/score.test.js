/* 無輸入、每格都打、照拍子打。三種輸入方式都走同一條計分。 */
var assert = require("assert");
var score = require("./score.js");

var bpm = 120;
var beatMs = 60000 / bpm;
var respondStartMs = 20000;
var respondEndMs = respondStartMs + 8 * beatMs;
var ids = ["q", "qr", "ee", "q", "q", "qr", "ee", "q"];
var expected = score.expectedBeats(ids);
var windowBeats = 0.18;
var modes = ["tap", "key", "mic"];

function atBeats(beats, mode, level) {
  return beats.map(function (beat) {
    return {
      mode: mode,
      phase: "respond",
      timeMs: respondStartMs + beat * beatMs,
      level: level == null ? 0.8 : level,
      key: " ",
      repeat: false,
      onControl: false
    };
  });
}

function grade(mode, events) {
  var actual = score.collectActualBeats({
    mode: mode,
    events: events,
    bpm: bpm,
    respondStartMs: respondStartMs,
    respondEndMs: respondEndMs,
    maskUntilMs: respondStartMs,
    threshold: score.DEFAULT_THRESHOLD,
    cooldownMs: score.HIT_COOLDOWN_MS
  });
  return score.gradeRound(ids, actual, windowBeats);
}

function gridBeats() {
  var beats = [];
  for (var i = 0; i < 32; i++) beats.push(i * 0.25);
  return beats;
}

var demoLeak = expected.map(function (beat) {
  return {
    mode: "mic",
    phase: "demo",
    timeMs: respondStartMs - 5000 + beat * beatMs,
    level: 0.95,
    key: "",
    repeat: false,
    onControl: false
  };
});

var results = {};
modes.forEach(function (mode) {
  var noneEvents = mode === "mic" ? demoLeak.slice() : [];
  var none = grade(mode, noneEvents);
  var mash = grade(mode, atBeats(gridBeats(), mode, 0.9));
  var good = grade(mode, atBeats(expected, mode, 0.9));
  results[mode] = { none: none, mash: mash, good: good };
  assert.strictEqual(none.score, 0, mode + " 無輸入應為 0");
  assert.strictEqual(none.stars, 0, mode + " 無輸入應為 0 星");
  assert.strictEqual(none.unlocksNext, false, mode + " 無輸入不能開下一關");
  assert.ok(mash.score <= 40, mode + " 每格都打應偏低，實際 " + mash.score);
  assert.strictEqual(mash.stars, 0, mode + " 每格都打不能有星");
  assert.strictEqual(mash.unlocksNext, false, mode + " 每格都打不能開下一關");
  assert.ok(good.score >= 90, mode + " 照拍子打應高分，實際 " + good.score);
  assert.strictEqual(good.score, 100, mode + " 打在拍點上應為 100");
  assert.strictEqual(good.stars, 3);
  assert.strictEqual(good.unlocksNext, true);
});

assert.deepStrictEqual(results.tap.good.marks, ["ok", "rest", "ok", "ok", "ok", "rest", "ok", "ok"]);
assert.deepStrictEqual(results.tap.none.marks, ["bad", "rest", "bad", "bad", "bad", "rest", "bad", "bad"]);
assert.strictEqual(results.tap.none.score, results.mic.none.score);
assert.strictEqual(results.tap.mash.score, results.key.mash.score);
assert.strictEqual(results.key.good.score, results.mic.good.score);

var leaked = grade("mic", atBeats(expected, "mic", 0.95));
assert.strictEqual(leaked.score, 100, "若把示範整段聽進去，會得到滿分");
var almost = atBeats(expected, "mic", 0.95);
almost[almost.length - 1].level = 0.05;
var almostGrade = grade("mic", almost);
assert.ok(almostGrade.score >= 80 && almostGrade.score < 100, "漏掉一下的示範回授會落在九十上下，實際 " + almostGrade.score);

var gate = score.createMicGate({ threshold: 0.2, cooldownMs: 50 });
assert.strictEqual(gate.sample(0, 0.05), false);
assert.strictEqual(gate.sample(10, 0.19), false);
assert.strictEqual(gate.sample(20, 0.4), true);
assert.strictEqual(gate.sample(40, 0.8), false);
assert.strictEqual(gate.sample(80, 0.8), true);
gate.maskUntil(200);
assert.strictEqual(gate.sample(150, 0.9), false);
assert.strictEqual(gate.sample(200, 0.9), true);

var noisy = [];
for (var t = 0; t < 8; t += 0.05) {
  noisy.push({
    phase: "respond",
    timeMs: respondStartMs + t * beatMs,
    level: 0.08
  });
}
assert.strictEqual(grade("mic", noisy).score, 0, "背景噪音不該算打擊");

assert.strictEqual(grade("key", [{
  phase: "respond",
  timeMs: respondStartMs,
  key: " ",
  repeat: true,
  onControl: false
}]).score, 0, "按住空白鍵的連發不算");

assert.strictEqual(grade("tap", [{
  phase: "respond",
  timeMs: respondStartMs,
  key: "",
  repeat: false,
  onControl: true
}]).score, 0, "按到按鈕不算拍打");

assert.strictEqual(score.scorePerformance([0], [0.18], 0.18).score, 100);
assert.strictEqual(score.scorePerformance([0], [0.25], 0.18).score, 0);
assert.strictEqual(score.scorePerformance([0, 0.1], [0.05], 0.18).hits, 1);

for (var level = 0; level < 5; level++) {
  for (var seed = 1; seed <= 20; seed++) {
    var built = score.buildLevel(level, score.createRng(seed * 100 + level));
    assert.strictEqual(built.ids.length, 8);
    assert.ok(built.photoIndex >= 0 && built.photoIndex < 8);
    assert.ok(built.teacherIndex >= 0 && built.teacherIndex < 6);
    assert.ok(score.expectedBeats(built.ids).length >= 4);
  }
}

var lines = ["模式\t無輸入\t每格都打\t照拍子打"];
modes.forEach(function (mode) {
  var row = results[mode];
  lines.push([
    mode,
    row.none.score + "分/" + row.none.stars + "星",
    row.mash.score + "分/" + row.mash.stars + "星",
    row.good.score + "分/" + row.good.stars + "星"
  ].join("\t"));
});
var twenty = [];
for (var note = 0; note < 20; note++) twenty.push(note * 0.25);
var heardNineteen = twenty.slice(0, 19);
var about95 = score.scorePerformance(twenty, heardNineteen, 0.18);
var twentySilent = score.scorePerformance(twenty, [], 0.18);
assert.strictEqual(about95.score, 95, "20 下示範漏 1 下應為 95");
assert.strictEqual(twentySilent.score, 0);
assert.strictEqual(about95.stars, 3);
assert.strictEqual(twentySilent.stars, 0);
assert.strictEqual(twentySilent.unlocksNext, false);

lines.push("示範整段被聽進去\t" + leaked.score + " 分");
lines.push("8 下示範漏 1 下\t" + almostGrade.score + " 分");
lines.push("20 下示範漏 1 下\t" + about95.score + " 分");
lines.push("同一段完全不打\t" + twentySilent.score + " 分");
console.log(lines.join("\n"));
