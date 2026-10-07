#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const { join } = require("node:path");
const { realpathSync } = require("node:fs");

const release = realpathSync("/var/www/harajstation-releases/current");
process.chdir(release);
require(join(release, "node_modules", "next", "dist", "bin", "next"));
