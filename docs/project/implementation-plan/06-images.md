# 06 · Originals, resized catalog images and processing results

**Assignment.** Backend traces merchant upload and catalog publication. Infrastructure specifies storage, identity and trigger placement. Use A2–A3 and architecture §2.1. The seed already points at external product images. Demonstrate the new pipeline with a newly uploaded image while preserving existing product URLs. [Seed](../../../apps/backend/src/migration-scripts/initial-data-seed.ts) · [Frontend image configuration](../../../apps/storefront/next.config.js)

| Location | Write | Read | Trigger or consumer |
| --- | --- | --- | --- |
| Private originals | Authenticated merchant via API-authorized upload | Image function | Object-finalized Eventarc trigger on this bucket only |
| Catalog derivatives | Image function | Catalog browsers | Worker publishes the catalog URL through Medusa |
| Private processing results | Image function | Worker | Worker reconciles result with the current product/upload |
| Private quote documents | PDF function | Authorized API | Quote download. Separate permissions and retention. |

| ID · owner | Depends on | Task and acceptance evidence |
| --- | --- | --- |
| I1 · Backend | A2 | Trace the actual Medusa Admin upload and product attachment calls. Design the file-provider adapter or upload route around that entry point. Record merchant authorization, product association, size/type limits and a pending upload ID. Complete a synthetic upload without depending on the serving pod's filesystem. |
| I2 · Infrastructure | I1 | Assign separate access-controlled buckets. Place the original bucket, trigger and function in compatible locations. Scope finalization to originals. Set zero minimum and two maximum function instances. Grant trigger delivery and runtime roles independently. Verify a new original triggers exactly one logical job and a derivative creates no new job. |
| I3 · Backend | I1, I2 | Validate media contents, decoded dimensions and output limits. Generate catalog sizes and a private success/failure result keyed by original object and generation. Replay the same generation and inject invalid media. Verify stable derivatives or a bounded failure with no published image. |
| I4 · Backend + frontend | I3, R2 | Reconcile private results from the worker. Publish only the current upload's output through the product workflow. Check the storefront hostname rules. Replace an image, deliver its older result late and inspect the product thumbnail. The newer product image remains visible after refresh and worker restart. |

**Evidence.** Retain the synthetic upload ID, object generations, sizes, timestamps and final catalog URL. Verify anonymous reads of catalog derivatives and denied reads of originals and processing results. If project policies restrict public objects, record the supported catalog delivery path and reprice it before changing the design. [Storage triggers](https://docs.cloud.google.com/run/docs/triggering/storage-triggers) · [Storage access](https://cloud.google.com/storage/docs/access-control)
