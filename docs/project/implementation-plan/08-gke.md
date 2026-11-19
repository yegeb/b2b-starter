# 08 · Build, GKE workloads and one HTTPS entry point

**Assignment.** Infrastructure owns deployment. Backend and frontend supply tested commands and build inputs from A5 and R2–R3. Use architecture §§2.1 and 3.1. Release the backend before the storefront when static generation needs a seeded API.

| Owner | Resources | Boundary |
| --- | --- | --- |
| Terraform | Zonal Standard GKE cluster, node pool, Artifact Registry, Cloud Build access, external address and certificate prerequisites | Place the cluster and data VMs in the selected zone. Cap nodes at two. Specify 50 GiB per node disk. |
| Kubernetes manifests | Migration Job, three Deployments, API and storefront ClusterIP Services, API HPA, Gateway, hostname routes, health policies and workload service accounts | Give the worker no public Service. Use one immutable backend image digest for server and worker modes. |
| GKE Gateway controller | Generated forwarding rule, proxy, URL map, backends and health checks for this Gateway | Check one HTTPS entry point. Do not define the same generated resources in Terraform. |

| ID | Depends on | Task and acceptance evidence |
| --- | --- | --- |
| K1 | A5, R2, G1 | Build backend and storefront with the pinned toolchain and frozen lockfile. Separate backend build from storefront build if needed. Keep runtime secrets out of image layers. Run each artifact with its production start command. Record digests and required build-time public values. |
| K2 | G2–G4 | Create one zonal cluster with one e2-standard-2 node for normal use. Measure allocatable CPU/memory after system workloads. Budget requests for store, API, worker, migration and rollout surge. Check peak scheduling on at most two nodes, including required redundancy during updates. Reprice if the baseline cannot fit. |
| K3 | K1 backend image, K2, R3 | Run migrations with the release job. Require a successful job before rolling out API and worker with separate identities, config, startup/readiness probes and resource requests. Verify job success, healthy replicas, worker consumption and restart. Repeat the release on existing data. |
| K4 | K3, A5, G1 domain control | Provision the single shared HTTPS Gateway and two hostname routes. Use a supported certificate method for the chosen GatewayClass. Send API/Admin to Medusa and shop to Next.js. Establish DNS and certificate readiness. Seed the publishable key, finish the storefront build and roll it out. Verify both hostnames, CORS, login cookies, Admin assets, catalog and quote detail through the public entry point. |
| K5 | K4, R2 | Configure API CPU requests and HPA bounds that fit K2. Keep storefront and worker fixed. Verify metrics availability. Run a controlled ramp and capture HPA conditions, actual replica counts, pending pods and a return to baseline. Save a fixed-replica manifest or overlay for comparison. |

**Recovery and evidence.** Keep previous image digests, resource requests, successful release job and migration compatibility notes. Test a failing readiness probe with an isolated release. Restore the prior application version if its schema remains compatible. Record DNS answers, certificate state, routing status, pod placement and worker isolation. [GKE Gateway](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/deploying-gateways) · [Horizontal autoscaling](https://cloud.google.com/kubernetes-engine/docs/concepts/horizontalpodautoscaler) · [Cluster autoscaler](https://cloud.google.com/kubernetes-engine/docs/concepts/cluster-autoscaler)
