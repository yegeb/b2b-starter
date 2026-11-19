# 08 · Build, GKE workloads and one HTTPS entry point

**Assignment.** Infrastructure owns deployment. Backend and frontend supply tested commands and build inputs from A5 and R2–R3. Use architecture §§2.1 and 3.1. Release the backend before the storefront when static generation needs a seeded API.

| Owner | Resources | Boundary |
| --- | --- | --- |
| Terraform | Zonal Standard GKE cluster, node pool, Artifact Registry, Cloud Build access, external address and certificate prerequisites | Place the cluster and data VMs in the selected zone. Cap nodes at two. Specify 50 GiB per node disk. |
| Kubernetes manifests | Migration Job, three Deployments, API and storefront ClusterIP Services, API HPA, Gateway, hostname routes, health policies and workload service accounts | Give the worker no public Service. Use one immutable backend image digest for server and worker modes. |
| GKE Gateway controller | Generated forwarding rule, proxy, URL map, backends and health checks for this Gateway | Check one HTTPS entry point. Do not define the same generated resources in Terraform. |

## First release and repeat releases

**Observed at runtime, 19 November 2026.** A5 built both packages against a seeded API. The offline Next build failed during collection-page data collection. The API and worker can share `.medusa/server`, including `public/admin/index.html`. Package the resolved production dependencies with that directory. Start it from that directory with `medusa start`. Start Next from its workspace with `next start -p 8000`. The build defines the public API URL and channel key used by the storefront. [A5 results](01-application.md) · [Medusa production artifact](https://docs.medusajs.com/learn/build)

1. Build and record the backend digest. Apply the cluster foundation, workload identities and secrets references.
2. Run the versioned migration Job with that digest. Wait for completion. Block the rollout on failure. Deploy API and worker separately.
3. Create the Gateway with the API hostname first. Confirm health, TLS, seeded region, sales channel and key. The storefront image build needs a reachable API address from its build executor.
4. Build the shop against that HTTPS API. Roll out its digest, Service and hostname route on the same Gateway. Check an authenticated buyer and merchant in separate browser sessions.
5. For a repeat release, check old-app/schema compatibility before migration. Keep the previous digests available. Warm the API before allowing traffic or rebuilding Next. Use one migration Job per release digest.

**Routing decision.** Target `gke-l7-global-external-managed`, one reserved global address and port 443. Terraform owns Certificate Manager DNS authorization, certificate and certificate map for both hostnames. Reference the map via the Gateway's `networking.gke.io/certmap` annotation. Use one HTTPRoute per hostname. GKE Gateway does not infer load-balancer health checks from pod readiness. Define HealthCheckPolicy objects against both Services. Test Medusa `/health` and a stable unauthenticated shop path returning 200. Check `Programmed` for Gateway and `Accepted`/`ResolvedRefs` per route. Verify the node pool can schedule one rolling surge or use an explicitly tested rollout policy. [Gateway TLS](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/secure-gateway) · [Gateway health checks](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/deploying-gateways)

| ID | Depends on | Task and acceptance evidence |
| --- | --- | --- |
| K1 | A5, R2, G2 registry | Build the backend image and verify the storefront image recipe against a seeded test API. K4 builds the release storefront digest with the live API hostname and channel key. Keep runtime secrets out of image layers. Run each artifact with its production start command. Record digests and required build-time public values. |
| K2 | G2 network, G1 quota | Create one zonal cluster with one e2-standard-2 node for normal use. Measure allocatable CPU/memory after system workloads. Budget requests for store, API, worker, migration and rollout surge. Check peak scheduling on at most two nodes, including required redundancy during updates. Reprice if the baseline cannot fit. |
| K3 | K1 backend image, K2, R3, G3, G4 | Run migrations with the release job. Require a successful job before rolling out API and worker with separate identities, config, startup/readiness probes and resource requests. Verify job success, healthy replicas, worker consumption and restart. Repeat the release on existing data. |
| K4 | K3, A5, G1 domain control | Provision the single shared HTTPS Gateway and two hostname routes. Use a supported certificate method for the chosen GatewayClass. Send API/Admin to Medusa and shop to Next.js. Establish DNS and certificate readiness. Seed the publishable key, finish the storefront build and roll it out. Verify both hostnames, CORS, login cookies, Admin assets, catalog and quote detail through the public entry point. |
| K5 | K4, R2 | Configure API CPU requests and HPA bounds that fit K2. Keep storefront and worker fixed. Verify metrics availability. Run a controlled ramp and capture HPA conditions, actual replica counts, pending pods and a return to baseline. Save a fixed-replica manifest or overlay for comparison. |

**Recovery and evidence.** Keep previous image digests, resource requests, successful release job and migration compatibility notes. Test a failing readiness probe with an isolated release. Restore the prior application version if its schema remains compatible. Record DNS answers, certificate state, routing status, pod placement and worker isolation. [GKE Gateway](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/deploying-gateways) · [Horizontal autoscaling](https://cloud.google.com/kubernetes-engine/docs/concepts/horizontalpodautoscaler) · [Cluster autoscaler](https://cloud.google.com/kubernetes-engine/docs/concepts/cluster-autoscaler)
