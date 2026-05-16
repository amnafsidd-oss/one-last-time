/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("admin");
  collection.listRule = "@request.auth.is_admin = true";
  collection.viewRule = "@request.auth.is_admin = true";
  collection.createRule = "@request.auth.is_admin = true";
  collection.updateRule = "@request.auth.is_admin = true";
  collection.deleteRule = "@request.auth.is_admin = true";
  return app.save(collection);
}, (app) => {
  try {
  const collection = app.findCollectionByNameOrId("admin");
  collection.listRule = null;
  collection.viewRule = null;
  collection.createRule = null;
  collection.updateRule = null;
  collection.deleteRule = null;
  return app.save(collection);
  } catch (e) {
    if (e.message.includes("no rows in result set")) {
      console.log("Collection not found, skipping revert");
      return;
    }
    throw e;
  }
})