# GCP implementation roadmap

**Implementation starts with A1 and A3.** Local trials reproduced the quote, approval and checkout flows and identified two repairs. In a disposable copy, all 15 HTTP cases passed after the test-fixture and order-summary updates. A role check in the storefront restored the buyer's sent quote. Apply the repairs to the application and repeat the checks on the implementation revision. [Application evidence](01-application.md)

The ten briefs specify the implementation backlog. Local observations cover the application and selected process boundaries. The cloud-facing briefs specify interfaces, dependencies and acceptance tests. The account owner must supply quota, credit, DNS and sender evidence before a deployed trial. Follow the [release sequence](10-integration.md) when building.

The [course requirements](<../CMPE 48A Term Project.pdf>) govern acceptance. The [tentative architecture](../tentative-cloud-architecture.pdf) governs the design. The package manifests and source at `fc5f49ab9e05fee4c094c9d7a5a79f6c950d2935` govern claims about the application. This was the fetched main revision on 19 November 2026. Track work on the roadmap in [issue #15](https://github.com/yegeb/b2b-starter/issues/15).

## GitHub tracking

[Issue #15](https://github.com/yegeb/b2b-starter/issues/15) is the parent
for the ten workstream issues linked below. Each issue contains task IDs and
acceptance checks from its brief. The [milestones](https://github.com/yegeb/b2b-starter/milestones)
follow the seven gates in the [release sequence](10-integration.md). Some
workstream issues span gates, so their milestone does not replace the release
sequence.

Before starting a task, check its current issue, related PRs, and milestone on
GitHub. Record implementation evidence and blockers in the owning brief and
the issue. Update the task checklist when its acceptance criteria are met.
Create a sub-issue when a task needs its own owner, PR, or acceptance check.
Link the new issue to its parent, task ID, dependencies, and relevant brief.
Keep labels, milestones, and any project board current. Close an issue when its
outcome is complete. Close a milestone when its release gate is verified and
its assigned work is complete. If GitHub is unavailable, report pending updates
and reconcile them when access returns.

## Research sequence and coverage

Work on one brief at a time. The sequence below orders investigations. The [release sequence](10-integration.md) orders implementation across those investigations.

| Session | Lead | Prerequisite evidence | Course or architecture coverage | Current state |
| --- | --- | --- | --- | --- |
| [01 · Application baseline](01-application.md) ([#16](https://github.com/yegeb/b2b-starter/issues/16)) | Backend, then frontend | Course brief and source revision | Buyers, approvers, merchants, existing code, test fixtures | API journeys and build pair exercised. Original suite and buyer UI need the tested repairs. |
| [02 · Redis and processes](02-runtime.md) ([#17](https://github.com/yegeb/b2b-starter/issues/17)) | Backend | 01 process entry points and tests | API/Admin, worker, PostgreSQL migrations, Redis coordination | Temporary two-API trial verified session sharing, queued delivery, lock contention and workflow resumption. VM recovery open. |
| [03 · Business events](03-events.md) ([#18](https://github.com/yegeb/b2b-starter/issues/18)) | Backend | 01 transitions and 02 worker boundary | Redis-backed application events, worker bridge, two Pub/Sub topics | Commerce transition sources traced. Outbox and replay trials pending. |
| [04 · Notifications](04-notifications.md) ([#19](https://github.com/yegeb/b2b-starter/issues/19)) | Backend | 03 notification contract | Notification function and email delivery | Test delivery proposed. Provider evidence open. |
| [05 · Quote documents](05-documents.md) ([#20](https://github.com/yegeb/b2b-starter/issues/20)) | Backend, then frontend | 01 quote trace and 03 document contract | Quote function, private PDFs, authorized downloads | Version and access design proposed. |
| [06 · Product images](06-images.md) ([#21](https://github.com/yegeb/b2b-starter/issues/21)) | Backend, then infrastructure | 01 catalog and worker inputs | Originals, Eventarc, image function, catalog, private results | Admin upload and attachment traced in the installed packages. Processing trial pending. |
| [07 · Foundation and VMs](07-foundation.md) ([#22](https://github.com/yegeb/b2b-starter/issues/22)) | Infrastructure | 02–06 identities and access needs | VPC, IAM, Terraform, dedicated data VMs and persistent disks | Topology specified. Account checks open. |
| [08 · GKE and HTTPS](08-gke.md) ([#23](https://github.com/yegeb/b2b-starter/issues/23)) | Infrastructure | 01 build inputs and 07 network | Images, registry, three Deployments, API HPA, HTTPS entry point | Build ordering tested locally. Scheduling, TLS and HPA trials pending. |
| [09 · Performance and cost](09-evaluation.md) ([#24](https://github.com/yegeb/b2b-starter/issues/24)) | Infrastructure, then reviewer | 03–08 functional outcomes and resource limits | Locust, metrics, charts, cost and trial evidence | Experiment and ledger design proposed. |
| [10 · Integration and submission](10-integration.md) ([#25](https://github.com/yegeb/b2b-starter/issues/25)) | Coordinator, then reviewer | Findings and task IDs from 01–09 | Reproducible deployment, GitHub README, report, presentation, video | Task order and evidence checklist drafted. |

## Decisions and constraints

- Use one zonal GKE Standard cluster in `us-central1`. Deploy the storefront, Medusa API/Admin, and worker separately. Compare fixed API replicas with API HPA. Keep storefront replicas fixed for that comparison. The separate topology PNG labels a storefront HPA and omits two function paths. Retain the PDF's API experiment and all three functions.
- Use Terraform for GCP resources. Use versioned Kubernetes manifests for workloads, Services, Gateway and routes. Give the Gateway controller ownership of the generated load balancer resources. Assign resource ownership before writing Terraform.
- Keep PostgreSQL and Redis on separate private VMs. Keep functions outside the database network. Expose one public HTTPS entry point for the shop and API/Admin. Separate downloadable catalog assets from private original images, processing results, and quote PDFs.
- Use the PDF's $225 working target and $75 reserve against the $300 trial ceiling. Credit available today, domain control, quotas and sender access remain team-specific inputs. Record their status in 07–09. Do not count a pricing estimate as an account balance.

## How to close a brief

1. Read the cited sources and upstream briefs. Record the inspected commit, package version, official document link and consultation date.
2. Trace the named inputs to their outputs. Mark each conclusion **observed in source**, **observed at runtime**, **proposed**, or **blocked**. For a blocker, name the missing input, its owner, and affected task IDs.
3. Update the brief's task table. Keep one independently checkable outcome per ID. Record the owner, dependencies, files or resources, action, fixture, expected result, and evidence location. Keep task IDs stable.
4. Record the selected interface and any rejected alternative that materially affects cost, correctness, or course coverage. Bring any change to the PDF baseline to the team.
5. Add the check result, command or user action, date and evidence link to the brief. Use synthetic data. Keep secrets outside reports and logs. Advance the index to the next session once the reviewer can reproduce the finding or identify its precise blocker.

Keep the roadmap and findings here. During implementation, link the resulting deployment assets, test results, release revision, and report figures from the owning brief. Use the release sequence as the shared backlog.
