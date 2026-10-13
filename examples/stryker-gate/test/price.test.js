import test from "node:test";
import assert from "node:assert/strict";
import { price } from "../src/price.js";

test("above threshold gets discount", () => assert.equal(price(110,10),100));
test("below threshold stays at normal price", () => assert.equal(price(90,10),90));
test("exact threshold gets discount (real surviving mutant regression)", () => assert.equal(price(100,10),90));
