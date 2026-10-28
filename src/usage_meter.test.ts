import test from "node:test";
import assert from "node:assert/strict";
import { decideAssetAdmission, parseAssetRequest } from "./usage_meter.ts";

test("a player asset is admitted when projected customer usage stays within quota", () => {
  const input = parseAssetRequest({ customerId: "guild-7", assetType: "player_asset", units: 2 });
  assert.deepEqual(decideAssetAdmission(input, 8, 10), {
    customerId: "guild-7",
    assetType: "player_asset",
    projectedUnits: 10,
    admitted: true,
  });
});

test("a live event is rejected when it would cross the customer quota", () => {
  const input = parseAssetRequest({ customerId: "guild-7", assetType: "live_event", units: 3 });
  assert.equal(decideAssetAdmission(input, 8, 10).admitted, false);
});
