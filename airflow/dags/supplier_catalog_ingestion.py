"""Airflow DAGs for MedMKP supplier catalog ingestion.

Generates one DAG per supplier so each catalog import can be scheduled,
paused, retried, and backfilled independently. Schedules are staggered
across Sunday morning; assign a small Airflow pool via
medmkp_supplier_ingest_pool to cap how many ingests run concurrently
(size it to 1 on the single-box NUC host: each ingest is a Node process
doing thousands of fetches).

Each DAG runs the ingestion as separate stage tasks
(discover >> index >> extract >> commit >> cleanup_state) so the UI shows
which stage is running. Stages share intermediate state through JSON files
in a per-run state directory; a failed stage can be retried without
re-running earlier stages, and cleanup_state removes the directory once
the run succeeds (it is kept on failure for debugging).

Expected Airflow Variables:
- medmkp_backend_dir: absolute path to medusa-backend/apps/backend
- medmkp_env_file: optional env file to source before running npm, defaults to .env
- medmkp_supplier_ingest_pool: optional Airflow pool, defaults to default_pool
- medmkp_supplier_ingest_commit: set to "false" for dry-run tasks, defaults to true
- medmkp_supplier_ingest_state_root: directory for inter-stage state files,
  defaults to <backend dir>/.medmkp/ingestion/airflow
- medmkp_product_matching_pool: optional Airflow pool for the global matcher,
  defaults to medmkp_supplier_ingest_pool
- medmkp_product_matching_commit: set to "false" for dry-run matching,
  defaults to true
"""

from __future__ import annotations

from datetime import datetime

from airflow import DAG
from airflow.models import Variable
from airflow.operators.bash import BashOperator

BACKEND_DIR = Variable.get("medmkp_backend_dir", default_var="/opt/medmkp/medusa-backend/apps/backend")
ENV_FILE = Variable.get("medmkp_env_file", default_var=".env")
POOL = Variable.get("medmkp_supplier_ingest_pool", default_var="default_pool")
COMMIT_ENABLED = Variable.get("medmkp_supplier_ingest_commit", default_var="true").lower() == "true"
MATCHING_POOL = Variable.get("medmkp_product_matching_pool", default_var=POOL)
MATCHING_COMMIT_ENABLED = Variable.get("medmkp_product_matching_commit", default_var="true").lower() == "true"
STATE_ROOT = Variable.get(
    "medmkp_supplier_ingest_state_root",
    default_var=f"{BACKEND_DIR}/.medmkp/ingestion/airflow",
)

STAGES = ["discover", "index", "extract", "commit"]
STATE_DIR_TEMPLATE = STATE_ROOT + "/{{ dag.dag_id }}/{{ ts_nodash }}"

SUPPLIERS = [
    {
        "name": "dc_dental",
        "supplier_id": "msup_dcdental_com",
        "schedule": "0 3 * * 0",
        "args": [
            "--max-links-per-source=500",
            "--max-dcdental-catalog-pages=30",
            "--source-concurrency=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=6",
            "--timeout-ms=30000",
        ],
    },
    {
        "name": "amerdental",
        "supplier_id": "msup_amerdental_com",
        "schedule": "0 4 * * 0",
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=4",
            # Shopify storefront throttles per IP; per-page extraction is only
            # the fallback behind products.json, keep it gentle.
            "--product-concurrency=6",
            "--timeout-ms=30000",
        ],
    },
    {
        "name": "carolina_dental",
        "supplier_id": "msup_carolinadental_com",
        "schedule": "0 5 * * 0",
        "args": [
            "--max-sitemaps-per-supplier=10",
            "--sitemap-concurrency=4",
            # Shopify storefront throttles per IP; per-page extraction is only
            # the fallback behind products.json, keep it gentle.
            "--product-concurrency=6",
            "--timeout-ms=30000",
        ],
    },
    {
        "name": "sky_dental",
        "supplier_id": "msup_skydentalsupply_com",
        "schedule": "0 6 * * 0",
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=12",
            "--timeout-ms=30000",
        ],
    },
    {
        "name": "shasta_dental",
        "supplier_id": "msup_shastadentalsupply_com",
        "schedule": "0 7 * * 0",
        "args": [
            "--max-shasta-catalog-pages=5000",
            "--product-concurrency=6",
            "--timeout-ms=45000",
        ],
    },
    {
        "name": "dental_city",
        "supplier_id": "msup_dentalcity_com",
        "schedule": "0 8 * * 0",
        "args": [
            "--max-sitemaps-per-supplier=5000",
            "--sitemap-concurrency=8",
            "--product-concurrency=12",
            "--timeout-ms=30000",
        ],
    },
    {
        "name": "dental_depot",
        "supplier_id": "msup_dentaldepotinc_com",
        "schedule": None,
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=6",
            "--timeout-ms=30000",
        ],
    },
    {
        "name": "dental_planet",
        "supplier_id": "msup_dentalplanet_com",
        "schedule": None,
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=6",
            "--timeout-ms=30000",
        ],
    },
    {
        "name": "dental_savings_club",
        "supplier_id": "msup_dentalsavingsclub_com",
        "schedule": None,
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=6",
            "--timeout-ms=30000",
        ],
    },
    {
        # Known Cloudflare bot-management block; keep a manual DAG for
        # visibility/backfills after a catalog feed or CSV path is available.
        "name": "frontier_dental",
        "supplier_id": "msup_frontierdental_com",
        "schedule": None,
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=2",
            "--product-concurrency=3",
            "--timeout-ms=30000",
        ],
    },
    {
        "name": "ids_dental",
        "supplier_id": "msup_idsdental_com",
        "schedule": None,
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=6",
            "--timeout-ms=30000",
        ],
    },
    {
        "name": "net32",
        "supplier_id": "msup_net32_com",
        "schedule": None,
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=6",
            "--timeout-ms=30000",
        ],
    },
    {
        "name": "parkell",
        "supplier_id": "msup_parkell_com",
        "schedule": None,
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=6",
            "--timeout-ms=30000",
        ],
    },
    {
        "name": "pearson_dental",
        "supplier_id": "msup_pearsondental_com",
        "schedule": "0 15 * * 0",
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--max-pearson-catalog-pages=5000",
            "--source-concurrency=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=6",
            "--timeout-ms=45000",
        ],
    },
    {
        "name": "practicon",
        "supplier_id": "msup_practicon_com",
        "schedule": None,
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=6",
            "--timeout-ms=30000",
        ],
    },
    {
        "name": "safco_dental",
        "supplier_id": "msup_safcodental_com",
        "schedule": "0 17 * * 0",
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=6",
            "--timeout-ms=30000",
        ],
    },
    {
        "name": "unimedusa",
        "supplier_id": "msup_unimedusa_com",
        "schedule": "0 18 * * 0",
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=6",
            "--timeout-ms=30000",
        ],
    },
    {
        "name": "young_specialties",
        "supplier_id": "msup_youngspecialties_com",
        "schedule": "0 19 * * 0",
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=6",
            "--timeout-ms=30000",
        ],
    },
    {
        "name": "zirc_dental_products",
        "supplier_id": "msup_zirc_com",
        "schedule": "0 20 * * 0",
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=6",
            "--timeout-ms=30000",
        ],
    },
]


