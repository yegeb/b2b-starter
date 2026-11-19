# 10 · Implementation order and course submission

**Assignment.** Coordinator maintains task order. Reviewer checks evidence against the course brief. Each task's owner and acceptance test live in its numbered brief. Research proceeds in brief order. Build work follows the dependencies below.

| Milestone | Work and prerequisites | Acceptance gate |
| --- | --- | --- |
| 1 · Establish local behavior | Complete [A1–A5](01-application.md). Trace the original application before changing transitions. | Reproducible quote, approval and checkout evidence. Known authorization and build gaps have owners. |
| 2 · Separate the processes | Complete [R1–R3](02-runtime.md). Reuse the backend image for API and worker. | Cross-replica sign-in, worker consumption, Redis recovery and migration replay verified locally. |
| 3 · Add durable integrations | Complete [E1–E4](03-events.md), then local [N1–N3](04-notifications.md), [Q1–Q4](05-documents.md) and [I1](06-images.md). Implement I3 image conversion and I4 worker/catalog logic against local storage fixtures. Include the merchant action and any schema migration in the release source before K1. | A committed transition produces its intended effect. Replay and partial failure preserve the correct logical result. No function requires a private database connection. |
| 4 · Provision the foundation | Complete G1 and the initial P4 forecast before provisioning. Apply G2, then provision K2 so test pods can verify G3–G4 identities and private access. Complete G5 on isolated restore targets. [Foundation](07-foundation.md) · [Forecast](09-evaluation.md) | Private connectivity, access boundaries, isolated restore and reviewed cost estimate. Record remaining trial hours and credit. |
| 5 · Deploy workloads and functions | Use K1’s backend digest and the K2 cluster to run K3. Bring up the K4 API route. Build the release storefront against that seeded API and finish K4. [GKE release](08-gke.md). Deploy [N4](04-notifications.md), [Q5](05-documents.md) and [I2–I4](06-images.md). Run I3 and I4 acceptance with real object generations after I2. Rebuild and redeploy affected images and apply compatible migrations if this trial requires code changes. | Two hostnames on one HTTPS entry point. A buyer sees the reviewed PDF, an approver gets the intended test notification, and the catalog shows the processed image. Direct private document reads fail. |
| 6 · Measure and recover | Verify [K5](08-gke.md), then [P1–P4](09-evaluation.md). Rehearse a restart, recovery and costed shutdown. | Fixed and HPA run data, async completion evidence, preserved state and updated ledger. |
| 7 · Reproduce and submit | Complete D1–D4 below. | A second teammate can reproduce the deployed system from the repository and explain the observed results. |

## Release review on 19 November 2026

The [application run](01-application.md) supplies real test inputs for E1, Q1 and P1. API approval and checkout succeeded. The original HTTP test command and ordinary buyer account screen failed. Both fixes passed their targeted checks in a disposable copy. Keep their implementation and clean-checkout verification in milestone 1. Verify independently on a clean checkout before using that journey as a success metric.

| Gate | Evidence artifact to record at implementation | Condition to advance |
| --- | --- | --- |
| Local baseline | A1 suite counts, A3 role-specific UI and HTTP observations, A5 online/offline builds | All original assertions execute, the ordinary buyer sees the sent revision, and the approver retains the correct queue. |
| Worker integrations | R2 process-tagged results, E4 replay log, N3 receipt, Q2 parsed sample, local stale-image-result fixture | One logical effect per committed business key. Recovery succeeds after a worker restart. |
| First cloud run | G1 authorization and cost ledger, G2 reviewed Terraform plan, K3 Job and digests, K4 public checks and deployed I4 generation pair | One Gateway, three workload Deployments, two private data VMs and three function outcomes. Reserve at least one approved session for D2 reproduction. |
| Submission | D2 clean-checkout record, P2 paired CSVs/figures, P3 end-to-end completion times, P4 spend and forecast, D4 video duration | A second team member can trace each rubric claim to the deployed revision. Include that revision, not credentials, in the GitHub README and report. |

Use staged dependencies for local and deployed tests. N2/Q2 can use test adapters before G3. E4 local replay validates handler behavior. Verify the actual trigger policy during N4/Q5. I1 defines the upload contract locally. Provision I2 after G2–G3 and complete the deployed reconciliation after K3. G5 uses isolated restore targets. K4 and P1 both depend on the buyer UI fix. A separate reviewer checked the ten briefs, the index, both PDFs and the cited application revision on 19 November 2026. The review corrected the I4 release order, the local image gate, concurrent quote edits, the credit comparison and the course originality evidence. Implementation, deployed checks and human partner review remain pending.

## Reproduction and evidence

| ID · owner | Depends on | Task and acceptance evidence |
| --- | --- | --- |
| D1 · Coordinator | Milestones 1–5 including G5, K4, N4, Q5 and I4 | Write the root README deployment procedure. Include tool versions, project and DNS prerequisites, state bootstrap, infrastructure plan/apply, secret provisioning, image builds, migration, seed, deployments, functions, health checks, workload generator and session shutdown. Link real scripts and manifests at the implemented commit. |
| D2 · Reviewer | D1 | Start from a clean checkout in an authorized environment. Use the README to reach shop, Admin, worker, both private VMs and all three function outcomes. Record failures and fix the owning task. Record which resources stop billing and which remain chargeable after shutdown. Preserve required evidence and backups. |
| D3 · Coordinator | D2, P2–P4 | Assemble the final diagram, component interactions, deployment procedure, Locust configuration, charts, interpretation, limitations and actual cost breakdown. Put the application, Terraform, manifests, Locust scripts and replication README in the submission repo. Link each claim to a run ID, figure or source file. Cite the upstream starter and baseline commit. Identify the team-authored cloud design, Terraform, manifests, functions, integrations and experiment scripts by repository path and revision. |
| D4 · Reviewer | D3 | Rehearse the in-class presentation. Record a demo of at most two minutes. Show one buyer/merchant flow, a function result and scaling evidence. Check runtime, readability and links from the final submission. |

## Final review against the rubric

| Requirement | Evidence to link here during implementation |
| --- | --- |
| Original cloud work and reused source | Upstream license and starter revision, team design decisions and changes implementing each cloud component. |
| Scalable Kubernetes workloads | Three Deployments, API HPA manifest, scheduling and scaling observations, HTTPS smoke. |
| Functional VMs | PostgreSQL and Redis VM definitions, disk mounts, application use, backup and isolated recovery results. |
| Google Cloud Functions | Three deployed second-generation function configurations, triggers and end-to-end outcome for each. |
| Performance evaluation | Locust source, representative traffic, independent/dependent variables, raw CSV, aligned resource telemetry, charts and interpretation. |
| Reproducibility and Terraform bonus | Repository revision, clean-checkout record, Terraform files and provider lock, manifests, README and resource inventory. |
| Report and budget | Final architecture diagram, changes from tentative design, deployment procedure and actual spend reconciled to the $300 credit. |
| Presentation and video | Presentation rehearsal and playable demo with duration at or below two minutes. |

**Closure rule.** Record the actual verification date and artifact at each gate. Keep an open requirement visible when only a plan, fixture or static inspection exists. Reconcile the diagram and the cost ledger to the system the team actually deploys. [Course brief](<../CMPE 48A Term Project.pdf>)
