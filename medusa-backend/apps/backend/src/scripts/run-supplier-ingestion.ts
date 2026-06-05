import { runSupplierIngestionPipeline } from "../ingestion/supplier-pipeline/pipeline"
import type { SupplierIngestionStage } from "../ingestion/supplier-pipeline/pipeline"

type CliOptions = {
  suppliersCsvPath: string
  supplierName?: string
  stages?: SupplierIngestionStage[]
  productLimit?: number
  timeoutMs?: number
  debug: boolean
  debugOutputDir?: string
}

function optionValue(arg: string) {
  const [, ...parts] = arg.split("=")
  return parts.join("=")
}

function parseStages(value?: string) {
  if (!value) {
    return undefined
  }

  const stages = value
    .split(",")
    .map((stage) => stage.trim())
    .filter(Boolean)

  const allowed = new Set(["discover", "index", "extract"])

  stages.forEach((stage) => {
    if (!allowed.has(stage)) {
      throw new Error(`Unknown ingestion stage "${stage}"`)
    }
  })

  return stages as SupplierIngestionStage[]
}

function parseOptions(): CliOptions {
  const options: CliOptions = {
    suppliersCsvPath:
      process.env.SUPPLIER_INGESTION_SUPPLIERS_CSV ??
      "../../../research/dental-suppliers.csv",
    supplierName: process.env.SUPPLIER_NAME,
    stages: parseStages(process.env.SUPPLIER_INGESTION_STAGES),
    productLimit: process.env.PRODUCT_PAGE_LIMIT
      ? Number(process.env.PRODUCT_PAGE_LIMIT)
      : undefined,
    timeoutMs: process.env.PRODUCT_PAGE_TIMEOUT_MS
      ? Number(process.env.PRODUCT_PAGE_TIMEOUT_MS)
      : undefined,
    debug: process.env.SUPPLIER_INGESTION_DEBUG === "1",
    debugOutputDir: process.env.SUPPLIER_INGESTION_DEBUG_DIR,
  }

  for (const arg of process.argv.slice(2)) {
    if (arg === "--debug") {
      options.debug = true
      continue
    }

    if (arg.startsWith("--suppliers-csv=")) {
      options.suppliersCsvPath = optionValue(arg)
    }

    if (arg.startsWith("--supplier=")) {
      options.supplierName = optionValue(arg)
    }

    if (arg.startsWith("--stages=")) {
      options.stages = parseStages(optionValue(arg))
    }

    if (arg.startsWith("--limit=")) {
      options.productLimit = Number(optionValue(arg))
    }

    if (arg.startsWith("--timeout-ms=")) {
      options.timeoutMs = Number(optionValue(arg))
    }

    if (arg.startsWith("--debug-output-dir=")) {
      options.debugOutputDir = optionValue(arg)
    }
  }

  return options
}

async function run() {
  const result = await runSupplierIngestionPipeline(parseOptions())

  console.log(JSON.stringify(result.summary, null, 2))
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