def supplier_command(supplier: dict[str, object], stage: str) -> str:
    args = [
        f"--supplier-id={supplier['supplier_id']}",
        f"--stages={stage}",
        f"--state-dir={STATE_DIR_TEMPLATE}",
    ]
    if stage == "commit" and COMMIT_ENABLED:
        args.append("--commit")
    args.extend(supplier["args"])
    arg_string = " ".join(args)

    return f"""
set -euo pipefail
cd "{BACKEND_DIR}"
if [ -f "{ENV_FILE}" ]; then
  set -a
  . "{ENV_FILE}"
  set +a
fi
export DB_SSL="${{DB_SSL:-true}}"
export NODE_OPTIONS="${{NODE_OPTIONS:---max-old-space-size=8192}}"
npm run supplier:ingest:db -- {arg_string}
""".strip()


def backend_command(command: str) -> str:
    return f"""
set -euo pipefail
cd "{BACKEND_DIR}"
if [ -f "{ENV_FILE}" ]; then
  set -a
  . "{ENV_FILE}"
  set +a
fi
export DB_SSL="${{DB_SSL:-true}}"
export NODE_OPTIONS="${{NODE_OPTIONS:---max-old-space-size=8192}}"
{command}
""".strip()


def build_supplier_dag(supplier: dict[str, object]) -> DAG:
    with DAG(
        dag_id=supplier["name"],
        description=f"Import the {supplier['supplier_id']} catalog and public price snapshot into MedMKP.",
        start_date=datetime(2026, 1, 1),
        schedule=supplier["schedule"],
        catchup=False,
        max_active_runs=1,
        tags=["medmkp", "supplier-ingestion", supplier["supplier_id"]],
    ) as dag:
        previous = None
        for stage in STAGES:
            task = BashOperator(
                task_id=stage,
                bash_command=supplier_command(supplier, stage),
                pool=POOL,
                retries=1,
            )
            if previous is not None:
                previous >> task
            previous = task

        cleanup = BashOperator(
            task_id="cleanup_state",
            bash_command=f'rm -rf "{STATE_DIR_TEMPLATE}"',
        )
        previous >> cleanup
    return dag


def build_product_matching_dag() -> DAG:
    match_args = " -- --commit" if MATCHING_COMMIT_ENABLED else ""

    with DAG(
        dag_id="match_products",
        description="Rebuild auto canonical products and cross-supplier product matches after catalog ingestion.",
        start_date=datetime(2026, 1, 1),
        schedule="0 23 * * 0",
        catchup=False,
        max_active_runs=1,
        tags=["medmkp", "product-matching"],
    ) as dag:
        BashOperator(
            task_id="match_products",
            bash_command=backend_command(f"npm run products:match{match_args}"),
            pool=MATCHING_POOL,
            retries=1,
        )

    return dag


for supplier in SUPPLIERS:
    globals()[supplier["name"]] = build_supplier_dag(supplier)

match_products = build_product_matching_dag()
