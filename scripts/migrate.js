/**
 * OncoDoseRx — Database Migration Script
 */

"use strict";

const fs = require("fs");
const path = require("path");
const db = require("../services/database");

async function migrate() {
  console.log("Running database migrations...");

  try {
    await db.initDatabase();
    console.log("Migrations completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrate();
