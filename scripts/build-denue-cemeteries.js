"use strict";

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

function parseCsvLine(text) {
  const row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else {
      field += character;
    }
  }
  row.push(field.replace(/\r$/, ""));
  return row;
}

function clean(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

async function readCemeteries(csvPath, onCemetery) {
  const lines = readline.createInterface({
    input: fs.createReadStream(csvPath, {encoding: "latin1"}),
    crlfDelay: Infinity,
  });
  let column = null;
  for await (const line of lines) {
    const row = parseCsvLine(line);
    if (!column) {
      column = Object.fromEntries(row.map((name, index) => [name, index]));
      continue;
    }
    if (!/^81232\d$/.test(row[column.codigo_act])) continue;
    const item = {
        id: clean(row[column.id]),
        name: clean(row[column.nom_estab]),
        stateCode: clean(row[column.cve_ent]).padStart(2, "0"),
        state: clean(row[column.entidad]),
        municipalityCode: clean(row[column.cve_mun]).padStart(3, "0"),
        municipality: clean(row[column.municipio]),
        colony: clean(row[column.nomb_asent]),
        latitude: Number(row[column.latitud]),
        longitude: Number(row[column.longitud]),
    };
    if (item.id && item.name && item.stateCode && item.municipalityCode &&
        Number.isFinite(item.latitude) && Number.isFinite(item.longitude)) {
      onCemetery(item);
    }
  }
}

const inputPaths = process.argv.slice(2);
if (inputPaths.length === 0) {
  throw new Error("Indica al menos un archivo CSV de DENUE.");
}

async function main() {
  const unique = new Map();
  for (const csvPath of inputPaths) {
    await readCemeteries(csvPath, (item) => unique.set(item.id, item));
  }
  const output = {
    source: "INEGI DENUE 05/2026",
    sourceDate: "2026-05-20",
    activityCodes: ["812321", "812322"],
    generatedAt: new Date().toISOString(),
    cemeteries: [...unique.values()].sort((a, b) =>
      a.stateCode.localeCompare(b.stateCode) ||
      a.municipalityCode.localeCompare(b.municipalityCode) ||
      a.name.localeCompare(b.name, "es")),
  };
  const outputPath = path.resolve(
      __dirname, "..", "data", "cemeteries-inegi-2026.json");
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, JSON.stringify(output));
  console.log(`Catálogo generado: ${output.cemeteries.length} panteones`);
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
