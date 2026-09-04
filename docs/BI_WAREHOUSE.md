# BI Warehouse Export

The analytics warehouse contract is defined in `src/services/warehouseExport.ts`. It is intentionally a pure schema and row-builder module: Firebase clients and Cloud Functions produce source data, while BigQuery ingestion is provisioned separately.

## Tables

| Table | Grain | Partition | Clusters |
| --- | --- | --- | --- |
| `dim_apartments` | One current apartment per `apartment_id` | `published_at` | `agency_id`, `area`, `status` |
| `dim_brokers` | One current broker per `broker_id` | None | `agency_id`, `agency_role` |
| `fct_leads` | One lead creation per `lead_id` | `created_at` | `agency_id`, `source`, `assigned_broker_id` |
| `fct_deals` | One deal per `deal_id` | `created_at` | `agency_id`, `source`, `status`, `broker_id` |
| `fct_marketing_costs` | One campaign spend record per `spend_id` and `period` | None | `agency_id`, `source`, `period` |

All fact and dimension rows carry `agency_id`. Sources are normalized to the canonical values in `src/types/analytics.ts`; unknown values become `other`. Monetary values are non-negative, and commission rates are stored as ratios such as `0.02` for 2%.

## Firebase setup

1. Create a BigQuery dataset in the same Google Cloud project as Firebase, for example `campustay_analytics`.
2. Enable the BigQuery API and grant the Firebase service account permission to write to the dataset.
3. Install the Firebase **Stream Firestore to BigQuery** extension for the source collections:
   - `apartments` -> staging apartment records
   - `users` -> staging broker records
   - `leads` -> staging lead records
   - `deals` -> staging deal records
   - `campaign_spends` -> staging marketing cost records
4. Keep extension staging tables immutable and build the five curated tables from the schemas in `BIGQUERY_ANALYTICS_SCHEMAS` using scheduled queries or Dataform.
5. Deduplicate each source by its document ID and latest update timestamp before loading curated tables. Do not use client-side collection scans as the warehouse feed.
6. Schedule the curated-table queries after the Firestore export window. Restrict every executive query by `agency_id`.

## Metric rules

- Funnel rates are calculated as `next_step / current_step`; a zero denominator returns `0`.
- Broker win rate is `closed deals / negotiated deals`, not closed deals / all assigned deals.
- Marketing ROI ratio is `attributed revenue / spend`; zero spend returns `0`.
- Weighted forecast is `deal value * commission rate * agency-configured stage probability` and excludes closed or lost deals.
- The agency pipeline configuration is stored at `agencies/{agencyId}/settings/pipeline_config`. Missing or invalid values use the defaults in `DEFAULT_AGENCY_PIPELINE_CONFIG`.
- Raw event data remains the audit source. Materialized summaries are the application read model; BigQuery is the reporting and historical analysis layer.
