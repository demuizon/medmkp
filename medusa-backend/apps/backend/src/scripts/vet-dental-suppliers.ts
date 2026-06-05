import {
  defaultSupplierVettingOutputDir,
  writeSupplierVettingOutputs,
} from "../ingestion/supplier-vetting"

const inputPath = process.argv[2]
const outputDir = process.argv[3] ?? defaultSupplierVettingOutputDir()

if (!inputPath) {
  throw new Error(
    "Usage: ts-node src/scripts/vet-dental-suppliers.ts <supplier-csv-path> [output-dir]"
  )
}

const result = writeSupplierVettingOutputs(inputPath, outputDir)

console.log(
  JSON.stringify(
    {
      total_rows: result.total_rows,
      unique_leads: result.unique_leads,
      classification_counts: result.classification_counts,
      output_paths: result.output_paths,
    },
    null,
    2
  )
)
