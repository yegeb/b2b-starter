# GCP implementation roadmap

**Next session — application baseline.** Start with A1 in [01 · Application baseline](01-application.md). The quote journey has a source trace. It still needs a disposable local runtime and an observed buyer-to-merchant round trip. The other briefs are research assignments with proposed build tasks. A task becomes ready to build when its brief contains evidence for the relevant decisions.

The [course requirements](<../CMPE 48A Term Project.pdf>) govern acceptance. The [tentative architecture](../tentative-cloud-architecture.pdf) governs the design. The package manifests and source at `fc5f49ab9e05fee4c094c9d7a5a79f6c950d2935` govern claims about the application. This was the fetched main revision on 19 November 2026. Track work on the roadmap in [issue #15](https://github.com/yegeb/b2b-starter/issues/15).

## Research sequence and coverage

Work on one brief at a time. The sequence below orders investigations. The [release sequence](10-integration.md) orders implementation across those investigations.

| Session | Lead | Prerequisite evidence | Course or architecture coverage | Current state |
| --- | --- | --- | --- | --- |
| [01 · Application baseline](01-application.md) | Backend, then frontend | Course brief and source revision | Buyers, approvers, merchants, existing code, test fixtures | Source audit recorded. Runtime checks open. |
| [02 · Redis and processes](02-runtime.md) | Backend | 01 process entry points and tests | API/Admin, worker, PostgreSQL migrations, Redis coordination | Package inventory recorded. Provider behavior open. |
| [03 · Business events](03-events.md) | Backend | 01 transitions and 02 worker boundary | Redis-backed application events, worker bridge, two Pub/Sub topics | Candidate contracts ready for validation. |
| [04 · Notifications](04-notifications.md) | Backend | 03 notification contract | Notification function and email delivery | Test delivery proposed. Provider evidence open. |
| [05 · Quote documents](05-documents.md) | Backend, then frontend | 01 quote trace and 03 document contract | Quote function, private PDFs, authorized downloads | Version and access design proposed. |
| [06 · Product images](06-images.md) | Backend, then infrastructure | 01 catalog and worker inputs | Originals, Eventarc, image function, catalog, private results | Storage boundaries proposed. |
| [07 · Foundation and VMs](07-foundation.md) | Infrastructure | 02–06 identities and access needs | VPC, IAM, Terraform, dedicated data VMs and persistent disks | Topology specified. Account checks open. |
| [08 · GKE and HTTPS](08-gke.md) | Infrastructure | 01 build inputs and 07 network | Images, registry, three Deployments, API HPA, HTTPS entry point | Release and routing design proposed. |
| [09 · Performance and cost](09-evaluation.md) | Infrastructure, then reviewer | 03–08 functional outcomes and resource limits | Locust, metrics, charts, cost and trial evidence | Experiment and ledger design proposed. |
| [10 · Integration and submission](10-integration.md) | Coordinator, then reviewer | Findings and task IDs from 01–09 | Reproducible deployment, GitHub README, report, presentation, video | Task order and evidence checklist drafted. |

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
