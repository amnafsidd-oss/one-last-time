/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("payments");
  collection.indexes = collection.indexes.filter(idx => !idx.includes("idx_payments_sessionId"));
  collection.fields.removeByName("sessionId");
  return app.save(collection);
}, (app) => {
  try {

  const collection = app.findCollectionByNameOrId("payments");
  collection.fields.add(new TextField({
    name: "sessionId",
    required: true,
    min: 0,
    max: 0
  }));
  collection.indexes.push("CREATE UNIQUE INDEX idx_payments_sessionId ON payments (sessionId)");
  return app.save(collection);
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("Collection not found, skipping revert");
      return;
    }
    throw e;
  }
})
