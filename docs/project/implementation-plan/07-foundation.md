# 07 · Terraform, private network and data services

**Assignment.** Infrastructure owns this brief. Use the permission requirements from 02–06 and architecture §§2–3. Verify team-specific prerequisites before scheduling a cloud session. Do not put secret values in Terraform outputs or the cost worksheet.

| Inventory | Proposed ownership and boundary | Proof to retain |
| --- | --- | --- |
| Project, state, APIs | Team confirms project, billing status, trial expiry and remaining credit. Bootstrap restricted remote Terraform state separately. Terraform enables required services and pins provider versions. | Redacted project checklist, quota headroom, state access policy, provider lockfile and repeatable plan. |
| VPC, subnet, routes | Terraform owns regional subnet, pod/service ranges, Private Google Access, router/NAT and firewall rules. One zone for nodes and data VMs. Private data hosts have no external IP. | Source/destination/port matrix, route inspection and allowed/denied connection results. |
| Service identities | Use workload identities for API and worker. Separate function runtime, trigger, build and release identities. Restrict database and migration credentials separately. | Actor → resource → permitted operation matrix and one successful and one denied test for each sensitive storage boundary. |
| Compute and disks | PostgreSQL on e2-medium and Redis on e2-small, each with persistent data disk. Confirm boot plus data disks fit the 70 GiB aggregate allowance. Set mount persistence, service startup and versioned configuration. | Disk inventory, daemon status after VM restart, private connection and preserved fixture. |
| Managed resources | Terraform owns storage buckets, two topics, function resources, triggers, secrets metadata, registry and budget alerts. Assign generated service resources to their owning controller. | Terraform plan reviewed for duplicate resources, public access and secret handling. Inventory resources retained between sessions. |

| ID | Depends on | Infrastructure task and verification |
| --- | --- | --- |
| G1 | Index budget and 02–06 access matrix | Record available trial credit and expiration, zone capacity, organization policies, domain control, quota for VMs/IPs/GKE/functions and IAM prerequisites. Produce the baseline cost worksheet before deployment. Mark unknowns with owner and affected task. |
| G2 | G1 | Define Terraform bootstrap, version constraints, state access and service enablement. Create the VPC, subnet, egress and firewall design. Run `terraform fmt -check`, `terraform validate` and a reviewed plan. After provisioning, a repeat plan should show no unintended changes. |
| G3 | G2, E2, N2, Q2, I1 | Bind identities per topic, bucket and secret. API accesses originals and quote downloads. Worker publishes events and reads image results. Notification reads its provider secret and writes private receipts. Image and PDF functions receive only their required object permissions. Validate each identity without printing credentials. |
| G4 | G2, R1 | Configure PostgreSQL and Redis startup and data disks. Limit data ports to authorized application sources. Use authenticated connections, restricted runtime grants and a separate migration role. Verify authorized connections from a workload and denied access from an unrelated source. |
| G5 | G3, G4, R3 | Schedule database backup, Redis persistence and recovery. Restore to isolated resources using a synthetic business record and pending job. Compare IDs and recovered state. Record elapsed restore time, data-loss window, retained disk cost and recovery limitations of single-zone VMs. |

**Handoff.** Give 08 the VPC, ranges, identities, registry, private endpoints, release credentials reference, and secret names. Give 09 the billable inventory and actual start/stop timestamps. [Terraform GCS backend](https://developer.hashicorp.com/terraform/language/backend/gcs) · [GKE workload identities](https://cloud.google.com/kubernetes-engine/docs/concepts/workload-identity) · [Cloud NAT](https://cloud.google.com/nat/docs/overview) · [Pricing calculator](https://cloud.google.com/products/calculator)
