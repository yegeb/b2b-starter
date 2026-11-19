# 10 · Implementation order and course submission

**Assignment.** Coordinator maintains task order. Reviewer checks evidence against the course brief. Each task's owner and acceptance test live in its numbered brief. Research proceeds in brief order. Build work follows the dependencies below.

| Milestone | Work and prerequisites | Acceptance gate |
| --- | --- | --- |
| 1 · Establish local behavior | Complete [A1–A5](01-application.md). Trace the original application before changing transitions. | Reproducible quote, approval and checkout evidence. Known authorization and build gaps have owners. |
| 2 · Separate the processes | Complete [R1–R3](02-runtime.md). Reuse the backend image for API and worker. | Cross-replica sign-in, worker consumption, Redis recovery and migration replay verified locally. |
| 3 · Add durable integrations | Complete [E1–E4](03-events.md), then local [N1–N3](04-notifications.md), [Q1–Q4](05-documents.md) and [I1](06-images.md). Use isolated fixtures and fake or local adapters for cloud-dependent steps. | A committed transition produces its intended effect. Replay and partial failure preserve the correct logical result. No function requires a private database connection. |
| 4 · Provision the foundation | Complete [G1–G5](07-foundation.md). Check the [P4](09-evaluation.md) forecast before provisioning. Bootstrap state, network, data VMs, registry, secrets and identities. | Private connectivity, access boundaries, isolated restore and reviewed cost estimate. Record remaining trial hours and credit. |
| 5 · Deploy workloads and functions | Build and deploy [K1–K4](08-gke.md). Deploy [N4](04-notifications.md), [Q5](05-documents.md) and [I2–I4](06-images.md). Repeat local integration checks on deployed resources. | Two hostnames on one HTTPS entry point. A buyer sees the reviewed PDF, an approver gets the intended test notification, and the catalog shows the processed image. Direct private document reads fail. |
| 6 · Measure and recover | Verify [K5](08-gke.md), then [P1–P4](09-evaluation.md). Rehearse a restart, recovery and costed shutdown. | Fixed and HPA run data, async completion evidence, preserved state and updated ledger. |
| 7 · Reproduce and submit | Complete D1–D4 below. | A second teammate can reproduce the deployed system from the repository and explain the observed results. |

## Reproduction and evidence

| ID · owner | Depends on | Task and acceptance evidence |
| --- | --- | --- |
| D1 · Coordinator | Milestones 1–5 | Write the root README deployment procedure. Include tool versions, project and DNS prerequisites, state bootstrap, infrastructure plan/apply, secret provisioning, image builds, migration, seed, deployments, functions, health checks, workload generator and session shutdown. Link real scripts and manifests at the implemented commit. |
| D2 · Reviewer | D1 | Start from a clean checkout in an authorized environment. Use the README to reach shop, Admin, worker, both private VMs and all three function outcomes. Record failures and fix the owning task. Record which resources stop billing and which remain chargeable after shutdown. Preserve required evidence and backups. |
| D3 · Coordinator | D2, P2–P4 | Assemble the final diagram, component interactions, deployment procedure, Locust configuration, charts, interpretation, limitations and actual cost breakdown. Put the application, Terraform, manifests, Locust scripts and replication README in the submission repo. Link each claim to a run ID, figure or source file. |
| D4 · Reviewer | D3 | Rehearse the in-class presentation. Record a demo of at most two minutes. Show one buyer/merchant flow, a function result and scaling evidence. Check runtime, readability and links from the final submission. |

## Final review against the rubric

| Requirement | Evidence to link here during implementation |
| --- | --- |
| Scalable Kubernetes workloads | Three Deployments, API HPA manifest, scheduling and scaling observations, HTTPS smoke. |
| Functional VMs | PostgreSQL and Redis VM definitions, disk mounts, application use, backup and isolated recovery results. |
| Google Cloud Functions | Three deployed second-generation function configurations, triggers and end-to-end outcome for each. |
| Performance evaluation | Locust source, representative traffic, independent/dependent variables, raw CSV, aligned resource telemetry, charts and interpretation. |
| Reproducibility and Terraform bonus | Repository revision, clean-checkout record, Terraform files and provider lock, manifests, README and resource inventory. |
| Report and budget | Final architecture diagram, changes from tentative design, deployment procedure and actual spend reconciled to the $300 credit. |
| Presentation and video | Presentation rehearsal and playable demo with duration at or below two minutes. |

**Closure rule.** Record the actual verification date and artifact at each gate. Keep an open requirement visible when only a plan, fixture or static inspection exists. Reconcile the diagram and the cost ledger to the system the team actually deploys. [Course brief](<../CMPE 48A Term Project.pdf>)
