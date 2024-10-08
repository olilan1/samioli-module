import { ClassicLevel } from "classic-level"
import * as fs from "node:fs/promises"
import { existsSync } from "node:fs"
import * as path from "node:path"

const DOCUMENT_DEFAULT = {
  type: "script",
  scope: "global",
  author: "samioli",
}

const PACK = "macros"

const dir = path.resolve(`./packs/${PACK}`)
const inputDir = path.resolve(`./macros`)

if (!existsSync(dir)) await fs.mkdir(dir)

for (const file of await fs.readdir(dir)) {
  const fp = path.join(dir, file)
  if ((await fs.lstat(fp)).isFile()) await fs.rm(fp)
}

const db = new ClassicLevel(dir, {
  keyEncoding: "utf8",
  valueEncoding: "json",
})
// if (db.status !== "open") throw new Error("DB is not open! Maybe locked?")
const batch = db.batch()

for (const file of await fs.readdir(inputDir)) {
  if (!file.endsWith(".js")) {
    continue;
  }

  const content = await fs.readFile(path.join(inputDir, file), {
    encoding: "utf-8",
  })

  const firstNewline = content.indexOf("\n")
  const firstLine = content.slice(0, firstNewline).trim()
  // Slice off comment start/end. No need to slice off whitespace, because JSON ignores whitespace characters
  const json = firstLine.slice(2, -2)

  const macro = content.slice(firstNewline + 1)

  let doc
  try {
    doc = { ...DOCUMENT_DEFAULT, ...JSON.parse(json) }
  } catch (e) {
    throw new Error(
      `${file} doesn't match expected format.\nFirst line has to be "/* <json> */".\nIs: "${firstLine}"`,
      { cause: e }
    )
  }
  doc.command = macro

  batch.put(`!macros!${doc._id}`, doc)
}

await batch.write()
await compactClassicLevel(db)
await db.close()

async function compactClassicLevel(db) {
  const forwardIterator = db.keys({ limit: 1, fillCache: false })
  const firstKey = await forwardIterator.next()
  await forwardIterator.close()

  const backwardIterator = db.keys({
    limit: 1,
    reverse: true,
    fillCache: false,
  })
  const lastKey = await backwardIterator.next()
  await backwardIterator.close()

  if (firstKey && lastKey)
    return db.compactRange(firstKey, lastKey, { keyEncoding: "utf8" })
}
