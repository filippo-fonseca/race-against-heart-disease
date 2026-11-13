import { test } from "node:test";
import assert from "node:assert/strict";
import { youtubeId } from "../../video";

test("youtubeId reads every common YouTube link form", () => {
  const id = "abcDEF12_-3";
  assert.equal(youtubeId(id), id);
  assert.equal(youtubeId(`https://www.youtube.com/watch?v=${id}&t=12s`), id);
  assert.equal(youtubeId(`https://youtu.be/${id}?si=xyz`), id);
  assert.equal(youtubeId(`https://www.youtube.com/shorts/${id}`), id);
  assert.equal(youtubeId(`https://www.youtube.com/embed/${id}`), id);
  assert.equal(youtubeId(`https://m.youtube.com/watch?v=${id}`), id);
  assert.equal(youtubeId(`youtube.com/live/${id}`), id);
  assert.equal(youtubeId(""), null);
  assert.equal(youtubeId(undefined), null);
  assert.equal(youtubeId("https://vimeo.com/123456"), null);
  assert.equal(youtubeId("https://www.youtube.com/watch?v=short"), null);
});
